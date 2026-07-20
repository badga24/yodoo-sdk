interface CachedToken {
  token: string;
  expiresAt: number;
}

/** Rafraîchit un peu avant l'expiration réelle pour éviter une requête en course avec elle. */
const EXPIRY_SAFETY_MARGIN_MS = 60_000;

function decodeExpiryMs(jwt: string): number {
  const payloadSegment = jwt.split(".")[1];
  if (!payloadSegment) {
    throw new Error("Received a malformed JWT from the Yodoo auth endpoint");
  }
  const payload = JSON.parse(
    Buffer.from(payloadSegment, "base64url").toString("utf-8")
  ) as { exp?: number };
  if (!payload.exp) {
    throw new Error("JWT from the Yodoo auth endpoint has no exp claim");
  }
  return payload.exp * 1000;
}

export interface TokenProviderOptions {
  apiBaseUrl: string;
  appId: string;
  appSecret: string;
}

/**
 * Met le token de l'app en cache en mémoire pour la durée de vie du process.
 * L'endpoint d'auth est limité à 10 req/min par IP
 * (LocaleApp-integration-guide.md §1.2) : l'appeler à chaque requête ferait
 * throttler l'app, ce cache n'est donc pas qu'une optimisation.
 */
export class TokenProvider {
  private cached: CachedToken | null = null;
  private pending: Promise<string> | null = null;

  constructor(private readonly options: TokenProviderOptions) {}

  async getToken(): Promise<string> {
    if (
      this.cached &&
      this.cached.expiresAt - EXPIRY_SAFETY_MARGIN_MS > Date.now()
    ) {
      return this.cached.token;
    }
    // Fusionne les rafraîchissements concurrents en une seule requête.
    if (!this.pending) {
      this.pending = this.fetchToken().finally(() => {
        this.pending = null;
      });
    }
    return this.pending;
  }

  /** À appeler après un 401 pour forcer un token frais au prochain getToken(). */
  invalidate(): void {
    this.cached = null;
  }

  private async fetchToken(): Promise<string> {
    const url = new URL(`${this.options.apiBaseUrl}/auth/locale/app/token`);
    url.searchParams.set("appId", this.options.appId);
    url.searchParams.set("appSecret", this.options.appSecret);

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(
        `Failed to obtain a Yodoo app token (HTTP ${response.status})`
      );
    }

    const token = (await response.text()).trim();
    this.cached = { token, expiresAt: decodeExpiryMs(token) };
    return token;
  }
}
