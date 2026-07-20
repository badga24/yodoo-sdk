export { YodooClient, type YodooClientOptions } from "./client.js";

export {
  DomainError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  RateLimitedError,
  ServerError,
} from "./errors.js";

export { formatMoney } from "./money.js";
export { buildFileUrl } from "./file-url.js";

export type {
  GeoLocation,
  FileRef,
  Contact,
  Availability,
  PaymentMethod,
  Catalogue,
  OrderSetting,
  Price,
  Provider,
  Offer,
  TopOfferItem,
  TopOffers,
  Page,
  PageParams,
  ListOffersParams,
  TopOffersParams,
} from "./types.js";
