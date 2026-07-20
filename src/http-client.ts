import { toDomainError } from "./errors.js";
import type { TokenProvider } from "./token-provider.js";

export interface HttpClientOptions {
  baseUrl: string;
  tokenProvider: TokenProvider;
}

export type QueryParams = Record<string, string | number | undefined>;

export class HttpClient {
  private readonly baseUrl: string;
  private readonly tokenProvider: TokenProvider;

  constructor(options: HttpClientOptions) {
    this.baseUrl = options.baseUrl;
    this.tokenProvider = options.tokenProvider;
  }

  async get<T>(path: string, query?: QueryParams): Promise<T> {
    const url = this.buildUrl(path, query);
    const response = await this.fetchWithToken(url);

    // Le token peut avoir expiré côté serveur alors que le cache local le
    // croyait encore valide — on retente une fois avec un token frais.
    if (response.status === 401) {
      this.tokenProvider.invalidate();
      return this.parse<T>(await this.fetchWithToken(url));
    }

    return this.parse<T>(response);
  }

  private async fetchWithToken(url: string): Promise<Response> {
    const token = await this.tokenProvider.getToken();
    return fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  private async parse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      throw await toDomainError(response);
    }
    return response.json() as Promise<T>;
  }

  private buildUrl(path: string, query?: QueryParams): string {
    const url = new URL(`${this.baseUrl}${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }
}
