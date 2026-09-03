import { describe, expect, it } from "vitest";
import { SyncProtocolError } from "./errors.js";
import { parseSync, streamLines } from "./ndjson-sync.js";

const META = {
  type: "meta",
  generatedAt: "2026-09-03T10:00:00Z",
  counts: { catalogues: 2, offers: 1, events: 1, content: 1 },
};
const CONTENT = { type: "content", entries: { hero: "<h1>Salut</h1>" } };
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
const EVENT = {
  type: "event",
  id: "evt_1",
  name: "Soirée DJ",
  description: "",
  location: { lat: 6.37, lng: 2.43 },
  startDate: "2026-08-01T20:00:00Z",
  endDate: "2026-08-02T02:00:00Z",
  promotion: null,
  ticketOfferId: null,
  cover: null,
  goingCount: 12,
  interestedCount: 30,
  postCount: 4,
  viewCount: 210,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-04T00:00:00Z",
};
const END = { type: "end", version: "9f3c1a7b0d2e4f10", records: 5 };

/** Le flux nominal : meta + content + 2 catalogues + 1 offre + 1 event + end. */
function wellFormed(): unknown[] {
  return [META, CONTENT, CAT_1, CAT_2, OFFER, EVENT, END];
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

describe("parseSync", () => {
  it("assembles a snapshot from a well-formed stream", async () => {
    const snapshot = await parseSync(linesFrom(wellFormed()));

    expect(snapshot.version).toBe("9f3c1a7b0d2e4f10");
    expect(snapshot.generatedAt).toBe("2026-09-03T10:00:00Z");
    expect(snapshot.records).toBe(5);
    expect(snapshot.content).toEqual({ hero: "<h1>Salut</h1>" });
    expect(snapshot.catalogues.map((c) => c.id)).toEqual(["cat_1", "cat_2"]);
    expect(snapshot.offers).toHaveLength(1);
    expect(snapshot.events).toHaveLength(1);
  });

  it("strips the discriminant `type` field from data records", async () => {
    const snapshot = await parseSync(linesFrom(wellFormed()));

    expect(snapshot.catalogues[0]).not.toHaveProperty("type");
    expect(snapshot.offers[0]).not.toHaveProperty("type");
    expect(snapshot.events[0]).not.toHaveProperty("type");
    expect(snapshot.offers[0].id).toBe("off_1");
  });

  it("treats a null content map as an empty object", async () => {
    const records = wellFormed();
    records[1] = { type: "content", entries: null };
    const snapshot = await parseSync(linesFrom(records));

    expect(snapshot.content).toEqual({});
  });

  it("ignores blank lines between records", async () => {
    const body = wellFormed().map((r) => JSON.stringify(r)).join("\n\n");
    const snapshot = await parseSync(streamLines(bytes(body)));

    expect(snapshot.records).toBe(5);
  });

  it("rejects a stream whose `end` line is missing (truncated body)", async () => {
    const records = wellFormed().slice(0, -1);
    await expect(parseSync(linesFrom(records))).rejects.toBeInstanceOf(
      SyncProtocolError
    );
  });

  it("rejects a stream whose per-domain counts disagree with meta.counts", async () => {
    const records = [META, CONTENT, CAT_1, OFFER, EVENT, END]; // 1 catalogue, meta says 2
    await expect(parseSync(linesFrom(records))).rejects.toThrow(/catalogues/);
  });

  it("rejects a stream whose `end.records` disagrees with the data lines seen", async () => {
    const records = wellFormed();
    records[records.length - 1] = { type: "end", version: "v", records: 99 };
    await expect(parseSync(linesFrom(records))).rejects.toThrow(/records/);
  });

  it("rejects a data line before the meta line", async () => {
    const records = [CONTENT, META, CAT_1, CAT_2, OFFER, EVENT, END];
    await expect(parseSync(linesFrom(records))).rejects.toBeInstanceOf(
      SyncProtocolError
    );
  });

  it("rejects a second meta line", async () => {
    const records = [META, META, CONTENT, CAT_1, CAT_2, OFFER, EVENT, END];
    await expect(parseSync(linesFrom(records))).rejects.toThrow(/meta/);
  });

  it("rejects a second content line", async () => {
    const records = [META, CONTENT, CONTENT, CAT_1, CAT_2, OFFER, EVENT, END];
    await expect(parseSync(linesFrom(records))).rejects.toThrow(/content/);
  });

  it("rejects an unknown line type", async () => {
    const records = [META, CONTENT, { type: "widget" }, CAT_1, CAT_2, OFFER, EVENT, END];
    await expect(parseSync(linesFrom(records))).rejects.toThrow(/inconnu/);
  });

  it("rejects a line that appears after `end`", async () => {
    const records = [...wellFormed(), CAT_1];
    await expect(parseSync(linesFrom(records))).rejects.toThrow(/end/);
  });

  it("rejects an unreadable JSON line", async () => {
    await expect(
      parseSync(rawLines(JSON.stringify(META), "{ not json"))
    ).rejects.toBeInstanceOf(SyncProtocolError);
  });

  it("rejects an empty stream", async () => {
    await expect(parseSync(rawLines())).rejects.toBeInstanceOf(SyncProtocolError);
  });
});

describe("streamLines", () => {
  it("reassembles a record split across two byte chunks", async () => {
    const line = JSON.stringify(META);
    const cut = 10;
    const out: string[] = [];
    for await (const l of streamLines(bytes(line.slice(0, cut), line.slice(cut) + "\n"))) {
      out.push(l);
    }
    expect(out).toEqual([line]);
  });

  it("emits a trailing line that has no final newline", async () => {
    const out: string[] = [];
    for await (const l of streamLines(bytes('{"a":1}\n{"b":2}'))) out.push(l);
    expect(out).toEqual(['{"a":1}', '{"b":2}']);
  });

  it("trims a CRLF line ending", async () => {
    const out: string[] = [];
    for await (const l of streamLines(bytes('{"a":1}\r\n'))) out.push(l);
    expect(out).toEqual(['{"a":1}']);
  });

  it("splits a multi-byte UTF-8 character across chunks without corruption", async () => {
    const encoder = new TextEncoder();
    const full = encoder.encode('{"x":"€"}\n');
    const out: string[] = [];
    for await (const l of streamLines(bytes2(full.slice(0, 6), full.slice(6)))) {
      out.push(l);
    }
    expect(out).toEqual(['{"x":"€"}']);
  });
});

async function* bytes2(...chunks: Uint8Array[]): AsyncGenerator<Uint8Array> {
  for (const chunk of chunks) yield chunk;
}
