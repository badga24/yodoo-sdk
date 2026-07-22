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
  RatingSummaryDTO,
  ModelFileType,
  FileDTO,
  ContactType,
  ContactDTO,
  AvailabilityFrequency,
  AvailabilityDTO,
  PaymentMethodDTO,
  ProviderWebsiteDTO,
  CatalogueRefDTO,
  PriceOrderSettingDTO,
  PriceValidityDTO,
  PriceDTO,
  OfferMarketplaceProfileDTO,
  ProviderDetailDTO,
  OfferStatus,
  OfferTileDTO,
  OfferDetailDTO,
  CatalogueTileDTO,
  CatalogueDetailDTO,
  EventRecurrence,
  EventEntryType,
  EventTileDTO,
  EventDetailDTO,
  EventTicketDTO,
  PromotionDiscountType,
  Gender,
  PromotionDTO,
  TopOfferItemDTO,
  TopOffersDTO,
  PageDTO,
  PageParams,
  ListOffersParams,
  TopOffersParams,
} from "./types.js";
