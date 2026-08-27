import { toDomainError } from "./errors.js";
import type { TokenProvider } from "./token-provider.js";

export interface HttpClientOptions {
  baseUrl: string;
  tokenProvider: TokenProvider;
}

export type QueryParams = Record<string, string | number | undefined>;

/** TTL fixe du cache en mémoire des réponses `get()` — pas configurable. */
const CACHE_TTL_MS = 60 * 60 * 1000;

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

export class HttpClient {
  private readonly baseUrl: string;
  private readonly tokenProvider: TokenProvider;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(options: HttpClientOptions) {
    this.baseUrl = options.baseUrl;
    this.tokenProvider = options.tokenProvider;
  }

  /**
   * GET, mis en cache en mémoire (clé = URL complète, query incluse) pour la durée du process,
   * TTL fixe 1h. `getConditional` (contenu, §6) n'utilise pas ce cache : il a son propre
   * mécanisme de fraîcheur (`If-Modified-Since`).
   */
  async get<T>(path: string, query?: QueryParams): Promise<T> {
    const url = this.buildUrl(path, query);

    const cached = this.cache.get(url);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value as T;
    }

    const response = await this.fetchWithToken(url, "GET");

    // Le token peut avoir expiré côté serveur alors que le cache local le
    // croyait encore valide — on retente une fois avec un token frais.
    const value =
      response.status === 401
        ? await (async () => {
            this.tokenProvider.invalidate();
            return this.parse<T>(await this.fetchWithToken(url, "GET"));
          })()
        : await this.parse<T>(response);

    this.cache.set(url, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  }

  /** Vide le cache en mémoire de `get()` — à appeler après une mutation connue côté commerce (dashboard, autre app) dont on veut voir l'effet immédiatement, sans attendre le TTL. */
  invalidateCache(): void {
    this.cache.clear();
  }

  /**
   * GET avec `If-Modified-Since` optionnel. Un 304 renvoie `null` (pas de retry-401 dans ce
   * cas : un 304 n'a jamais besoin d'auth valide au-delà de la requête elle-même côté serveur,
   * et on ne veut pas transformer un "pas de changement" en erreur).
   */
  async getConditional<T>(
    path: string,
    ifModifiedSince?: string
  ): Promise<{ value: T | null; lastModified: string | null }> {
    const url = this.buildUrl(path);
    let response = await this.fetchWithToken(url, "GET", undefined, ifModifiedSince);

    if (response.status === 401) {
      this.tokenProvider.invalidate();
      response = await this.fetchWithToken(url, "GET", undefined, ifModifiedSince);
    }

    if (response.status === 304) {
      return { value: null, lastModified: ifModifiedSince ?? null };
    }

    const value = await this.parse<T>(response);
    return { value, lastModified: response.headers.get("Last-Modified") };
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const url = this.buildUrl(path);
    const response = await this.fetchWithToken(url, "POST", body);

    // Même retry-sur-401 que get() : le token en cache peut avoir expiré
    // côté serveur entre-temps.
    if (response.status === 401) {
      this.tokenProvider.invalidate();
      return this.parse<T>(await this.fetchWithToken(url, "POST", body));
    }

    return this.parse<T>(response);
  }

  private async fetchWithToken(
    url: string,
    method: "GET" | "POST",
    body?: unknown,
    ifModifiedSince?: string
  ): Promise<Response> {
    const token = await this.tokenProvider.getToken();
    return fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(ifModifiedSince !== undefined
          ? { "If-Modified-Since": ifModifiedSince }
          : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
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
