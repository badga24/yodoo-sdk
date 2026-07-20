/**
 * Équivalents typés des statuts APIError du backend
 * (LocaleApp-integration-guide.md §4), pour pouvoir distinguer le type
 * d'erreur sans reparser le code HTTP partout dans le code appelant.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;

  constructor(
    message: string,
    readonly fields?: Record<string, string>
  ) {
    super(message);
    this.name = new.target.name;
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

export class RateLimitedError extends DomainError {
  readonly code = "RATE_LIMITED";
}

export class ServerError extends DomainError {
  readonly code = "SERVER_ERROR";
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

  switch (response.status) {
    case 401:
      return new UnauthorizedError(message, fields);
    case 403:
      return new ForbiddenError(message, fields);
    case 404:
      return new NotFoundError(message, fields);
    case 400:
      return new ValidationError(message, fields);
    case 429:
      return new RateLimitedError(message, fields);
    default:
      return new ServerError(message, fields);
  }
}
