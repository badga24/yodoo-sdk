/**
 * Types miroir des DTOs v2 exposés par l'API Yodoo LocaleApp
 * (docs/sdk/locale-app-v2.md). Un type par DTO backend, même nom (suffixe
 * `DTO`), mêmes champs, même forme imbriquée — pas d'abstraction "domaine"
 * qui reformerait les données différemment du contrat serveur.
 */

export interface GeoLocation {
  lat: number;
  lng: number;
}

export interface RatingSummaryDTO {
  averageRating: number;
  reviewCount: number;
}

export type ModelFileType = "COVER" | "OTHER" | "LOGO";

export interface FileDTO {
  id: string;
  name: string;
  ratio: number;
  contentType: string;
  contentLength: number;
  modelFileType: ModelFileType;
  /** publicId du membre d'équipe ayant uploadé le fichier (nullable). */
  uploadedBy: string | null;
  createdAt: string;
}

export type ContactType =
  | "PHONE"
  | "EMAIL"
  | "WHATSAPP"
  | "INSTAGRAM"
  | "FACEBOOK"
  | "TIKTOK"
  | "TWITTER"
  | "YOUTUBE"
  | "LINKEDIN"
  | "TELEGRAM"
  | "SNAPCHAT"
  | "WEBSITE";

export interface ContactDTO {
  id: string;
  value: string;
  type: ContactType;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export type AvailabilityFrequency = "WEEKLY" | "MONTHLY" | "YEARLY";

export interface AvailabilityDTO {
  id: string;
  startDate: string;
  endDate: string;
  frequency: AvailabilityFrequency;
}

export interface PaymentMethodDTO {
  id: string;
  sourceId: string;
  source: string;
  providerCode: string;
  countryCode: string;
  /**
   * Clé JSON réelle : `default` (pas `isDefault`). Le champ Java `isDefault`
   * est un `boolean` primitif déjà préfixé "is" : Lombok génère un getter
   * `isDefault()`, que Jackson désérialise en propriété `default` (il retire
   * le préfixe "is" des getters booléens standards). Vérifié empiriquement
   * avec Jackson — ne pas renommer en `isDefault` sans revérifier le backend.
   */
  default: boolean;
  inactive: boolean;
  createdAt: string;
}

export interface ProviderWebsiteDTO {
  id: string;
  domain: string;
  status: string;
  createdAt: string;
}

/** Forme minimale de catalogue imbriquée dans `OfferDetailDTO.catalogue` (le backend y réutilise sa DTO v1 `CatalogueDTO`, volontairement pas la v2). */
export interface CatalogueRefDTO {
  id: string;
  name: string;
  cover: FileDTO | null;
}

export interface PriceOrderSettingDTO {
  id: string;
  type: string;
  /** Clé JSON réelle : `required` (même raison que `PaymentMethodDTO.default`). */
  required: boolean;
  acceptedValueType: string;
  content: string;
}

export interface PriceValidityDTO {
  mode: string;
  durationValue: number | null;
  durationUnit: string | null;
  fixedEndDate: string | null;
  autoRenew: boolean;
}

export interface PriceDTO {
  id: string;
  name: string;
  ignoresQuantity: boolean;
  /** Montants entiers dans la plus petite unité de la devise — jamais un flottant. */
  fixedPrice: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  currency: string;
  unitValue: number;
  unit: string;
  orderSettings: PriceOrderSettingDTO[];
  /** Présent seulement si ce prix est un abonnement/ticket. */
  validity: PriceValidityDTO | null;
  createdAt: string;
  updatedAt: string;
}

/** Présent uniquement quand l'offre est liée à une offre marketplace. */
export interface OfferMarketplaceProfileDTO {
  id: string;
  offerId: string;
  marketplaceOfferId: string;
  brandId: string;
  deliveryOriginLatitude: number | null;
  deliveryOriginLongitude: number | null;
  maxPickupDistanceKm: number | null;
  maxTripDistanceKm: number | null;
  createdAt: string;
  updatedAt: string;
}

/** GET /locale/app/v2 — fusionne provider + payment-methods + contacts + availabilities. */
export interface ProviderDetailDTO {
  id: string;
  name: string;
  location: GeoLocation;
  directions: string;
  identifier: string;
  utcOffset: string;
  rating: RatingSummaryDTO;
  customerCount: number;
  images: FileDTO[];
  paymentMethods: PaymentMethodDTO[];
  contacts: ContactDTO[];
  availabilities: AvailabilityDTO[];
  website: ProviderWebsiteDTO | null;
  /** "FREE" quand aucun abonnement n'est actif. */
  planName: string;
  currency: string;
  receivesOrders: boolean;
  createdAt: string;
  updatedAt: string;
}

export type OfferStatus = "ACTIVE" | "VISIBLE" | "BLOCKED";

/** Forme "ligne de liste" — GET /locale/app/v2/offers et .../catalogues/{id}/offers. */
export interface OfferTileDTO {
  id: string;
  name: string;
  status: OfferStatus;
  cover: FileDTO | null;
  priceCount: number;
  rating: RatingSummaryDTO;
  catalogueId: string | null;
  updatedAt: string;
}

/** Détail complet — GET /locale/app/v2/offers/{id}. */
export interface OfferDetailDTO {
  id: string;
  name: string;
  description: string;
  status: OfferStatus;
  /** Paginée : `page`/`size`/`sort` passés à getOffer() paginent ce champ, pas une liste d'offres. */
  prices: PageDTO<PriceDTO>;
  images: FileDTO[];
  catalogue: CatalogueRefDTO | null;
  marketplaceProfile: OfferMarketplaceProfileDTO | null;
  rating: RatingSummaryDTO;
  createdAt: string;
  updatedAt: string;
}

/** Forme "ligne de liste" — GET /locale/app/v2/catalogues. */
export interface CatalogueTileDTO {
  id: string;
  name: string;
  cover: FileDTO | null;
  offerCount: number;
  updatedAt: string;
}

/** Détail complet — GET /locale/app/v2/catalogues/{id}. */
export interface CatalogueDetailDTO {
  id: string;
  name: string;
  description: string;
  cover: FileDTO | null;
  offerCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface TopOfferItemDTO {
  offerId: string;
  name: string;
  value: number;
}

/** GET /locale/app/top-offers — pas d'équivalent v2, endpoint resté sur v1. */
export interface TopOffersDTO {
  items: TopOfferItemDTO[];
}

/** Metadata seule — le backend n'étend jamais ça en occurrences futures, c'est au front de l'interpréter. */
export type EventRecurrence = "ONCE" | "WEEKLY" | "MONTHLY" | "YEARLY";

/** FREE (libre), RESERVATION (lien externe, voir `reservationUrl`), TICKET (offre payante, voir `ticketOfferId`). */
export type EventEntryType = "FREE" | "RESERVATION" | "TICKET";

export type PromotionDiscountType = "PERCENTAGE" | "FIXED_AMOUNT";

export type Gender = "MALE" | "FEMALE" | "OTHER";

/** Promotion résolue, imbriquée dans `EventTileDTO`/`EventDetailDTO` (plus jamais un simple `promotionId`). */
export interface PromotionDTO {
  id: string;
  providerId: string;
  name: string;
  description: string;
  discountType: PromotionDiscountType;
  /** Points de pourcentage (0-100) si `discountType` vaut "PERCENTAGE", entier en plus petite unité de devise si "FIXED_AMOUNT". */
  discountValue: number;
  startDate: string;
  endDate: string;
  minAge: number | null;
  maxAge: number | null;
  /** Ciblage optionnel sur le genre du client. */
  gender: Gender | null;
  minOrderCount: number | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/** `Event.ticketOffer` résolu — présent uniquement sur `EventDetailDTO` (la liste garde l'id brut). */
export interface EventTicketDTO {
  id: string;
  name: string;
  description: string;
  status: OfferStatus;
}

/** Forme "ligne de liste" — GET /locale/app/v2/events : la promotion est résolue, le ticket reste un id brut. */
export interface EventTileDTO {
  id: string;
  providerId: string;
  name: string;
  description: string;
  location: GeoLocation;
  startDate: string;
  endDate: string;
  recurrence: EventRecurrence;
  /** Présent seulement si l'event est lié à une promotion (jamais juste un id, contrairement à `ticketOfferId` sur cette même forme liste). */
  promotion: PromotionDTO | null;
  entryType: EventEntryType;
  /** Présent seulement quand `entryType` vaut "RESERVATION". */
  reservationUrl: string | null;
  /** Présent seulement quand `entryType` vaut "TICKET". Résolu en `EventTicketDTO` uniquement sur `EventDetailDTO`. */
  ticketOfferId: string | null;
  cover: FileDTO | null;
  createdAt: string;
  updatedAt: string;
}

/** Détail complet — GET /locale/app/v2/events/{id} : promotion ET ticket sont résolus (pas juste des ids). */
export interface EventDetailDTO {
  id: string;
  providerId: string;
  name: string;
  description: string;
  location: GeoLocation;
  startDate: string;
  endDate: string;
  recurrence: EventRecurrence;
  promotion: PromotionDTO | null;
  entryType: EventEntryType;
  /** Présent seulement quand `entryType` vaut "RESERVATION". */
  reservationUrl: string | null;
  /** Présent seulement quand `entryType` vaut "TICKET". */
  ticket: EventTicketDTO | null;
  cover: FileDTO | null;
  createdAt: string;
  updatedAt: string;
}

/** Enveloppe de pagination — miroir de PageDTO<T> (docs/sdk/locale-app-v2.md §1). */
export interface PageDTO<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
  numberOfElements: number;
  first: boolean;
  last: boolean;
  empty: boolean;
}

export interface PageParams {
  page?: number;
  size?: number;
  sort?: string;
}

export interface ListOffersParams extends PageParams {
  /** publicId d'un catalogue, pour filtrer les offres (query param conservé mais non documenté dans docs/sdk/locale-app-v2.md). */
  catalogue?: string;
}

/**
 * Réponse de POST /locale/app/v2/customers/from-token (docs/apis/apps/locale.md §5, yodoo_back).
 * Forme v1 réutilisée côté backend : `customer` est déclaré mais jamais rempli par
 * `CustomerProfileMapper`, toujours `null` en pratique aujourd'hui.
 */
export interface CustomerProfileDTO {
  id: string;
  customerName: string | null;
  customerPhoneNumber: string | null;
  customer: null;
  totalOrders: number;
  totalSpent: number;
  currency: string | null;
  allowNotifications: boolean | null;
  allowPersonalData: boolean | null;
}

export interface TopOffersParams {
  /** Fenêtre glissante, ex. "7d" (défaut serveur). */
  range?: string;
  /** Défaut serveur : 4. */
  limit?: number;
}
