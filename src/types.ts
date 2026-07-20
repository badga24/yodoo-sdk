/**
 * Types miroir des DTOs exposés par l'API Yodoo LocaleApp
 * (LocaleApp-integration-guide.md §2). Seuls les champs documentés sont
 * modélisés — pas de champ spéculatif.
 */

export interface GeoLocation {
  lat: number;
  lng: number;
}

export type ModelFileType = "COVER" | "OTHER" | "LOGO";

export interface FileRef {
  id: string;
  name: string;
  ratio: number;
  contentType: string;
  contentLength: number;
  modelFileType: ModelFileType;
  uploadedBy: string;
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

export interface Contact {
  id: string;
  value: string;
  type: ContactType;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export type AvailabilityFrequency = "WEEKLY" | "MONTHLY" | "YEARLY";

export interface Availability {
  id: string;
  startDate: string;
  endDate: string;
  frequency: AvailabilityFrequency;
}

export interface PaymentMethod {
  id: string;
  sourceId: string;
  source: string;
  providerCode: string;
  countryCode: string;
  isDefault: boolean;
  inactive: boolean;
  createdAt: string;
}

export interface Catalogue {
  id: string;
  name: string;
  cover: FileRef | null;
}

export interface OrderSetting {
  [key: string]: unknown;
}

export interface Price {
  id: string;
  name: string;
  negotiable: boolean;
  ignoresQuantity: boolean;
  /** Montants entiers dans la plus petite unité de la devise — jamais un flottant. */
  fixedPrice: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  currency: string;
  unitValue: number;
  unit: string;
  orderSettings: OrderSetting[];
  validity: string | null;
}

export interface Provider {
  id: string;
  name: string;
  location: GeoLocation;
  directions: string;
  identifier: string;
  utcOffset: string;
  totalRating: number;
  ratingCount: number;
  availabilities: Availability[];
  images: FileRef[];
  contacts: Contact[];
  preference: string;
  website: string;
  currency: string;
  receivesOrders: boolean;
  planName: string;
}

export type OfferStatus = "ACTIVE" | "VISIBLE" | "BLOCKED";

export interface Offer {
  id: string;
  name: string;
  description: string;
  prices: Price[];
  priceCount: number;
  availabilities: Availability[];
  images: FileRef[];
  catalogue: Catalogue;
  status: OfferStatus;
  provider: Provider;
  totalRating: number;
  ratingCount: number;
  location: GeoLocation;
  providerHandlesDelivery: boolean;
}

export interface TopOfferItem {
  offerId: string;
  name: string;
  value: number;
}

export interface TopOffers {
  items: TopOfferItem[];
}

/** Enveloppe de pagination — miroir de PageDTO<T> (guide §2). */
export interface Page<T> {
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
  /** publicId d'un catalogue, pour filtrer les offres. */
  catalogue?: string;
}

export interface TopOffersParams {
  /** Fenêtre glissante, ex. "7d" (défaut serveur). */
  range?: string;
  /** Défaut serveur : 4. */
  limit?: number;
}
