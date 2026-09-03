export { YodooClient, type YodooClientOptions } from "./client.js";
export {
  SyncStore,
  type SyncStoreOptions,
  type SyncUnchanged,
} from "./sync-store.js";

export {
  DomainError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  RateLimitedError,
  ServerError,
  SyncProtocolError,
} from "./errors.js";

export { formatMoney } from "./money.js";
export { buildFileUrl } from "./file-url.js";
export type { CachedFile } from "./file-cache.js";

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
  CustomerProfileDTO,
  ContentResult,
  TopOfferItemDTO,
  TopOffersDTO,
  PageDTO,
  PageParams,
  ListOffersParams,
  TopOffersParams,
  SyncMainCounts,
  SyncOthersCounts,
  SyncCatalogueDTO,
  SyncOfferDTO,
  SyncEventDTO,
  SyncMainSnapshot,
  SyncOthersSnapshot,
  SyncSnapshot,
} from "./types.js";
