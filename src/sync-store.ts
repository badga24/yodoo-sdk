import type {
  SyncCatalogueDTO,
  SyncEventDTO,
  SyncOfferDTO,
  SyncSnapshot,
} from "./types.js";

export interface SyncStoreOptions {
  /**
   * Renseigné par `YodooClient.sync(previousVersion)` : `true` si le digest du flux reçu est
   * identique à `previousVersion` (rien n'a changé côté commerce depuis la dernière sync).
   */
  unchanged?: boolean;
}

/**
 * Vue indexée d'un `SyncSnapshot` : lookup par id des catalogues / offres / événements du
 * commerce, résolus **en mémoire, sans appel réseau**. Retourné par `YodooClient.sync()`.
 *
 * Le contenu se limite à ce que porte le flux `GET /locale/app/v2/sync` : offres
 * **`VISIBLE` uniquement** (donc pas de champ `status`), prix et fichiers inline, contenu du
 * site vitrine. Pas de profil commerce (`getProvider()` reste un appel API), pas de
 * top-offres (`getTopOffers()`), détail événement réduit (`ticketOfferId` brut, pas de
 * `posts`). Un id absent du snapshot renvoie `undefined` — jamais de repli silencieux sur
 * l'API.
 *
 * Snapshot **figé** : l'instance ne se rafraîchit pas seule. Re-synchroniser = rappeler
 * `client.sync(store.version)` et repartir du store renvoyé (ou garder l'ancien tant que
 * `store.unchanged` est `true`).
 */
export class SyncStore {
  /** Le snapshot brut (POJO sérialisable) dont ce store est la vue indexée. */
  readonly snapshot: SyncSnapshot;
  /** `true` si ce store vient d'un `sync(previousVersion)` dont le digest correspondait. */
  readonly unchanged: boolean;

  private readonly cataloguesById: Map<string, SyncCatalogueDTO>;
  private readonly offersById: Map<string, SyncOfferDTO>;
  private readonly eventsById: Map<string, SyncEventDTO>;

  constructor(snapshot: SyncSnapshot, options: SyncStoreOptions = {}) {
    this.snapshot = snapshot;
    this.unchanged = options.unchanged ?? false;
    this.cataloguesById = new Map(snapshot.catalogues.map((c) => [c.id, c]));
    this.offersById = new Map(snapshot.offers.map((o) => [o.id, o]));
    this.eventsById = new Map(snapshot.events.map((e) => [e.id, e]));
  }

  /** Digest opaque du snapshot — à repasser tel quel à `client.sync()` pour détecter un no-op. */
  get version(): string {
    return this.snapshot.version;
  }

  /** Instant de génération du snapshot côté serveur (ISO 8601). */
  get generatedAt(): string {
    return this.snapshot.generatedAt;
  }

  /** Contenu HTML du site vitrine (clé → HTML). Map éventuellement vide. */
  get content(): Record<string, string> {
    return this.snapshot.content;
  }

  /** Catalogue par publicId, ou `undefined` s'il n'est pas dans le snapshot. */
  getCatalogue(id: string): SyncCatalogueDTO | undefined {
    return this.cataloguesById.get(id);
  }

  /** Tous les catalogues du commerce, dans l'ordre stable du flux (copie — sûre à trier/muter). */
  listCatalogues(): SyncCatalogueDTO[] {
    return [...this.snapshot.catalogues];
  }

  /** Offre par publicId (`VISIBLE` uniquement), ou `undefined`. */
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
    if (filter?.catalogue === undefined) return [...this.snapshot.offers];
    const wanted = new Set(
      Array.isArray(filter.catalogue) ? filter.catalogue : [filter.catalogue]
    );
    return this.snapshot.offers.filter(
      (o) => o.catalogueId !== null && wanted.has(o.catalogueId)
    );
  }

  /** Offres `VISIBLE` d'un catalogue — raccourci de `listOffers({ catalogue: catalogueId })`. */
  listCatalogueOffers(catalogueId: string): SyncOfferDTO[] {
    return this.listOffers({ catalogue: catalogueId });
  }

  /** Événement par publicId, ou `undefined`. */
  getEvent(id: string): SyncEventDTO | undefined {
    return this.eventsById.get(id);
  }

  /** Tous les événements du commerce, dans l'ordre stable du flux (copie). */
  listEvents(): SyncEventDTO[] {
    return [...this.snapshot.events];
  }

  /**
   * Offre-billet d'un événement, résolue contre les offres du snapshot. `undefined` si
   * l'événement n'a pas de billet (`ticketOfferId: null`) ou si l'offre-billet n'est pas
   * `VISIBLE` (donc absente du flux).
   */
  resolveTicket(event: SyncEventDTO): SyncOfferDTO | undefined {
    return event.ticketOfferId
      ? this.offersById.get(event.ticketOfferId)
      : undefined;
  }

  /**
   * Le snapshot brut, pour le persister (instance chaude, KV...) et reconstruire un
   * `SyncStore` sans appel réseau via `new SyncStore(snapshot)`.
   */
  toJSON(): SyncSnapshot {
    return this.snapshot;
  }
}
