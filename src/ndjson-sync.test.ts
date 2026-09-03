import { describe, expect, it } from "vitest";
import { SyncProtocolError } from "./errors.js";
import {
  parseSyncMain,
  parseSyncOthers,
  streamLines,
} from "./ndjson-sync.js";

const CAT_1 = {
  type: "catalogue",
  id: "cat_1",
  name: "Pizzas",
  description: "",
  cover: null,
  offerCount: 3,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-02T00:00:00Z",
};
const CAT_2 = { ...CAT_1, id: "cat_2", name: "Boissons" };
const OFFER = {
  type: "offer",
  id: "off_1",
  name: "4 fromages",
  description: "<p>délicieuse</p>",
  catalogueId: "cat_1",
  files: [],
  prices: [],
  rating: { averageRating: 4.5, reviewCount: 12 },
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-03T00:00:00Z",
};
const CONTENT = { type: "content", entries: { hero: "<h1>Salut</h1>" } };
const EVENT = {
  type: "event",
  id: "evt_1",
  name: "Soirée DJ",
  description: "",
  location: { lat: 6.37, lng: 2.43 },
  startDate: "2026-08-01T20:00:00Z",
  endDate: "2026-08-02T02:00:00Z",
  promotion: null,
  ticketOffer: { id: "off_1", name: "4 fromages", description: "", status: "VISIBLE" },
  cover: null,
  goingCount: 12,
  interestedCount: 30,
  postCount: 4,
  viewCount: 210,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-04T00:00:00Z",
};

function mainStream(): unknown[] {
  return [
    { type: "meta", generatedAt: "2026-09-03T10:00:00Z", counts: { catalogues: 2, offers: 1 } },
    CAT_1,
    CAT_2,
    OFFER,
    { type: "end", version: "main-v1", records: 3 },
  ];
}

function othersStream(): unknown[] {
  return [
    { type: "meta", generatedAt: "2026-09-03T10:00:05Z", counts: { content: 1, events: 1 } },
    CONTENT,
    EVENT,
    { type: "end", version: "others-v1", records: 2 },
  ];
}

async function* linesFrom(records: unknown[]): AsyncGenerator<string> {
  for (const record of records) yield JSON.stringify(record);
}

async function* rawLines(...lines: string[]): AsyncGenerator<string> {
  for (const line of lines) yield line;
}

async function* bytes(...chunks: string[]): AsyncGenerator<Uint8Array> {
  const encoder = new TextEncoder();
  for (const chunk of chunks) yield encoder.encode(chunk);
}

describe("parseSyncMain", () => {
  it("assembles a main snapshot from a well-formed stream", async () => {
    const snap = await parseSyncMain(linesFrom(mainStream()));

    expect(snap.version).toBe("main-v1");
    expect(snap.generatedAt).toBe("2026-09-03T10:00:00Z");
    expect(snap.records).toBe(3);
    expect(snap.catalogues.map((c) => c.id)).toEqual(["cat_1", "cat_2"]);
    expect(snap.offers).toHaveLength(1);
    expect(snap.offers[0]).not.toHaveProperty("type");
  });

  it("rejects an `event` line in the main stream", async () => {
    const records = [
      { type: "meta", generatedAt: "t", counts: { catalogues: 0, offers: 0 } },
      EVENT,
      { type: "end", version: "v", records: 1 },
    ];
    await expect(parseSyncMain(linesFrom(records))).rejects.toThrow(/inattendu/);
  });

  it("rejects a `content` key in the main stream meta.counts", async () => {
    const records = [
      { type: "meta", generatedAt: "t", counts: { catalogues: 2, offers: 1, content: 1 } },
      CAT_1,
      CAT_2,
      OFFER,
      { type: "end", version: "v", records: 3 },
    ];
    await expect(parseSyncMain(linesFrom(records))).rejects.toThrow(/content/);
  });

  it("rejects a stream whose counts disagree with meta.counts", async () => {
    const records = [
      { type: "meta", generatedAt: "t", counts: { catalogues: 2, offers: 5 } },
      CAT_1,
      CAT_2,
      OFFER,
      { type: "end", version: "v", records: 3 },
    ];
    await expect(parseSyncMain(linesFrom(records))).rejects.toThrow(/offers/);
  });

  it("rejects a truncated stream (missing `end`)", async () => {
    await expect(
      parseSyncMain(linesFrom(mainStream().slice(0, -1)))
    ).rejects.toBeInstanceOf(SyncProtocolError);
  });

  it("rejects when `end.records` disagrees with the data lines seen", async () => {
    const records = mainStream();
    records[records.length - 1] = { type: "end", version: "v", records: 99 };
    await expect(parseSyncMain(linesFrom(records))).rejects.toThrow(/records/);
  });
});

describe("parseSyncOthers", () => {
  it("assembles an others snapshot from a well-formed stream", async () => {
    const snap = await parseSyncOthers(linesFrom(othersStream()));

    expect(snap.version).toBe("others-v1");
    expect(snap.records).toBe(2);
    expect(snap.content).toEqual({ hero: "<h1>Salut</h1>" });
    expect(snap.events.map((e) => e.id)).toEqual(["evt_1"]);
    expect(snap.events[0]).not.toHaveProperty("type");
    expect(snap.events[0].ticketOffer).toEqual({
      id: "off_1",
      name: "4 fromages",
      description: "",
      status: "VISIBLE",
    });
  });

  it("treats a null content map as an empty object", async () => {
    const records = othersStream();
    records[1] = { type: "content", entries: null };
    const snap = await parseSyncOthers(linesFrom(records));
    expect(snap.content).toEqual({});
  });

  it("rejects a stream with no `content` line", async () => {
    const records = [
      { type: "meta", generatedAt: "t", counts: { content: 0, events: 1 } },
      EVENT,
      { type: "end", version: "v", records: 1 },
    ];
    await expect(parseSyncOthers(linesFrom(records))).rejects.toThrow(/content/);
  });

  it("rejects a second `content` line", async () => {
    const records = [
      { type: "meta", generatedAt: "t", counts: { content: 1, events: 1 } },
      CONTENT,
      CONTENT,
      EVENT,
      { type: "end", version: "v", records: 3 },
    ];
    await expect(parseSyncOthers(linesFrom(records))).rejects.toThrow(/content/);
  });

  it("rejects a `catalogue` line in the others stream", async () => {
    const records = [
      { type: "meta", generatedAt: "t", counts: { content: 1, events: 0 } },
      CONTENT,
      CAT_1,
      { type: "end", version: "v", records: 2 },
    ];
    await expect(parseSyncOthers(linesFrom(records))).rejects.toThrow(/inattendu/);
  });

  it("rejects a data line before the meta line", async () => {
    await expect(
      parseSyncOthers(linesFrom([CONTENT, ...othersStream()]))
    ).rejects.toBeInstanceOf(SyncProtocolError);
  });

  it("rejects an unreadable JSON line", async () => {
    await expect(
      parseSyncOthers(
        rawLines(
          JSON.stringify({ type: "meta", generatedAt: "t", counts: { content: 1, events: 0 } }),
          "{ not json"
        )
      )
    ).rejects.toBeInstanceOf(SyncProtocolError);
  });
});

describe("streamLines", () => {
  it("reassembles a record split across two byte chunks", async () => {
    const line = JSON.stringify(CAT_1);
    const cut = 12;
    const out: string[] = [];
    for await (const l of streamLines(
      bytes(line.slice(0, cut), line.slice(cut) + "\n")
    )) {
      out.push(l);
    }
    expect(out).toEqual([line]);
  });

  it("emits a trailing line with no final newline and skips blank lines", async () => {
    const out: string[] = [];
    for await (const l of streamLines(bytes('{"a":1}\n\n{"b":2}'))) out.push(l);
    expect(out).toEqual(['{"a":1}', '{"b":2}']);
  });

  it("splits a multi-byte UTF-8 character across chunks without corruption", async () => {
    const full = new TextEncoder().encode('{"x":"€"}\n');
    const out: string[] = [];
    for await (const l of streamLines(chunks(full.slice(0, 6), full.slice(6)))) {
      out.push(l);
    }
    expect(out).toEqual(['{"x":"€"}']);
  });
});

async function* chunks(...parts: Uint8Array[]): AsyncGenerator<Uint8Array> {
  for (const part of parts) yield part;
}
