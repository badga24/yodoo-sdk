import { HttpClient, type QueryParams } from "./http-client.js";
import { TokenProvider } from "./token-provider.js";
import { buildFileUrl } from "./file-url.js";
import { BoundedFileCache, type CachedFile } from "./file-cache.js";
import { toDomainError } from "./errors.js";
import { parseSyncResponse } from "./ndjson-sync.js";
import { SyncStore } from "./sync-store.js";
import type {
  CatalogueDetailDTO,
  CatalogueTileDTO,
  CreateOrderItemDTO,
  CustomerProfileDTO,
  EventDetailDTO,
  EventTileDTO,
  ContentResult,
  InvoiceDTO,
  ListOffersParams,
  OfferDetailDTO,
  OfferTileDTO,
  OrderDTO,
  PageDTO,
  PageParams,
  PayOrderByMobileMoneyParams,
  ProviderDetailDTO,
  TopOffersDTO,
  TopOffersParams,
} from "./types.js";

/** API-imposed page size ceiling (docs/sdk/locale-app-v2.md §1). */
const MAX_PAGE_SIZE = 30;

/** Seul backend Yodoo pris en charge — non configurable. */
const API_BASE_URL = "https://api.yodoo.space";

/** Taille par défaut du cache en mémoire de `getFile()` — voir `YodooClientOptions.fileCacheMaxBytes`. */
const DEFAULT_FILE_CACHE_MAX_BYTES = 50 * 1024 * 1024;

/** GET /locale/app/top-offers n'a pas d'équivalent v2 (docs/sdk/locale-app-v2.md §1) — reste sur v1. */
const V1_BASE = "/locale/app";
const V2_BASE = "/locale/app/v2";

export interface YodooClientOptions {
  /** Identifiant de l'app, fourni par le propriétaire du commerce (guide §1.1). */
  appId: string;
  /** Secret de l'app — ne jamais l'exposer côté navigateur (guide §1.4). */
  appSecret: string;
  /**
   * Taille max (en octets) du cache en mémoire de `getFile()`. Une entrée qui dépasse ce
   * budget à elle seule n'est pas mise en cache (pas d'erreur) ; les entrées les plus
   * anciennes sont évincées pour faire de la place aux nouvelles. `0` désactive la mise
   * en cache. Défaut : 50 Mo.
   */
  fileCacheMaxBytes?: number;
  /**
   * Lance un `sync()` dès la construction, **sans bloquer** (fire-and-forget). Le flux est
   * mémoïsé : `getStore()` renvoie ce même `SyncStore` une fois arrivé, ou la promesse encore
   * en vol si on l'appelle avant. Une erreur de ce sync initial n'est pas propagée par le
   * constructeur — elle ressurgit au prochain `getStore()`, qui relance alors le flux. Défaut :
   * `false`. Ne l'activer que pour une intégration qui va effectivement lire le store (pas pour
   * un client qui ne fait que `createOrder()` par ex.).
   */
  autoSync?: boolean;
}

function pageQuery(params?: PageParams): QueryParams {
  return {
    page: params?.page,
    size:
      params?.size !== undefined
        ? Math.min(params.size, MAX_PAGE_SIZE)
        : undefined,
    sort: params?.sort,
  };
}

/**
 * Client pour l'API Yodoo LocaleApp v2 (ROLE_LOCALE_APP) : lecture des données
 * du commerce (catalogues, offres, prix, disponibilités, contacts, moyens de
 * paiement) via un couple appId/appSecret, plus un seul endpoint d'écriture
 * (`registerCustomerFromToken`, depuis le 04/08/2026).
 *
 * À utiliser côté serveur uniquement — voir LocaleApp-integration-guide.md §1.4
 * (CORS + appSecret ne doit jamais atteindre le navigateur).
 */
export class YodooClient {
  private readonly http: HttpClient;
  private readonly tokenProvider: TokenProvider;
  private readonly fileCache: BoundedFileCache;
  /** Promesse mémoïsée du `SyncStore` — voir `getStore()` / `refreshStore()`. */
  private storePromise?: Promise<SyncStore>;

  constructor(options: YodooClientOptions) {
    this.tokenProvider = new TokenProvider({
      apiBaseUrl: API_BASE_URL,
      appId: options.appId,
      appSecret: options.appSecret,
    });
    this.http = new HttpClient({
      baseUrl: API_BASE_URL,
      tokenProvider: this.tokenProvider,
    });
    this.fileCache = new BoundedFileCache(
      options.fileCacheMaxBytes ?? DEFAULT_FILE_CACHE_MAX_BYTES
    );

    if (options.autoSync) {
      // Fire-and-forget : le `.catch` ici ne fait que marquer cette branche comme gérée
      // (pas d'unhandledRejection). `getStore()` a posé sa propre gestion d'erreur qui vide
      // la mémo, donc un échec du sync initial sera simplement retenté au prochain appel.
      void this.getStore().catch(() => undefined);
    }
  }

  /**
   * GET /locale/app/v2 — détails du commerce, avec moyens de paiement,
   * contacts et disponibilités inclus (remplace 4 appels v1 en un seul).
   * Mis en cache ici côté client (TTL 1h, voir `invalidateCache()`).
   */
  getProvider(): Promise<ProviderDetailDTO> {
    return this.http.get<ProviderDetailDTO>(V2_BASE);
  }

  /** GET /locale/app/v2/catalogues — vraie pagination serveur. */
  listCatalogues(params?: PageParams): Promise<PageDTO<CatalogueTileDTO>> {
    return this.http.get<PageDTO<CatalogueTileDTO>>(
      `${V2_BASE}/catalogues`,
      pageQuery(params)
    );
  }

  /** GET /locale/app/v2/catalogues/{id} */
  getCatalogue(id: string): Promise<CatalogueDetailDTO> {
    return this.http.get<CatalogueDetailDTO>(
      `${V2_BASE}/catalogues/${encodeURIComponent(id)}`
    );
  }

  /** GET /locale/app/v2/catalogues/{id}/offers */
  listCatalogueOffers(
    catalogueId: string,
    params?: PageParams
  ): Promise<PageDTO<OfferTileDTO>> {
    return this.http.get<PageDTO<OfferTileDTO>>(
      `${V2_BASE}/catalogues/${encodeURIComponent(catalogueId)}/offers`,
      pageQuery(params)
    );
  }

  /**
   * GET /locale/app/v2/offers — `catalogue` et `group` sont indépendants et cumulables.
   * `catalogue` accepte un ou plusieurs publicId (union match) ; un publicId inconnu ou
   * n'appartenant pas au commerce fait échouer l'appel en 404.
   */
  listOffers(params?: ListOffersParams): Promise<PageDTO<OfferTileDTO>> {
    return this.http.get<PageDTO<OfferTileDTO>>(`${V2_BASE}/offers`, {
      ...pageQuery(params),
      catalogue: params?.catalogue,
      group: params?.group,
    });
  }

  /**
   * GET /locale/app/v2/offers/{id} — détail d'une offre, avec ses prix (une
   * page), ses images et son catalogue en un seul appel. `params` pagine
   * `prices`, pas une liste d'offres (il n'y en a qu'une, celle demandée).
   */
  getOffer(id: string, params?: PageParams): Promise<OfferDetailDTO> {
    return this.http.get<OfferDetailDTO>(
      `${V2_BASE}/offers/${encodeURIComponent(id)}`,
      pageQuery(params)
    );
  }

  /** GET /locale/app/v2/events — promotion résolue, ticket gardé en id brut (`ticketOfferId`). */
  listEvents(params?: PageParams): Promise<PageDTO<EventTileDTO>> {
    return this.http.get<PageDTO<EventTileDTO>>(
      `${V2_BASE}/events`,
      pageQuery(params)
    );
  }

  /** GET /locale/app/v2/events/{id} — promotion ET ticket résolus. */
  getEvent(id: string): Promise<EventDetailDTO> {
    return this.http.get<EventDetailDTO>(
      `${V2_BASE}/events/${encodeURIComponent(id)}`
    );
  }

  /**
   * POST /locale/app/v2/customers/from-token — échange le jeton de partage court terme
   * (~5 min) qu'un client a généré côté app cliente contre son enregistrement comme
   * customer de ce commerce. Seul endpoint d'écriture du client. Le transmettre vaut
   * consentement explicite du client : Yodoo bascule `allowPersonalData` à `true` et copie
   * son nom sur le profil. Idempotent : rejouer le même jeton dans sa fenêtre de validité
   * ré-enregistre/retrouve le même profil.
   */
  registerCustomerFromToken(token: string): Promise<CustomerProfileDTO> {
    return this.http.post<CustomerProfileDTO>(`${V2_BASE}/customers/from-token`, {
      token,
    });
  }

  /**
   * POST /locale/app/v2/orders — crée une commande "vente comptoir". `finalPrice` est requis
   * sur chaque ligne de `items` : c'est le commerce qui fixe le prix, pas le client qui
   * choisit parmi des prix publiés. Les articles naissent `CLOSED` (stock et revenu
   * comptabilisés immédiatement).
   *
   * `offlineAuthorizationCode` (code hors-ligne signé, généré côté app cliente) identifie le
   * client au nom de qui la commande est passée et impose le `publicId` de la commande : un
   * code donné ne peut créer qu'une seule commande (rejeu → 409). Optionnel : omis, la commande
   * est attribuée au profil auto-référentiel du commerce plutôt qu'à un client identifié — utile
   * pour une intégration sans notion de client connecté (ex. commande anonyme depuis un site
   * vitrine). Utiliser `note` pour transmettre des coordonnées collectées côté formulaire dans
   * ce cas.
   */
  createOrder(
    items: CreateOrderItemDTO[],
    offlineAuthorizationCode?: string,
    note?: string
  ): Promise<OrderDTO> {
    return this.http.post<OrderDTO>(`${V2_BASE}/orders`, {
      items,
      offlineAuthorizationCode,
      note,
    });
  }

  /**
   * POST /locale/app/v2/orders/{order}/pay/mobile-money — paie une commande de ce commerce par
   * mobile money. Le moyen de paiement source est trouvé ou créé automatiquement à partir de
   * `phoneNumber`/`providerCode`/`countryCode` ; le client n'a pas besoin de l'avoir
   * pré-enregistré. Règlement asynchrone via webhook. `idempotencyKey` est obligatoire : un
   * retry réseau avec la même clé rejoue le résultat déjà obtenu au lieu de déclencher un
   * second transfert.
   */
  payOrderByMobileMoney(
    orderId: string,
    params: PayOrderByMobileMoneyParams
  ): Promise<InvoiceDTO> {
    return this.http.post<InvoiceDTO>(
      `${V2_BASE}/orders/${encodeURIComponent(orderId)}/pay/mobile-money`,
      params
    );
  }

  /**
   * GET /locale/app/v2/content — contenu HTML du site vitrine du commerce (clé → HTML).
   * Throttlé à 1 payload réel/heure/app (429 au-delà). Passer `ifModifiedSince` (la valeur
   * `lastModified` reçue au précédent appel) pour un polling gratuit : un 304 renvoie
   * `content: null` et ne consomme pas le quota horaire.
   */
  getContent(ifModifiedSince?: string): Promise<ContentResult> {
    return this.http
      .getConditional<Record<string, string>>(`${V2_BASE}/content`, ifModifiedSince)
      .then(({ value, lastModified }) => ({ content: value, lastModified }));
  }

  /**
   * GET /locale/app/v2/sync — flux NDJSON *full-replace* : contenu du site + catalogues +
   * offres (`VISIBLE` uniquement, détail complet, prix inclus) + événements de tout le
   * commerce, lus en une seule transaction cohérente. Remplace le fan-out `getContent` +
   * `listCatalogues`/`getCatalogue`×N + `listOffers`(toutes pages) + `getOffer`×N pour un
   * consommateur SSR qui reconstruit un read-model complet à froid.
   *
   * Renvoie un `SyncStore` : vue indexée du snapshot où `getOffer(id)` / `getCatalogue(id)` /
   * `getEvent(id)` se résolvent en mémoire, sans nouvel appel réseau. Snapshot figé — pour
   * rafraîchir, rappeler cette méthode.
   *
   * Le corps est parsé au fil de l'eau et validé : un flux tronqué (ligne `end` absente) ou
   * dont les compteurs ne collent pas à l'en-tête `meta.counts` lève une `SyncProtocolError`
   * — conserver alors le store précédent.
   *
   * `store.version` est un digest opaque : le repasser en `previousVersion` renseigne
   * `store.unchanged` quand rien n'a changé (le flux est quand même téléchargé en entier :
   * le backend ne répond pas en conditionnel ici).
   *
   * Budget : 1 build/heure/app (bucket `app-sync:{appId}`), `429` au-delà — poll conseillé
   * 1×/heure. Pas mis en cache côté client (contrairement aux `GET` simples).
   */
  async sync(previousVersion?: string): Promise<SyncStore> {
    const response = await this.http.getStream(`${V2_BASE}/sync`);
    const snapshot = await parseSyncResponse(response);
    return new SyncStore(snapshot, {
      unchanged:
        previousVersion !== undefined && previousVersion === snapshot.version,
    });
  }

  /**
   * `SyncStore` du commerce, **mémoïsé** : le premier appel déclenche `sync()`, les suivants
   * renvoient le même store (ou la promesse encore en vol si le flux n'est pas fini d'arriver
   * — les appels concurrents partagent donc un seul flux). Combiné à `autoSync: true`, le sync
   * démarre à la construction et ce `getStore()` ne fait qu'attendre son résultat.
   *
   * Si le `sync()` échoue, la mémo est vidée : l'appel suivant relance le flux. Le store étant
   * un snapshot figé, utiliser `refreshStore()` pour forcer une re-synchronisation.
   */
  getStore(): Promise<SyncStore> {
    if (!this.storePromise) {
      const pending: Promise<SyncStore> = this.sync().catch((error) => {
        if (this.storePromise === pending) this.storePromise = undefined;
        throw error;
      });
      this.storePromise = pending;
    }
    return this.storePromise;
  }

  /**
   * Force une re-synchronisation et remplace le store mémoïsé par le nouveau. Repasse la
   * `version` courante en `previousVersion` : si rien n'a changé côté commerce, le store
   * renvoyé a `unchanged === true` (le flux est quand même téléchargé — pas de conditionnel
   * serveur). En cas d'échec, la mémo garde le store précédent et l'erreur est propagée.
   *
   * Un appel = un flux : ne pas enchaîner plus d'1×/heure (budget `app-sync`, `429` au-delà).
   */
  async refreshStore(): Promise<SyncStore> {
    const current = await this.storePromise?.catch(() => undefined);
    const next = await this.sync(current?.version);
    this.storePromise = Promise.resolve(next);
    return next;
  }

  /** GET /locale/app/top-offers — pas d'équivalent v2, reste sur v1. */
  getTopOffers(params?: TopOffersParams): Promise<TopOffersDTO> {
    return this.http.get<TopOffersDTO>(`${V1_BASE}/top-offers`, {
      range: params?.range,
      limit: params?.limit,
    });
  }

  /**
   * URL publique (sans authentification) pour streamer un fichier
   * (guide §3) — ne pas utiliser les URLs presignées, non fiables.
   */
  getFileUrl(fileId: string): string {
    return buildFileUrl(API_BASE_URL, fileId);
  }

  /**
   * Télécharge un fichier public (image, etc.) depuis `getFileUrl`, avec un cache en
   * mémoire borné en octets (voir `fileCacheMaxBytes`) : les appels suivants pour le même
   * `fileId` ne retapent pas Yodoo tant que l'entrée n'a pas été évincée. `fileId` étant un
   * identifiant immuable côté backend, aucun TTL n'est nécessaire. `cacheControl` est la
   * valeur renvoyée par Yodoo (guide §3, `immutable` 365j) — à retransmettre telle quelle
   * si ce fichier est reproxifié vers un navigateur.
   */
  async getFile(fileId: string): Promise<CachedFile> {
    const cached = this.fileCache.get(fileId);
    if (cached) return cached;

    const response = await fetch(this.getFileUrl(fileId));
    if (!response.ok) {
      throw await toDomainError(response);
    }

    const entry: CachedFile = {
      bytes: new Uint8Array(await response.arrayBuffer()),
      contentType:
        response.headers.get("Content-Type") ?? "application/octet-stream",
      cacheControl: response.headers.get("Cache-Control"),
    };
    this.fileCache.set(fileId, entry);
    return entry;
  }

  /** Force le renouvellement du token au prochain appel (ex. après une révocation manuelle). */
  invalidateToken(): void {
    this.tokenProvider.invalidate();
  }

  /**
   * Vide le cache en mémoire des réponses de lecture (`getProvider`, `listCatalogues`,
   * `listOffers`, etc. — TTL fixe 1h). À appeler quand on sait qu'une donnée a changé côté
   * commerce et qu'on ne veut pas attendre l'expiration du TTL. N'affecte pas le `SyncStore`
   * mémoïsé (snapshot figé) — pour celui-là, utiliser `refreshStore()`.
   */
  invalidateCache(): void {
    this.http.invalidateCache();
  }
}
