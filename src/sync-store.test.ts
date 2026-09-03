import { describe, expect, it } from "vitest";
import { SyncStore } from "./sync-store.js";
import type {
  SyncCatalogueDTO,
  SyncEventDTO,
  SyncOfferDTO,
  SyncSnapshot,
} from "./types.js";

function catalogue(id: string): SyncCatalogueDTO {
  return {
    id,
    name: id,
    description: "",
    cover: null,
    offerCount: 5,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
  };
}

function offer(id: string, catalogueId: string | null): SyncOfferDTO {
  return {
    id,
    name: id,
    description: `<p>${id}</p>`,
    catalogueId,
    files: [],
    prices: [],
    rating: { averageRating: 0, reviewCount: 0 },
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-03T00:00:00Z",
  };
}

function event(id: string, ticketOfferId: string | null): SyncEventDTO {
  return {
    id,
    name: id,
    description: "",
    location: { lat: 6.37, lng: 2.43 },
    startDate: "2026-08-01T20:00:00Z",
    endDate: "2026-08-02T02:00:00Z",
    promotion: null,
    ticketOfferId,
    cover: null,
    goingCount: 0,
    interestedCount: 0,
    postCount: 0,
    viewCount: 0,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-04T00:00:00Z",
  };
}

function snapshot(overrides: Partial<SyncSnapshot> = {}): SyncSnapshot {
  return {
    version: "9f3c1a7b0d2e4f10",
    generatedAt: "2026-09-03T10:00:00Z",
    content: { hero: "<h1>Salut</h1>" },
    catalogues: [catalogue("cat_1"), catalogue("cat_2")],
    offers: [
      offer("off_1", "cat_1"),
      offer("off_2", "cat_1"),
      offer("off_3", "cat_2"),
      offer("off_orphan", null),
    ],
    events: [event("evt_1", "off_3"), event("evt_2", null)],
    records: 9,
    ...overrides,
  };
}

describe("SyncStore", () => {
  it("exposes snapshot metadata", () => {
    const store = new SyncStore(snapshot());

    expect(store.version).toBe("9f3c1a7b0d2e4f10");
    expect(store.generatedAt).toBe("2026-09-03T10:00:00Z");
    expect(store.content).toEqual({ hero: "<h1>Salut</h1>" });
    expect(store.unchanged).toBe(false);
  });

  it("carries the unchanged flag from options", () => {
    expect(new SyncStore(snapshot(), { unchanged: true }).unchanged).toBe(true);
  });

  it("resolves catalogues, offers and events by id", () => {
    const store = new SyncStore(snapshot());

    expect(store.getCatalogue("cat_2")?.name).toBe("cat_2");
    expect(store.getOffer("off_2")?.id).toBe("off_2");
    expect(store.getEvent("evt_1")?.ticketOfferId).toBe("off_3");
  });

  it("returns undefined for an id absent from the snapshot (no API fallback)", () => {
    const store = new SyncStore(snapshot());

    expect(store.getOffer("off_missing")).toBeUndefined();
    expect(store.getCatalogue("cat_missing")).toBeUndefined();
    expect(store.getEvent("evt_missing")).toBeUndefined();
  });

  it("lists every offer when no filter is given", () => {
    const store = new SyncStore(snapshot());
    expect(store.listOffers().map((o) => o.id)).toEqual([
      "off_1",
      "off_2",
      "off_3",
      "off_orphan",
    ]);
  });

  it("filters offers by a single catalogue id", () => {
    const store = new SyncStore(snapshot());
    expect(store.listOffers({ catalogue: "cat_1" }).map((o) => o.id)).toEqual([
      "off_1",
      "off_2",
    ]);
  });

  it("filters offers by a union of catalogue ids", () => {
    const store = new SyncStore(snapshot());
    expect(
      store.listOffers({ catalogue: ["cat_1", "cat_2"] }).map((o) => o.id)
    ).toEqual(["off_1", "off_2", "off_3"]);
  });

  it("never returns an offer without a catalogue when a filter is set", () => {
    const store = new SyncStore(snapshot());
    expect(store.listOffers({ catalogue: "cat_1" })).not.toContainEqual(
      expect.objectContaining({ id: "off_orphan" })
    );
  });

  it("returns an empty list for an unknown catalogue id, without throwing", () => {
    const store = new SyncStore(snapshot());
    expect(store.listOffers({ catalogue: "cat_nope" })).toEqual([]);
    expect(store.listCatalogueOffers("cat_nope")).toEqual([]);
  });

  it("listCatalogueOffers matches listOffers({ catalogue })", () => {
    const store = new SyncStore(snapshot());
    expect(store.listCatalogueOffers("cat_1")).toEqual(
      store.listOffers({ catalogue: "cat_1" })
    );
  });

  it("returns defensive copies from list methods", () => {
    const store = new SyncStore(snapshot());

    store.listCatalogues().sort((a, b) => b.id.localeCompare(a.id));
    store.listOffers().pop();
    store.listEvents().length = 0;

    expect(store.listCatalogues().map((c) => c.id)).toEqual(["cat_1", "cat_2"]);
    expect(store.listOffers()).toHaveLength(4);
    expect(store.listEvents()).toHaveLength(2);
  });

  it("resolves an event ticket against the visible offers", () => {
    const store = new SyncStore(snapshot());
    expect(store.resolveTicket(store.getEvent("evt_1")!)?.id).toBe("off_3");
  });

  it("returns undefined resolving a ticket that has no id or is not visible", () => {
    const store = new SyncStore(snapshot());

    expect(store.resolveTicket(store.getEvent("evt_2")!)).toBeUndefined();
    expect(
      store.resolveTicket(event("evt_x", "off_hidden"))
    ).toBeUndefined();
  });

  it("round-trips through toJSON()", () => {
    const store = new SyncStore(snapshot());
    const rebuilt = new SyncStore(JSON.parse(JSON.stringify(store.toJSON())));

    expect(rebuilt.version).toBe(store.version);
    expect(rebuilt.getOffer("off_2")).toEqual(store.getOffer("off_2"));
    expect(rebuilt.listOffers({ catalogue: "cat_2" }).map((o) => o.id)).toEqual([
      "off_3",
    ]);
  });
});
