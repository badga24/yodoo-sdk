import { describe, expect, it } from "vitest";
import {
  pageOf,
  syncCatalogueToDetail,
  syncCatalogueToTile,
  syncOfferToDetail,
  syncOfferToTile,
} from "./store-adapter.js";
import type { FileDTO, SyncCatalogueDTO, SyncOfferDTO } from "./types.js";

function file(id: string, kind: FileDTO["modelFileType"]): FileDTO {
  return {
    id,
    name: id,
    ratio: 1,
    contentType: "image/png",
    contentLength: 100,
    modelFileType: kind,
    uploadedBy: null,
    createdAt: "2026-01-01T00:00:00Z",
  };
}

const CATALOGUE: SyncCatalogueDTO = {
  id: "cat_1",
  name: "Pizzas",
  description: "les pizzas",
  cover: file("f_cover_cat", "COVER"),
  offerCount: 9,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-02T00:00:00Z",
};

const OFFER: SyncOfferDTO = {
  id: "off_1",
  name: "4 fromages",
  description: "<p>miam</p>",
  catalogueId: "cat_1",
  files: [file("f_other", "OTHER"), file("f_cover", "COVER")],
  prices: [
    { id: "p1" } as never,
    { id: "p2" } as never,
    { id: "p3" } as never,
  ],
  rating: { averageRating: 4.2, reviewCount: 7 },
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-03T00:00:00Z",
};

describe("pageOf", () => {
  it("returns everything in one page when no params", () => {
    const page = pageOf([1, 2, 3]);
    expect(page).toMatchObject({
      content: [1, 2, 3],
      totalElements: 3,
      totalPages: 1,
      number: 0,
      size: 3,
      numberOfElements: 3,
      first: true,
      last: true,
      empty: false,
    });
  });

  it("slices by page/size and computes flags", () => {
    const page = pageOf([1, 2, 3, 4, 5], { page: 1, size: 2 });
    expect(page.content).toEqual([3, 4]);
    expect(page).toMatchObject({
      totalElements: 5,
      totalPages: 3,
      number: 1,
      size: 2,
      numberOfElements: 2,
      first: false,
      last: false,
    });
  });

  it("marks the last page and handles an out-of-range page", () => {
    expect(pageOf([1, 2, 3], { page: 1, size: 2 })).toMatchObject({
      content: [3],
      last: true,
    });
    expect(pageOf([1, 2, 3], { page: 9, size: 2 })).toMatchObject({
      content: [],
      empty: true,
      last: true,
    });
  });

  it("does not clamp size and ignores sort", () => {
    const page = pageOf([1, 2, 3], { size: 1000, sort: "name,asc" });
    expect(page.size).toBe(1000);
    expect(page.content).toEqual([1, 2, 3]);
  });

  it("handles an empty list", () => {
    expect(pageOf([])).toMatchObject({
      content: [],
      totalElements: 0,
      totalPages: 1,
      empty: true,
      first: true,
      last: true,
    });
  });
});

describe("syncOfferToDetail", () => {
  it("adapts a sync offer to OfferDetailDTO with VISIBLE status and null marketplace", () => {
    const detail = syncOfferToDetail(OFFER, CATALOGUE);

    expect(detail.status).toBe("VISIBLE");
    expect(detail.marketplaceProfile).toBeNull();
    expect(detail.images).toBe(OFFER.files);
    expect(detail.catalogue).toEqual({
      id: "cat_1",
      name: "Pizzas",
      cover: CATALOGUE.cover,
    });
    expect(detail.prices.content).toHaveLength(3);
    expect(detail.prices.totalElements).toBe(3);
    expect(detail.rating).toBe(OFFER.rating);
  });

  it("paginates prices with params and leaves catalogue null when unknown", () => {
    const detail = syncOfferToDetail(OFFER, undefined, { page: 0, size: 2 });
    expect(detail.prices.content).toHaveLength(2);
    expect(detail.prices.totalPages).toBe(2);
    expect(detail.catalogue).toBeNull();
  });
});

describe("syncOfferToTile", () => {
  it("derives cover from the COVER file and priceCount from prices", () => {
    const tile = syncOfferToTile(OFFER);
    expect(tile).toEqual({
      id: "off_1",
      name: "4 fromages",
      status: "VISIBLE",
      cover: OFFER.files[1],
      priceCount: 3,
      rating: OFFER.rating,
      catalogueId: "cat_1",
      updatedAt: "2026-01-03T00:00:00Z",
    });
  });

  it("cover is null when no COVER file", () => {
    const tile = syncOfferToTile({ ...OFFER, files: [file("f", "OTHER")] });
    expect(tile.cover).toBeNull();
  });
});

describe("catalogue adapters", () => {
  it("syncCatalogueToDetail keeps every field", () => {
    expect(syncCatalogueToDetail(CATALOGUE)).toEqual({
      id: "cat_1",
      name: "Pizzas",
      description: "les pizzas",
      cover: CATALOGUE.cover,
      offerCount: 9,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-02T00:00:00Z",
    });
  });

  it("syncCatalogueToTile drops description/createdAt", () => {
    expect(syncCatalogueToTile(CATALOGUE)).toEqual({
      id: "cat_1",
      name: "Pizzas",
      cover: CATALOGUE.cover,
      offerCount: 9,
      updatedAt: "2026-01-02T00:00:00Z",
    });
  });
});
