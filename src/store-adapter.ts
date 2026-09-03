import type {
  CatalogueDetailDTO,
  CatalogueTileDTO,
  OfferDetailDTO,
  OfferTileDTO,
  PageDTO,
  PageParams,
  SyncCatalogueDTO,
  SyncOfferDTO,
} from "./types.js";

/**
 * Adaptateurs `Sync*DTO` (formes du flux `sync`) -> DTOs API, pour que
 * `YodooClient.getOffer` / `listOffers` / `getCatalogue` / `listCatalogues` /
 * `listCatalogueOffers` puissent répondre depuis le `SyncStore` sans appel réseau quand il
 * est disponible. Sur ce chemin :
 * - `status` vaut toujours `"VISIBLE"` (le store ne contient que ça) ;
 * - `OfferDetailDTO.marketplaceProfile` est toujours `null` (absent du flux) ;
 * - la pagination n'honore que `page`/`size` (le store a un ordre stable, `sort` est ignoré)
 *   et `size` n'est pas plafonné à 30.
 */

/** Enveloppe une liste en mémoire dans un `PageDTO` (slice `page`/`size` ; `sort` ignoré). */
export function pageOf<T>(items: T[], params?: PageParams): PageDTO<T> {
  const size = params?.size ?? (items.length || 1);
  const number = params?.page ?? 0;
  const start = number * size;
  const content = items.slice(start, start + size);
  const totalPages = Math.max(1, Math.ceil(items.length / size));
  return {
    content,
    totalElements: items.length,
    totalPages,
    number,
    size,
    numberOfElements: content.length,
    first: number === 0,
    last: number >= totalPages - 1,
    empty: content.length === 0,
  };
}

export function syncOfferToDetail(
  offer: SyncOfferDTO,
  catalogue: SyncCatalogueDTO | undefined,
  params?: PageParams
): OfferDetailDTO {
  return {
    id: offer.id,
    name: offer.name,
    description: offer.description,
    status: "VISIBLE",
    prices: pageOf(offer.prices, params),
    images: offer.files,
    catalogue: catalogue
      ? { id: catalogue.id, name: catalogue.name, cover: catalogue.cover }
      : null,
    marketplaceProfile: null,
    rating: offer.rating,
    createdAt: offer.createdAt,
    updatedAt: offer.updatedAt,
  };
}

export function syncOfferToTile(offer: SyncOfferDTO): OfferTileDTO {
  return {
    id: offer.id,
    name: offer.name,
    status: "VISIBLE",
    cover: offer.files.find((f) => f.modelFileType === "COVER") ?? null,
    priceCount: offer.prices.length,
    rating: offer.rating,
    catalogueId: offer.catalogueId,
    updatedAt: offer.updatedAt,
  };
}

export function syncCatalogueToDetail(
  catalogue: SyncCatalogueDTO
): CatalogueDetailDTO {
  return {
    id: catalogue.id,
    name: catalogue.name,
    description: catalogue.description,
    cover: catalogue.cover,
    offerCount: catalogue.offerCount,
    createdAt: catalogue.createdAt,
    updatedAt: catalogue.updatedAt,
  };
}

export function syncCatalogueToTile(
  catalogue: SyncCatalogueDTO
): CatalogueTileDTO {
  return {
    id: catalogue.id,
    name: catalogue.name,
    cover: catalogue.cover,
    offerCount: catalogue.offerCount,
    updatedAt: catalogue.updatedAt,
  };
}
