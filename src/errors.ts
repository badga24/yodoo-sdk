/**
 * Équivalents typés des statuts APIError du backend
 * (LocaleApp-integration-guide.md §4), pour pouvoir distinguer le type
 * d'erreur sans reparser le code HTTP partout dans le code appelant.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;

  /**
   * `message` est traduit par Yodoo selon la langue demandée (option client `language`) et son
   * texte peut changer à tout moment : ne jamais brancher de logique dessus — uniquement sur la
   * classe d'erreur (statut HTTP), `status` et `apiCode`.
   *
   * `status` : statut HTTP d'origine (`0` pour une erreur levée par le SDK lui-même, ex.
   * `SyncProtocolError`). `apiCode` : champ `code` du corps d'erreur Yodoo quand il est présent
   * — un code stable, contrairement à `message` ; absent pour la plupart des erreurs.
   */
  readonly status: number;
  readonly apiCode?: string;

  constructor(
    message: string,
    readonly fields?: Record<string, string>,
    details?: { status?: number; apiCode?: string }
  ) {
    super(message);
    this.name = new.target.name;
    this.status = details?.status ?? 0;
    this.apiCode = details?.apiCode;
  }
}

export class UnauthorizedError extends DomainError {
  readonly code = "UNAUTHORIZED";
}

export class ForbiddenError extends DomainError {
  readonly code = "FORBIDDEN";
}

export class NotFoundError extends DomainError {
  readonly code = "NOT_FOUND";
}

export class ValidationError extends DomainError {
  readonly code = "VALIDATION_ERROR";
}

/**
 * `409` — valeur en double, ressource encore liée à d'autres données, modification concurrente,
 * ou requête idempotente rejouée de manière incompatible (ex. `id` de commande appartenant à un
 * autre commerce, réponse IA encore en cours sur la même conversation).
 */
export class ConflictError extends DomainError {
  readonly code = "CONFLICT";
}

/** `413` — fichier envoyé trop volumineux (ex. `uploadOrderPhoto`). */
export class PayloadTooLargeError extends DomainError {
  readonly code = "PAYLOAD_TOO_LARGE";
}

/**
 * Autre erreur côté client (`4xx` sans classe dédiée, ex. `406`/`415`) — signale une requête
 * que Yodoo refuse, pas une panne serveur.
 */
export class ClientError extends DomainError {
  readonly code = "CLIENT_ERROR";
}

export class RateLimitedError extends DomainError {
  readonly code = "RATE_LIMITED";
}

/** `5xx` (ou réponse sans statut exploitable) — un vrai incident côté Yodoo, pas une requête invalide. */
export class ServerError extends DomainError {
  readonly code = "SERVER_ERROR";
}

/**
 * Le flux NDJSON de `sync()` n'est pas conforme (ligne `end` absente = corps tronqué,
 * compteurs qui ne collent pas à `meta.counts`, ligne illisible, ordre invalide...). Le
 * backend a pu répondre `200` tout en plantant en cours de stream : sur cette erreur, le
 * client DOIT conserver la version de synchronisation précédente.
 */
export class SyncProtocolError extends DomainError {
  readonly code = "SYNC_PROTOCOL_ERROR";
}

interface ApiErrorBody {
  status?: string;
  message?: string;
  code?: string;
  timestamp?: string;
  fields?: Record<string, string>;
}

/** Convertit une réponse HTTP en erreur au format APIError (guide §4) en DomainError typée. */
export async function toDomainError(response: Response): Promise<DomainError> {
  let body: ApiErrorBody = {};
  try {
    body = await response.json();
  } catch {
    // Corps d'erreur non-JSON (ex. échec proxy/gateway) — on retombe sur les valeurs par défaut ci-dessous.
  }
  const message = body.message ?? response.statusText ?? "Unexpected error";
  const fields = body.fields;
  const details = { status: response.status, apiCode: body.code ?? undefined };

  switch (response.status) {
    case 401:
      return new UnauthorizedError(message, fields, details);
    case 403:
      return new ForbiddenError(message, fields, details);
    case 404:
      return new NotFoundError(message, fields, details);
    case 400:
      return new ValidationError(message, fields, details);
    case 409:
      return new ConflictError(message, fields, details);
    case 413:
      return new PayloadTooLargeError(message, fields, details);
    case 429:
      return new RateLimitedError(message, fields, details);
    default:
      return response.status >= 400 && response.status < 500
        ? new ClientError(message, fields, details)
        : new ServerError(message, fields, details);
  }
}
