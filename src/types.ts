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
  /**
   * Solde suivi de ce moyen de paiement (typiquement le compte `CASH` du commerce ou son
   * `FEDAPAY_HOLDING`), `null` si non suivi. ⚠️ Donnée financière normalement réservée au
   * propriétaire : cet endpoint la partage avec l'app tierce sans vue allégée (depuis le
   * 15/08/2026, voir docs/apis/apps/locale.md §1 dans yodoo_back).
   */
  walletBalance: string | null;
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
  /**
   * publicId d'un catalogue (ou plusieurs, pour un match sur l'union), pour filtrer les
   * offres. *(Depuis le 30/08/2026.)* Un tableau est accepté en plus d'une valeur unique —
   * le paramètre est répété dans la query string (`?catalogue=A&catalogue=B`). Si un
   * `publicId` fourni n'existe pas ou n'appartient pas au commerce authentifié, l'appel
   * échoue en `404` (au lieu d'une page vide).
   */
  catalogue?: string | string[];
  /**
   * publicId d'un `OfferGroup`, pour filtrer les offres — indépendant de `catalogue` et
   * cumulable avec lui. `OfferGroup` n'est plus exposé par cette API (les endpoints de
   * découverte ont été retirés) : aucun moyen d'obtenir un id valide via ce client, il faut
   * le tenir d'ailleurs.
   */
  group?: string;
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

/**
 * Résultat de GET /locale/app/v2/content (docs/apis/apps/locale.md §6, yodoo_back) — contenu HTML
 * du site vitrine du commerce, par clé.
 *
 * `content` vaut `null` sur un 304 (Not Modified) : passer `lastModified` reçu au précédent appel
 * en `ifModifiedSince` à `getContent()` permet de vérifier gratuitement s'il y a du nouveau — un
 * 304 ne consomme pas le quota horaire (1 payload réel/heure/app, 429 au-delà).
 */
export interface ContentResult {
  content: Record<string, string> | null;
  lastModified: string | null;
}

/**
 * Une entrée de GET /locale/app/v2/content/entries (docs/apis/apps/locale.md §6, yodoo_back,
 * ajouté le 18/09/2026) — même valeur HTML que `ContentResult`, plus les liens optionnels de la
 * clé vers une ressource. `fileId`/`offerId`/`priceId`/`catalogueId` sont tous nullables et
 * indépendants (une clé peut n'en avoir aucun, un seul, ou plusieurs). Aucun objet résolu n'est
 * jamais inclus ici — aller chercher la ressource soi-même : `getFile(fileId)` (bytes),
 * `getOffer(offerId)`, `getCatalogue(catalogueId)`. `priceId` n'a pas d'endpoint de lecture dédié
 * sur cette API — le prix se retrouve via l'offre qui le porte.
 */
export interface ContentEntryDTO {
  value: string;
  fileId: string | null;
  offerId: string | null;
  priceId: string | null;
  catalogueId: string | null;
}

/**
 * Résultat de GET /locale/app/v2/content/entries (docs/apis/apps/locale.md §6, yodoo_back) — même
 * sémantique de fraîcheur que `ContentResult` (`content: null` sur un 304). **Partage le même
 * budget horaire et le même bucket `If-Modified-Since` que `getContent()`** côté serveur :
 * alterner entre les deux endpoints ne double pas le quota disponible.
 */
export interface ContentEntriesResult {
  content: Record<string, ContentEntryDTO> | null;
  lastModified: string | null;
}

export interface TopOffersParams {
  /** Fenêtre glissante, ex. "7d" (défaut serveur). */
  range?: string;
  /** Défaut serveur : 4. */
  limit?: number;
}

// --- Synchronisation full-replace NDJSON (docs/apis/apps/locale.md §7, yodoo_back) ---
//
// Deux flux indépendants depuis le 03/09/2026 :
//   GET /locale/app/v2/sync/main   -> lignes `catalogue` + `offer` (VISIBLE)
//   GET /locale/app/v2/sync/others -> ligne `content` (1) + lignes `event`
// Chacun a son propre `version`, son propre `meta.counts` (ses domaines seulement) et son
// propre budget horaire. `YodooClient.sync()` lit les deux et les recompose en un `SyncStore`.

/** `meta.counts` du flux `sync/main` — sert à détecter un corps tronqué. */
export interface SyncMainCounts {
  catalogues: number;
  offers: number;
}

/** `meta.counts` du flux `sync/others`. */
export interface SyncOthersCounts {
  /** Toujours 1 (la ligne `content` est unique, sa map peut être vide). */
  content: number;
  events: number;
}

/**
 * Ligne `catalogue` du flux `sync/main` — même forme que `CatalogueDetailDTO`
 * (le flux porte le détail complet, pas la tuile).
 */
export interface SyncCatalogueDTO {
  id: string;
  name: string;
  description: string;
  /** `FileDTO` = référence seule, jamais d'octets (bytes via `getFileUrl()` / `/public/file/**`). */
  cover: FileDTO | null;
  /**
   * Compte toutes les offres du catalogue, tous statuts — pas seulement les `VISIBLE`
   * streamées comme lignes `offer`. Un écart avec le nombre de lignes `offer` d'un même
   * catalogue est donc attendu.
   */
  offerCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Ligne `offer` du flux `sync/main` — offres `VISIBLE` uniquement (pas de champ `status`),
 * `description` HTML complète inline, prix et fichiers embarqués : le consommateur n'appelle
 * plus jamais `getOffer(id)`.
 */
export interface SyncOfferDTO {
  id: string;
  name: string;
  /** HTML complet, inline (pas de troncature). */
  description: string;
  catalogueId: string | null;
  /** Cover incluse (repérable via `modelFileType`) ; références seules, jamais d'octets. */
  files: FileDTO[];
  /** `PriceDTO` v2, promotions actives déjà résolues dans les montants. */
  prices: PriceDTO[];
  rating: RatingSummaryDTO;
  createdAt: string;
  updatedAt: string;
}

/**
 * Ligne `event` du flux `sync/others` — `EventTileDTO` sans `ownRsvp` (un credential d'app
 * n'est pas un visiteur) ni `provider` (implicite). `promotion` résolue.
 */
export interface SyncEventDTO {
  id: string;
  name: string;
  description: string;
  location: GeoLocation;
  startDate: string;
  endDate: string;
  promotion: PromotionDTO | null;
  /**
   * Billet **résolu inline** (`{ id, name, description, status }` — même forme que
   * `EventDetailDTO.ticket`), ou `null` si l'événement n'a pas de billet. Les **prix et
   * fichiers** du billet ne sont pas ici : quand `ticketOffer.status === "VISIBLE"`, ils
   * arrivent via la ligne `offer` correspondante dans `sync/main` (jointure sur
   * `ticketOffer.id` — voir `SyncStore.resolveTicket()`). Tolérer un `ticketOffer` non encore
   * joignable juste après la création d'un événement à billet : le CTA se rend déjà avec le
   * nom + le statut.
   */
  ticketOffer: EventTicketDTO | null;
  cover: FileDTO | null;
  goingCount: number;
  interestedCount: number;
  postCount: number;
  viewCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Moitié `sync/main` d'un snapshot — catalogues + offres visibles, lus dans une seule
 * transaction cohérente. `version` : digest opaque **de ce flux** (SHA-256 tronqué hex), à
 * stocker tel quel et comparer par égalité stricte ; ne rien en déduire d'autre.
 */
export interface SyncMainSnapshot {
  version: string;
  /** Instant de génération côté serveur (ISO 8601). */
  generatedAt: string;
  catalogues: SyncCatalogueDTO[];
  offers: SyncOfferDTO[];
  /** Total des lignes de données de ce flux (entre `meta` et `end`). */
  records: number;
}

/**
 * Moitié `sync/others` d'un snapshot — contenu du site + événements. `version` : digest
 * opaque **de ce flux**, indépendant de celui de `sync/main`.
 */
export interface SyncOthersSnapshot {
  version: string;
  /** Instant de génération côté serveur (ISO 8601). */
  generatedAt: string;
  /** Contenu HTML du site vitrine (clé → HTML), identique à `getContent()`. Map éventuellement vide. */
  content: Record<string, string>;
  events: SyncEventDTO[];
  /** Total des lignes de données de ce flux (entre `meta` et `end`). */
  records: number;
}

/**
 * Snapshot complet du commerce = les deux moitiés (`sync/main` + `sync/others`), prises à
 * quelques secondes d'écart. POJO sérialisable — `YodooClient.sync()` en renvoie une vue
 * indexée (`SyncStore`) ; c'est aussi ce que produit `SyncStore.toJSON()` et ce qu'attend
 * `new SyncStore(snapshot)`.
 */
export interface SyncSnapshot {
  main: SyncMainSnapshot;
  others: SyncOthersSnapshot;
}

// --- Commandes (POST /locale/app/v2/orders, .../pay/mobile-money — docs/apis/apps/locale.md §8, yodoo_back) ---

/**
 * Métadonnées d'une photo soumise en réponse à un `PriceOrderSetting` de spécification PHOTO —
 * pas les octets eux-mêmes, uploadés séparément après coup via `uploadOrderPhoto()` une fois la
 * commande créée (voir `PendingPhotoUploadDTO`).
 */
export interface CreateOrderPhotoDTO {
  name: string;
  contentType: string;
  contentLength: number;
  ratio: number;
}

export interface CreateOrderItemPriceSettingDTO {
  setting: string;
  response: string;
  /**
   * Uniquement pour une spécification PHOTO. *(Depuis le 18/09/2026 : réellement pris en compte
   * côté serveur — auparavant accepté sans erreur mais silencieusement ignoré, aucun `File`
   * n'était créé et aucune route d'upload n'existait.)* Un `File` Provider-owned taggé
   * `CUSTOMER_UPLOAD` est créé par photo soumise ; leurs `publicId` reviennent dans
   * `BusinessOrderCreatedDTO.pendingPhotoUploads`, à uploader ensuite un par un via
   * `uploadOrderPhoto()`.
   */
  files?: CreateOrderPhotoDTO[];
}

/** Requête — une ligne de prix pour un article de `createOrder()`. */
export interface CreateOrderItemPriceDTO {
  price: string;
  /**
   * Chaîne de chiffres (montant unitaire en plus petite unité de devise). Facultatif : absent, le
   * commerce fixe le prix lui-même avant de clôturer la commande.
   */
  finalPrice?: string;
  quantity: number;
  /**
   * `publicId` (UUID) choisis par l'app pour les lignes créées — exactement `quantity` pour un prix
   * à unités individuelles (une ligne par unité), exactement 1 sinon (`400` si le compte ne colle
   * pas). Générés par Yodoo si absents.
   */
  ids?: string[];
  responses?: CreateOrderItemPriceSettingDTO[];
}

/** Requête — un article de `createOrder()`. */
export interface CreateOrderItemDTO {
  /** `publicId` (UUID) choisi par l'app pour cet article ; généré par Yodoo si absent. */
  id?: string;
  offer: string;
  prices: CreateOrderItemPriceDTO[];
}

/** Options de `createOrder()` en plus des articles, du code client et de la note. */
export interface CreateOrderOptions {
  /**
   * `publicId` (UUID) choisi par l'app pour la commande — rend la création **idempotente** :
   * renvoyer la même requête après une réponse perdue renvoie la commande déjà créée (`201`)
   * au lieu d'en créer une seconde. Un `id` appartenant à un autre commerce échoue en `409`.
   * Avec un `offlineAuthorizationCode`, doit égaler l'id de commande signé dans le code (`400`
   * sinon).
   */
  id?: string;
  /** Date de création à enregistrer (commande prise hors-ligne) ; heure serveur sinon. */
  createdAt?: string | Date;
}

/**
 * `TOGOCOM` (T-Money) est le seul de ces fournisseurs à n'être valide qu'avec
 * `countryCode: "TG"` — les autres sont acceptés avec tous les `MobileMoneyCountryCode` sans
 * garantie que l'opérateur y opère réellement (ex. `MTN`/`TG` est accepté bien que MTN
 * n'opère pas au Togo).
 */
export type MobileMoneyProviderCode = "MTN" | "MOOV" | "CELTIS" | "TOGOCOM";

export type MobileMoneyCountryCode =
  | "BJ"
  | "CI"
  | "SN"
  | "TG"
  | "BF"
  | "ML"
  | "NE"
  | "GW"
  | "NG"
  | "GH";

export interface PayOrderByMobileMoneyParams {
  phoneNumber: string;
  providerCode: MobileMoneyProviderCode;
  countryCode: MobileMoneyCountryCode;
  /**
   * Identifie le client au nom de qui payer (code hors-ligne signé, généré côté app cliente).
   * Techniquement optionnel côté DTO mais rejeté (403) par Yodoo si absent — payer une
   * commande agit forcément au nom d'un client précis, donc obligatoire en pratique.
   */
  offlineAuthorizationCode: string;
  /**
   * Généré une fois par tentative de paiement, réutilisé tel quel sur tout retry de cette même
   * tentative : une clé déjà vue rejoue le résultat déjà obtenu au lieu de retraiter. La
   * réutiliser pour une commande différente échoue en 409.
   */
  idempotencyKey: string;
}

/**
 * Une entrée de `BusinessOrderCreatedDTO.pendingPhotoUploads` — une réponse PHOTO soumise à la
 * création dont les octets restent à envoyer. `files` liste les `publicId` des `File` déjà créés
 * côté serveur (un par photo soumise dans `responses[].files`), chacun à uploader via
 * `uploadOrderPhoto(orderId, setting, fileId, ...)`.
 */
export interface PendingPhotoUploadDTO {
  item: string;
  price: string;
  setting: string;
  files: string[];
}

/**
 * Réponse de POST /locale/app/v2/orders (docs/apis/apps/locale.md §8, yodoo_back). Remplace,
 * depuis le 18/09/2026, le `OrderDTO` v1 renvoyé jusque-là par cet endpoint — mêmes champs que
 * celui-ci en pratique (`items`/`customer`/`locale`/`itemsCount` n'y étaient déjà pas peuplés),
 * plus `pendingPhotoUploads` : vide sauf si au moins une réponse PHOTO a été soumise dans
 * `items[].prices[].responses[].files`, auquel cas chaque entrée s'uploade ensuite via
 * `uploadOrderPhoto()`.
 */
export interface BusinessOrderCreatedDTO {
  id: string;
  validatedByCustomer: boolean;
  validatedByLocale: boolean;
  completed: boolean;
  allFinalPricesSet: boolean;
  requiresManualPricing: boolean;
  started: boolean;
  hasPendingItem: boolean;
  hasProcessingItem: boolean;
  allProcessing: boolean;
  fullyFulfilled: boolean;
  hasRejectedItem: boolean;
  hasItemCancelledByUser: boolean;
  hasItemCancelledByProvider: boolean;
  openItemCount: number;
  closedItemCount: number;
  note: string | null;
  updatedAt: string;
  pendingPhotoUploads: PendingPhotoUploadDTO[];
}

/**
 * Réponse de POST /locale/app/v2/orders/{order}/pay/mobile-money (docs/apis/apps/locale.md §8,
 * yodoo_back). `totalDue` est le solde restant dû (recalculé à chaque paiement confirmé), pas le
 * montant facial d'origine — `totalDue + amountPaid` le redonne si besoin.
 */
export interface InvoiceDTO {
  id: string;
  reason: string;
  status: string;
  totalDue: number;
  amountPaid: number;
  currencyType: string;
  createdAt: string;
  updatedAt: string;
}

// --- Chat IA visiteur (POST /locale/app/v2/ai/chat, GET .../ai/sessions/{id}/messages) ---

/**
 * Identité **déclarée** par un visiteur du site (jamais vérifiée par Yodoo). Rattache la
 * conversation / le jeton push au client du commerce enregistré avec ce numéro (créé s'il
 * n'existe pas) ; ne donne accès à aucune donnée de ce client.
 */
export interface VisitorDTO {
  /** 100 caractères max. */
  name: string;
  /** 20 caractères max. */
  phoneNumber: string;
}

export interface AiChatParams {
  /** Conversation à poursuivre (`sessionId` d'une réponse précédente) ; absent/`null` → nouvelle conversation. */
  sessionId?: string | null;
  message: string;
  /** Pris en compte une seule fois par conversation : le premier `visitor` envoyé compte. */
  visitor?: VisitorDTO;
}

export type AiMessageRole = "USER" | "ASSISTANT";

export type AiReferenceType = "PROVIDER" | "OFFER" | "PRICE" | "CATALOGUE" | "FILE";

/** Élément dont parle une réponse de l'assistant, à afficher en carte — `id` = publicId de la ressource. */
export interface AiMessageReferenceDTO {
  type: AiReferenceType;
  id: string;
}

/**
 * Un message d'une conversation avec l'assistant IA du commerce. Si `errorCode` est non-null,
 * `content` est une **notice** (dans la langue demandée) à afficher telle quelle au lieu d'une
 * réponse — ex. `VISITOR_SESSION_CAP_REACHED` (limite de la conversation atteinte : proposer
 * d'en démarrer une nouvelle), `VISITOR_DAILY_CAP_REACHED` (limite du jour du commerce atteinte :
 * réessayer le lendemain, jour UTC), ou un échec des modèles (`ALL_UNAVAILABLE`,
 * `QUOTA_EXHAUSTED`, `YODOO_QUOTA_EXHAUSTED`…).
 */
export interface AiMessageDTO {
  id: string;
  sessionId: string;
  role: AiMessageRole;
  content: string;
  errorCode: string | null;
  /** Toujours vide sur un message `USER`. */
  references: AiMessageReferenceDTO[];
  createdAt: string;
}

// --- Notifications push (GET/POST/DELETE /locale/app/v2/push/**) ---

/**
 * Config web Firebase **publique** du projet commun à toutes les apps Yodoo — identique pour tous
 * les domaines, transmissible telle quelle au navigateur. `available: false` (tous les autres
 * champs `null`) : le push n'est pas disponible, ne pas proposer les notifications.
 */
export interface PushConfigDTO {
  available: boolean;
  apiKey: string | null;
  projectId: string | null;
  messagingSenderId: string | null;
  appId: string | null;
  /** Clé VAPID publique, à passer à `getToken(messaging, { vapidKey })`. */
  vapidKey: string | null;
}

export type PushPlatform = "WEB" | "ANDROID" | "IOS";

export interface RegisterPushDeviceParams {
  /** Jeton d'enregistrement Firebase (512 caractères max). */
  token: string;
  platform: PushPlatform;
  /**
   * Identité déclarée du visiteur — même règle que le chat IA. Renvoyé avec un autre visiteur, le
   * jeton change de client (appareil partagé) ; omis, il garde son rattachement actuel. Seuls les
   * jetons rattachés à un client sont atteints par les campagnes du commerce.
   */
  visitor?: VisitorDTO;
}
