import { HttpClient, type QueryParams } from "./http-client.js";
import { TokenProvider } from "./token-provider.js";
import { buildFileUrl } from "./file-url.js";
import type {
  Availability,
  Catalogue,
  Contact,
  ListOffersParams,
  Offer,
  Page,
  PageParams,
  PaymentMethod,
  Price,
  Provider,
  TopOffers,
  TopOffersParams,
} from "./types.js";

/** API-imposed page size ceiling (LocaleApp-integration-guide.md §2). */
const MAX_PAGE_SIZE = 30;

const DEFAULT_API_BASE_URL = "http://localhost:9090/api";

export interface YodooClientOptions {
  /** Identifiant de l'app, fourni par le propriétaire du commerce (guide §1.1). */
  appId: string;
  /** Secret de l'app — ne jamais l'exposer côté navigateur (guide §1.4). */
  appSecret: string;
  /** Défaut : "http://localhost:9090/api". En prod, à confirmer avec l'opérateur du backend. */
  apiBaseUrl?: string;
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
 * Client pour l'API Yodoo LocaleApp (ROLE_LOCALE_APP) : lecture seule des
 * données du commerce (catalogues, offres, prix, disponibilités, contacts,
 * moyens de paiement) via un couple appId/appSecret.
 *
 * À utiliser côté serveur uniquement — voir LocaleApp-integration-guide.md §1.4
 * (CORS + appSecret ne doit jamais atteindre le navigateur).
 */
export class YodooClient {
  private readonly apiBaseUrl: string;
  private readonly http: HttpClient;
  private readonly tokenProvider: TokenProvider;

  constructor(options: YodooClientOptions) {
    this.apiBaseUrl = (options.apiBaseUrl ?? DEFAULT_API_BASE_URL).replace(
      /\/$/,
      ""
    );
    this.tokenProvider = new TokenProvider({
      apiBaseUrl: this.apiBaseUrl,
      appId: options.appId,
      appSecret: options.appSecret,
    });
    this.http = new HttpClient({
      baseUrl: this.apiBaseUrl,
      tokenProvider: this.tokenProvider,
    });
  }

  /** GET /locale/app — détails du commerce rattaché à l'app. */
  getProvider(): Promise<Provider> {
    return this.http.get<Provider>("/locale/app");
  }

  /** GET /locale/app/catalogues */
  listCatalogues(params?: PageParams): Promise<Page<Catalogue>> {
    return this.http.get<Page<Catalogue>>(
      "/locale/app/catalogues",
      pageQuery(params)
    );
  }

  /** GET /locale/app/catalogues/{id} */
  getCatalogue(id: string): Promise<Catalogue> {
    return this.http.get<Catalogue>(
      `/locale/app/catalogues/${encodeURIComponent(id)}`
    );
  }

  /** GET /locale/app/catalogues/{id}/offers */
  listCatalogueOffers(
    catalogueId: string,
    params?: PageParams
  ): Promise<Page<Offer>> {
    return this.http.get<Page<Offer>>(
      `/locale/app/catalogues/${encodeURIComponent(catalogueId)}/offers`,
      pageQuery(params)
    );
  }

  /** GET /locale/app/offers */
  listOffers(params?: ListOffersParams): Promise<Page<Offer>> {
    return this.http.get<Page<Offer>>("/locale/app/offers", {
      ...pageQuery(params),
      catalogue: params?.catalogue,
    });
  }

  /** GET /locale/app/offers/{id}/prices */
  getOfferPrices(offerId: string): Promise<Page<Price>> {
    return this.http.get<Page<Price>>(
      `/locale/app/offers/${encodeURIComponent(offerId)}/prices`
    );
  }

  /** GET /locale/app/payment-methods */
  listPaymentMethods(params?: PageParams): Promise<Page<PaymentMethod>> {
    return this.http.get<Page<PaymentMethod>>(
      "/locale/app/payment-methods",
      pageQuery(params)
    );
  }

  /** GET /locale/app/availabilities */
  listAvailabilities(): Promise<Page<Availability>> {
    return this.http.get<Page<Availability>>("/locale/app/availabilities");
  }

  /** GET /locale/app/contacts */
  listContacts(params?: PageParams): Promise<Page<Contact>> {
    return this.http.get<Page<Contact>>(
      "/locale/app/contacts",
      pageQuery(params)
    );
  }

  /** GET /locale/app/top-offers */
  getTopOffers(params?: TopOffersParams): Promise<TopOffers> {
    return this.http.get<TopOffers>("/locale/app/top-offers", {
      range: params?.range,
      limit: params?.limit,
    });
  }

  /**
   * URL publique (sans authentification) pour streamer un fichier
   * (guide §3) — ne pas utiliser les URLs presignées, non fiables.
   */
  getFileUrl(fileId: string): string {
    return buildFileUrl(this.apiBaseUrl, fileId);
  }

  /** Force le renouvellement du token au prochain appel (ex. après une révocation manuelle). */
  invalidateToken(): void {
    this.tokenProvider.invalidate();
  }
}
