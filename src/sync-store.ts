import type {
  SyncCatalogueDTO,
  SyncEventDTO,
  SyncMainSnapshot,
  SyncOfferDTO,
  SyncOthersSnapshot,
  SyncSnapshot,
} from "./types.js";

/** Par-flux : `true` si le flux correspondant n'a pas changé depuis la `version` fournie. */
export interface SyncUnchanged {
  main: boolean;
  others: boolean;
}

export interface SyncStoreOptions {
  /**
   * Renseigné par `YodooClient.sync()` / `refreshStore()` : pour chaque flux, `true` si le
   * digest reçu est identique à celui passé en `previousVersion`. Défaut : `{ main: false,
   * others: false }`.
   */
  unchanged?: Partial<SyncUnchanged>;
}

/**
 * Vue indexée d'un `SyncSnapshot` (les deux moitiés `sync/main` + `sync/others`) : lookup par
 * id des catalogues / offres / événements du commerce, résolus **en mémoire, sans appel
 * réseau**. Retourné par `YodooClient.sync()` / `getStore()`.
 *
 * Le contenu se limite à ce que portent les flux : offres **`VISIBLE` uniquement** (donc pas
 * de champ `status`), prix et fichiers inline, contenu du site vitrine, événements avec
 * `promotion` et `ticketOffer` résolus inline. Pas de profil commerce (`getProvider()` reste
 * un appel API), pas de top-offres (`getTopOffers()`), pas de `posts` d'événement. Un id
 * absent du snapshot renvoie `undefined` — jamais de repli silencieux sur l'API.
 *
 * Snapshot **figé** : l'instance ne se rafraîchit pas seule. Re-synchroniser (les deux flux
 * ou un seul) = `client.refreshStore()` / `refreshStore("main" | "others")`.
 */
export class SyncStore {
  /** Le snapshot brut (POJO sérialisable) dont ce store est la vue indexée. */
  readonly snapshot: SyncSnapshot;
  /** Par flux, `true` si rien n'a changé depuis la `version` passée au dernier (re)sync de ce flux. */
  readonly unchanged: SyncUnchanged;

  private readonly cataloguesById: Map<string, SyncCatalogueDTO>;
  private readonly offersById: Map<string, SyncOfferDTO>;
  private readonly eventsById: Map<string, SyncEventDTO>;

  constructor(snapshot: SyncSnapshot, options: SyncStoreOptions = {}) {
    this.snapshot = snapshot;
    this.unchanged = {
      main: options.unchanged?.main ?? false,
      others: options.unchanged?.others ?? false,
    };
    this.cataloguesById = new Map(
      snapshot.main.catalogues.map((c) => [c.id, c])
    );
    this.offersById = new Map(snapshot.main.offers.map((o) => [o.id, o]));
    this.eventsById = new Map(snapshot.others.events.map((e) => [e.id, e]));
  }

  /** Digests opaques par flux — à repasser tels quels à `client.sync()` / `refreshStore()`. */
  get version(): { main: string; others: string } {
    return { main: this.snapshot.main.version, others: this.snapshot.others.version };
  }

  /** Instant de génération de chaque flux côté serveur (ISO 8601) — deux lectures distinctes. */
  get generatedAt(): { main: string; others: string } {
    return {
      main: this.snapshot.main.generatedAt,
      others: this.snapshot.others.generatedAt,
    };
  }

  /** Contenu HTML du site vitrine (clé → HTML), du flux `sync/others`. Map éventuellement vide. */
  get content(): Record<string, string> {
    return this.snapshot.others.content;
  }

  /** Catalogue par publicId (flux `sync/main`), ou `undefined` s'il n'est pas dans le snapshot. */
  getCatalogue(id: string): SyncCatalogueDTO | undefined {
    return this.cataloguesById.get(id);
  }

  /** Tous les catalogues du commerce, dans l'ordre stable du flux (copie — sûre à trier/muter). */
  listCatalogues(): SyncCatalogueDTO[] {
    return [...this.snapshot.main.catalogues];
  }

  /** Offre par publicId (`VISIBLE` uniquement, flux `sync/main`), ou `undefined`. */
  getOffer(id: string): SyncOfferDTO | undefined {
    return this.offersById.get(id);
  }

  /**
   * Offres du commerce (`VISIBLE` uniquement), copie triable. `catalogue` filtre sur un ou
   * plusieurs publicId de catalogue (union) ; une offre sans catalogue (`catalogueId: null`)
   * n'est jamais retournée quand le filtre est posé. Un publicId inconnu ne lève pas d'erreur
   * (contrairement à `client.listOffers`) : il ne matche simplement rien. Pas de filtre
   * `group` — `OfferGroup` n'est pas dans le flux.
   */
  listOffers(filter?: { catalogue?: string | string[] }): SyncOfferDTO[] {
    if (filter?.catalogue === undefined) return [...this.snapshot.main.offers];
    const wanted = new Set(
      Array.isArray(filter.catalogue) ? filter.catalogue : [filter.catalogue]
    );
    return this.snapshot.main.offers.filter(
      (o) => o.catalogueId !== null && wanted.has(o.catalogueId)
    );
  }

  /** Offres `VISIBLE` d'un catalogue — raccourci de `listOffers({ catalogue: catalogueId })`. */
  listCatalogueOffers(catalogueId: string): SyncOfferDTO[] {
    return this.listOffers({ catalogue: catalogueId });
  }

  /** Événement par publicId (flux `sync/others`), ou `undefined`. */
  getEvent(id: string): SyncEventDTO | undefined {
    return this.eventsById.get(id);
  }

  /** Tous les événements du commerce, dans l'ordre stable du flux (copie). */
  listEvents(): SyncEventDTO[] {
    return [...this.snapshot.others.events];
  }

  /**
   * Offre-billet **complète** d'un événement (prix + fichiers), résolue contre les offres de
   * `sync/main` par `event.ticketOffer.id`. `undefined` si l'événement n'a pas de billet, ou
   * si le billet n'est pas `VISIBLE` (donc absent de `sync/main`), ou s'il vient d'être créé
   * et n'est pas encore dans le dernier `sync/main` téléchargé. Le nom / statut du billet
   * restent disponibles sans jointure via `event.ticketOffer`.
   */
  resolveTicket(event: SyncEventDTO): SyncOfferDTO | undefined {
    return event.ticketOffer
      ? this.offersById.get(event.ticketOffer.id)
      : undefined;
  }

  /**
   * Nouveau `SyncStore` avec la moitié `sync/main` remplacée (les événements / le contenu de
   * `sync/others` sont conservés). Sert au rafraîchissement partiel piloté par webhook.
   */
  withMain(main: SyncMainSnapshot, unchanged = false): SyncStore {
    return new SyncStore(
      { main, others: this.snapshot.others },
      { unchanged: { main: unchanged, others: this.unchanged.others } }
    );
  }

  /** Nouveau `SyncStore` avec la moitié `sync/others` remplacée (le `sync/main` est conservé). */
  withOthers(others: SyncOthersSnapshot, unchanged = false): SyncStore {
    return new SyncStore(
      { main: this.snapshot.main, others },
      { unchanged: { main: this.unchanged.main, others: unchanged } }
    );
  }

  /**
   * Le snapshot brut (`{ main, others }`), pour le persister (instance chaude, KV...) et
   * reconstruire un `SyncStore` sans appel réseau via `new SyncStore(snapshot)`.
   */
  toJSON(): SyncSnapshot {
    return this.snapshot;
  }
}
