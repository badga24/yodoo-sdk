import { describe, expect, it } from "vitest";
import { SyncStore } from "./sync-store.js";
import type {
  EventTicketDTO,
  SyncCatalogueDTO,
  SyncEventDTO,
  SyncMainSnapshot,
  SyncOfferDTO,
  SyncOthersSnapshot,
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

function event(id: string, ticketOffer: EventTicketDTO | null): SyncEventDTO {
  return {
    id,
    name: id,
    description: "",
    location: { lat: 6.37, lng: 2.43 },
    startDate: "2026-08-01T20:00:00Z",
    endDate: "2026-08-02T02:00:00Z",
    promotion: null,
    ticketOffer,
    cover: null,
    goingCount: 0,
    interestedCount: 0,
    postCount: 0,
    viewCount: 0,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-04T00:00:00Z",
  };
}

function ticket(id: string, status = "VISIBLE"): EventTicketDTO {
  return { id, name: id, description: "", status: status as EventTicketDTO["status"] };
}

function mainSnapshot(version = "main-v1"): SyncMainSnapshot {
  return {
    version,
    generatedAt: "2026-09-03T10:00:00Z",
    catalogues: [catalogue("cat_1"), catalogue("cat_2")],
    offers: [
      offer("off_1", "cat_1"),
      offer("off_2", "cat_1"),
      offer("off_3", "cat_2"),
      offer("off_orphan", null),
    ],
    records: 6,
  };
}

function othersSnapshot(version = "others-v1"): SyncOthersSnapshot {
  return {
    version,
    generatedAt: "2026-09-03T10:00:05Z",
    content: { hero: "<h1>Salut</h1>" },
    events: [event("evt_1", ticket("off_3")), event("evt_2", null)],
    records: 3,
  };
}

function snapshot(overrides: Partial<SyncSnapshot> = {}): SyncSnapshot {
  return { main: mainSnapshot(), others: othersSnapshot(), ...overrides };
}

describe("SyncStore", () => {
  it("exposes per-stream metadata", () => {
    const store = new SyncStore(snapshot());

    expect(store.version).toEqual({ main: "main-v1", others: "others-v1" });
    expect(store.generatedAt).toEqual({
      main: "2026-09-03T10:00:00Z",
      others: "2026-09-03T10:00:05Z",
    });
    expect(store.content).toEqual({ hero: "<h1>Salut</h1>" });
    expect(store.unchanged).toEqual({ main: false, others: false });
  });

  it("carries a partial unchanged flag from options", () => {
    const store = new SyncStore(snapshot(), { unchanged: { main: true } });
    expect(store.unchanged).toEqual({ main: true, others: false });
  });

  it("resolves catalogues and offers from sync/main, events from sync/others", () => {
    const store = new SyncStore(snapshot());

    expect(store.getCatalogue("cat_2")?.name).toBe("cat_2");
    expect(store.getOffer("off_2")?.id).toBe("off_2");
    expect(store.getEvent("evt_1")?.ticketOffer?.id).toBe("off_3");
  });

  it("returns undefined for an id absent from the snapshot (no API fallback)", () => {
    const store = new SyncStore(snapshot());

    expect(store.getOffer("off_missing")).toBeUndefined();
    expect(store.getCatalogue("cat_missing")).toBeUndefined();
    expect(store.getEvent("evt_missing")).toBeUndefined();
  });

  it("filters offers by a union of catalogue ids and drops orphans", () => {
    const store = new SyncStore(snapshot());

    expect(store.listOffers().map((o) => o.id)).toEqual([
      "off_1",
      "off_2",
      "off_3",
      "off_orphan",
    ]);
    expect(
      store.listOffers({ catalogue: ["cat_1", "cat_2"] }).map((o) => o.id)
    ).toEqual(["off_1", "off_2", "off_3"]);
    expect(store.listCatalogueOffers("cat_1").map((o) => o.id)).toEqual([
      "off_1",
      "off_2",
    ]);
    expect(store.listOffers({ catalogue: "cat_nope" })).toEqual([]);
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

  it("resolves an event ticket to the full offer from sync/main", () => {
    const store = new SyncStore(snapshot());
    expect(store.resolveTicket(store.getEvent("evt_1")!)?.id).toBe("off_3");
  });

  it("returns undefined resolving a ticket that is absent, or has no ticketOffer", () => {
    const store = new SyncStore(snapshot());

    expect(store.resolveTicket(store.getEvent("evt_2")!)).toBeUndefined();
    expect(
      store.resolveTicket(event("evt_x", ticket("off_hidden")))
    ).toBeUndefined();
  });

  it("withMain swaps only the main half and keeps others", () => {
    const store = new SyncStore(snapshot(), { unchanged: { others: true } });
    const nextMain: SyncMainSnapshot = {
      ...mainSnapshot("main-v2"),
      offers: [offer("off_99", "cat_1")],
    };

    const next = store.withMain(nextMain, false);

    expect(next.version).toEqual({ main: "main-v2", others: "others-v1" });
    expect(next.unchanged).toEqual({ main: false, others: true });
    expect(next.getOffer("off_99")?.id).toBe("off_99");
    expect(next.getOffer("off_1")).toBeUndefined();
    expect(next.getEvent("evt_1")?.id).toBe("evt_1"); // others untouched
    expect(store.getOffer("off_1")?.id).toBe("off_1"); // original unchanged
  });

  it("withOthers swaps only the others half and keeps main", () => {
    const store = new SyncStore(snapshot());
    const nextOthers: SyncOthersSnapshot = {
      ...othersSnapshot("others-v2"),
      events: [event("evt_new", null)],
      content: { hero: "<h1>Bonjour</h1>" },
    };

    const next = store.withOthers(nextOthers, true);

    expect(next.version).toEqual({ main: "main-v1", others: "others-v2" });
    expect(next.unchanged).toEqual({ main: false, others: true });
    expect(next.content).toEqual({ hero: "<h1>Bonjour</h1>" });
    expect(next.getEvent("evt_new")?.id).toBe("evt_new");
    expect(next.getEvent("evt_1")).toBeUndefined();
    expect(next.getOffer("off_1")?.id).toBe("off_1"); // main untouched
  });

  it("round-trips through toJSON()", () => {
    const store = new SyncStore(snapshot());
    const rebuilt = new SyncStore(JSON.parse(JSON.stringify(store.toJSON())));

    expect(rebuilt.version).toEqual(store.version);
    expect(rebuilt.getOffer("off_2")).toEqual(store.getOffer("off_2"));
    expect(rebuilt.listOffers({ catalogue: "cat_2" }).map((o) => o.id)).toEqual([
      "off_3",
    ]);
  });
});
