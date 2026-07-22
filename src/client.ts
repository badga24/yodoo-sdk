import { HttpClient, type QueryParams } from "./http-client.js";
import { TokenProvider } from "./token-provider.js";
import { buildFileUrl } from "./file-url.js";
import type {
  CatalogueDetailDTO,
  CatalogueTileDTO,
  EventDetailDTO,
  EventTileDTO,
  ListOffersParams,
  OfferDetailDTO,
  OfferTileDTO,
  PageDTO,
  PageParams,
  ProviderDetailDTO,
  TopOffersDTO,
  TopOffersParams,
} from "./types.js";

/** API-imposed page size ceiling (docs/sdk/locale-app-v2.md §1). */
const MAX_PAGE_SIZE = 30;

/** Seul backend Yodoo pris en charge — non configurable. */
const API_BASE_URL = "https://yodoo.space/api";

/** GET /locale/app/top-offers n'a pas d'équivalent v2 (docs/sdk/locale-app-v2.md §1) — reste sur v1. */
const V1_BASE = "/locale/app";
const V2_BASE = "/locale/app/v2";

export interface YodooClientOptions {
  /** Identifiant de l'app, fourni par le propriétaire du commerce (guide §1.1). */
  appId: string;
  /** Secret de l'app — ne jamais l'exposer côté navigateur (guide §1.4). */
  appSecret: string;
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
 * Client pour l'API Yodoo LocaleApp v2 (ROLE_LOCALE_APP) : lecture seule des
 * données du commerce (catalogues, offres, prix, disponibilités, contacts,
 * moyens de paiement) via un couple appId/appSecret.
 *
 * À utiliser côté serveur uniquement — voir LocaleApp-integration-guide.md §1.4
 * (CORS + appSecret ne doit jamais atteindre le navigateur).
 */
export class YodooClient {
  private readonly http: HttpClient;
  private readonly tokenProvider: TokenProvider;

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
  }

  /**
   * GET /locale/app/v2 — détails du commerce, avec moyens de paiement,
   * contacts et disponibilités inclus (remplace 4 appels v1 en un seul).
   * Non caché côté serveur : toujours à jour.
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

  /** GET /locale/app/v2/offers */
  listOffers(params?: ListOffersParams): Promise<PageDTO<OfferTileDTO>> {
    return this.http.get<PageDTO<OfferTileDTO>>(`${V2_BASE}/offers`, {
      ...pageQuery(params),
      catalogue: params?.catalogue,
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

  /** Force le renouvellement du token au prochain appel (ex. après une révocation manuelle). */
  invalidateToken(): void {
    this.tokenProvider.invalidate();
  }
}
