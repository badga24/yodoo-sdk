import { afterEach, describe, expect, it, vi } from "vitest";
import { YodooClient } from "./client.js";
import { HttpClient } from "./http-client.js";
import { SyncStore } from "./sync-store.js";
import type {
  SyncCatalogueDTO,
  SyncMainSnapshot,
  SyncOfferDTO,
  SyncOthersSnapshot,
  SyncSnapshot,
} from "./types.js";

function mainSnapshot(version: string): SyncMainSnapshot {
  return {
    version,
    generatedAt: "2026-09-03T10:00:00Z",
    catalogues: [],
    offers: [],
    records: 0,
  };
}

function othersSnapshot(version: string): SyncOthersSnapshot {
  return {
    version,
    generatedAt: "2026-09-03T10:00:05Z",
    content: {},
    events: [],
    records: 1,
  };
}

function snapshot(main: string, others: string): SyncSnapshot {
  return { main: mainSnapshot(main), others: othersSnapshot(others) };
}

function storeOf(main: string, others: string): SyncStore {
  return new SyncStore(snapshot(main, others));
}

function newClient(options?: { autoSync?: boolean }): YodooClient {
  return new YodooClient({ appId: "app", appSecret: "secret", ...options });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("YodooClient.getStore", () => {
  it("triggers sync() once and memoizes the result", async () => {
    const sync = vi
      .spyOn(YodooClient.prototype, "sync")
      .mockResolvedValue(storeOf("m1", "o1"));
    const client = newClient();

    const a = await client.getStore();
    const b = await client.getStore();

    expect(a).toBe(b);
    expect(a.version).toEqual({ main: "m1", others: "o1" });
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it("shares a single in-flight sync across concurrent callers", async () => {
    const sync = vi
      .spyOn(YodooClient.prototype, "sync")
      .mockResolvedValue(storeOf("m1", "o1"));
    const client = newClient();

    const [a, b] = await Promise.all([client.getStore(), client.getStore()]);

    expect(a).toBe(b);
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it("retries on the next call after a failed sync", async () => {
    const sync = vi
      .spyOn(YodooClient.prototype, "sync")
      .mockRejectedValueOnce(new Error("stream broke"))
      .mockResolvedValueOnce(storeOf("m2", "o2"));
    const client = newClient();

    await expect(client.getStore()).rejects.toThrow("stream broke");
    const store = await client.getStore();

    expect(store.version).toEqual({ main: "m2", others: "o2" });
    expect(sync).toHaveBeenCalledTimes(2);
  });
});

describe("YodooClient.refreshStore", () => {
  it("re-syncs both streams with the current versions and replaces the memoized store", async () => {
    const sync = vi
      .spyOn(YodooClient.prototype, "sync")
      .mockResolvedValueOnce(storeOf("m1", "o1"))
      .mockResolvedValueOnce(storeOf("m2", "o2"));
    const client = newClient();

    await client.getStore();
    const refreshed = await client.refreshStore();

    expect(refreshed.version).toEqual({ main: "m2", others: "o2" });
    expect(await client.getStore()).toBe(refreshed);
    expect(sync).toHaveBeenNthCalledWith(1);
    expect(sync).toHaveBeenNthCalledWith(2, { main: "m1", others: "o1" });
  });

  it("keeps the previous store when the refresh sync fails", async () => {
    vi.spyOn(YodooClient.prototype, "sync")
      .mockResolvedValueOnce(storeOf("m1", "o1"))
      .mockRejectedValueOnce(new Error("429"));
    const client = newClient();

    const first = await client.getStore();
    await expect(client.refreshStore()).rejects.toThrow("429");

    expect(await client.getStore()).toBe(first);
  });

  it('with scope "main" re-downloads only that stream and swaps its half', async () => {
    vi.spyOn(YodooClient.prototype, "sync").mockResolvedValue(
      storeOf("m1", "o1")
    );
    const syncMain = vi
      .spyOn(YodooClient.prototype, "syncMain")
      .mockResolvedValue(mainSnapshot("m2"));
    const syncOthers = vi.spyOn(YodooClient.prototype, "syncOthers");
    const client = newClient();

    await client.getStore();
    const refreshed = await client.refreshStore("main");

    expect(refreshed.version).toEqual({ main: "m2", others: "o1" });
    expect(syncMain).toHaveBeenCalledTimes(1);
    expect(syncOthers).not.toHaveBeenCalled();
  });

  it("falls back to a full sync when scoped but no store exists yet", async () => {
    const sync = vi
      .spyOn(YodooClient.prototype, "sync")
      .mockResolvedValue(storeOf("m1", "o1"));
    const syncOthers = vi.spyOn(YodooClient.prototype, "syncOthers");
    const client = newClient();

    await client.refreshStore("others");

    expect(sync).toHaveBeenCalledTimes(1);
    expect(syncOthers).not.toHaveBeenCalled();
  });
});

describe("YodooClient autoSync option", () => {
  it("kicks off sync() from the constructor without being awaited", async () => {
    const sync = vi
      .spyOn(YodooClient.prototype, "sync")
      .mockResolvedValue(storeOf("m1", "o1"));

    const client = newClient({ autoSync: true });
    expect(sync).toHaveBeenCalledTimes(1);

    const store = await client.getStore();
    expect(store.version).toEqual({ main: "m1", others: "o1" });
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it("does not touch the network when left off", () => {
    const sync = vi
      .spyOn(YodooClient.prototype, "sync")
      .mockResolvedValue(storeOf("m1", "o1"));

    newClient();

    expect(sync).not.toHaveBeenCalled();
  });

  it("does not raise an unhandled rejection when the initial sync fails", async () => {
    vi.spyOn(YodooClient.prototype, "sync").mockRejectedValue(
      new Error("initial sync failed")
    );

    const client = newClient({ autoSync: true });
    await new Promise((resolve) => setTimeout(resolve, 0));

    await expect(client.getStore()).rejects.toThrow("initial sync failed");
  });
});

function catalogue(id: string): SyncCatalogueDTO {
  return {
    id,
    name: id,
    description: "",
    cover: null,
    offerCount: 1,
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

/** Store avec un catalogue `cat_1` et deux offres (`off_1` dans cat_1, `off_2` orpheline). */
function populatedStore(): SyncStore {
  return new SyncStore({
    main: {
      version: "m1",
      generatedAt: "2026-09-03T10:00:00Z",
      catalogues: [catalogue("cat_1")],
      offers: [offer("off_1", "cat_1"), offer("off_2", null)],
      records: 3,
    },
    others: othersSnapshot("o1"),
  });
}

describe("YodooClient reads served from the store", () => {
  function clientWithStore(): { client: YodooClient; httpGet: ReturnType<typeof vi.spyOn> } {
    vi.spyOn(YodooClient.prototype, "sync").mockResolvedValue(populatedStore());
    const httpGet = vi
      .spyOn(HttpClient.prototype, "get")
      .mockResolvedValue({ marker: "from-api" } as never);
    return { client: newClient({ autoSync: true }), httpGet };
  }

  it("getOffer() resolves a VISIBLE offer from the store, no HTTP", async () => {
    const { client, httpGet } = clientWithStore();
    await client.getStore();

    const detail = await client.getOffer("off_1");

    expect(detail.status).toBe("VISIBLE");
    expect(detail.marketplaceProfile).toBeNull();
    expect(detail.catalogue).toEqual({ id: "cat_1", name: "cat_1", cover: null });
    expect(httpGet).not.toHaveBeenCalled();
  });

  it("getOffer() falls back to HTTP when the offer is absent from the store", async () => {
    const { client, httpGet } = clientWithStore();
    await client.getStore();

    await client.getOffer("off_missing");

    expect(httpGet).toHaveBeenCalledWith(
      "/locale/app/v2/offers/off_missing",
      expect.anything()
    );
  });

  it("listOffers() is served from the store and filtered by catalogue", async () => {
    const { client, httpGet } = clientWithStore();
    await client.getStore();

    const page = await client.listOffers({ catalogue: "cat_1" });

    expect(page.content.map((o) => o.id)).toEqual(["off_1"]);
    expect(page.content[0].status).toBe("VISIBLE");
    expect(httpGet).not.toHaveBeenCalled();
  });

  it("listOffers({ group }) always goes to HTTP (no group data in the store)", async () => {
    const { client, httpGet } = clientWithStore();
    await client.getStore();

    await client.listOffers({ group: "grp_1" });

    expect(httpGet).toHaveBeenCalledWith(
      "/locale/app/v2/offers",
      expect.objectContaining({ group: "grp_1" })
    );
  });

  it("listCatalogues() and getCatalogue() are served from the store", async () => {
    const { client, httpGet } = clientWithStore();
    await client.getStore();

    expect((await client.listCatalogues()).content.map((c) => c.id)).toEqual([
      "cat_1",
    ]);
    expect((await client.getCatalogue("cat_1")).name).toBe("cat_1");
    expect(httpGet).not.toHaveBeenCalled();
  });

  it("getCatalogue() falls back to HTTP for an unknown id", async () => {
    const { client, httpGet } = clientWithStore();
    await client.getStore();

    await client.getCatalogue("cat_unknown");

    expect(httpGet).toHaveBeenCalledWith("/locale/app/v2/catalogues/cat_unknown");
  });

  it("listCatalogueOffers() is served from the store (VISIBLE only)", async () => {
    const { client, httpGet } = clientWithStore();
    await client.getStore();

    const page = await client.listCatalogueOffers("cat_1");

    expect(page.content.map((o) => o.id)).toEqual(["off_1"]);
    expect(httpGet).not.toHaveBeenCalled();
  });

  it("goes to HTTP when no store was ever requested", async () => {
    const httpGet = vi
      .spyOn(HttpClient.prototype, "get")
      .mockResolvedValue({} as never);
    const client = newClient(); // no autoSync, no getStore()

    await client.getOffer("off_1");
    await client.listCatalogues();

    expect(httpGet).toHaveBeenCalledTimes(2);
  });

  it("goes to HTTP when the store's sync failed", async () => {
    vi.spyOn(YodooClient.prototype, "sync").mockRejectedValue(new Error("boom"));
    const httpGet = vi
      .spyOn(HttpClient.prototype, "get")
      .mockResolvedValue({} as never);
    const client = newClient({ autoSync: true });
    await new Promise((r) => setTimeout(r, 0));

    await client.getOffer("off_1");

    expect(httpGet).toHaveBeenCalledWith(
      "/locale/app/v2/offers/off_1",
      expect.anything()
    );
  });
});

describe("YodooClient.getContentEntries", () => {
  it("passes ifModifiedSince through and surfaces content + lastModified", async () => {
    const getConditional = vi
      .spyOn(HttpClient.prototype, "getConditional")
      .mockResolvedValue({
        value: {
          hero_image: { value: "", fileId: "file_1", offerId: null, priceId: null, catalogueId: null },
        },
        lastModified: "Fri, 18 Sep 2026 10:00:00 GMT",
      } as never);
    const client = newClient();

    const result = await client.getContentEntries("Thu, 17 Sep 2026 10:00:00 GMT");

    expect(getConditional).toHaveBeenCalledWith(
      "/locale/app/v2/content/entries",
      "Thu, 17 Sep 2026 10:00:00 GMT"
    );
    expect(result.content).toEqual({
      hero_image: { value: "", fileId: "file_1", offerId: null, priceId: null, catalogueId: null },
    });
    expect(result.lastModified).toBe("Fri, 18 Sep 2026 10:00:00 GMT");
  });

  it("surfaces a 304 as content: null", async () => {
    vi.spyOn(HttpClient.prototype, "getConditional").mockResolvedValue({
      value: null,
      lastModified: "Thu, 17 Sep 2026 10:00:00 GMT",
    } as never);
    const client = newClient();

    const result = await client.getContentEntries("Thu, 17 Sep 2026 10:00:00 GMT");

    expect(result.content).toBeNull();
  });
});

describe("YodooClient.createOrder", () => {
  it("posts items/offlineAuthorizationCode/note and returns the created order", async () => {
    const post = vi.spyOn(HttpClient.prototype, "post").mockResolvedValue({
      id: "order_1",
      pendingPhotoUploads: [
        { item: "item_1", price: "price_1", setting: "setting_1", files: ["file_1"] },
      ],
    } as never);
    const client = newClient();

    const order = await client.createOrder(
      [{ offer: "offer_1", prices: [{ price: "price_1", finalPrice: "500", quantity: 1 }] }],
      "code",
      "note"
    );

    expect(post).toHaveBeenCalledWith("/locale/app/v2/orders", {
      items: [{ offer: "offer_1", prices: [{ price: "price_1", finalPrice: "500", quantity: 1 }] }],
      offlineAuthorizationCode: "code",
      note: "note",
    });
    expect(order.pendingPhotoUploads).toEqual([
      { item: "item_1", price: "price_1", setting: "setting_1", files: ["file_1"] },
    ]);
  });
});

describe("YodooClient.uploadOrderPhoto", () => {
  it("uploads the file to the order/setting/fileId route", async () => {
    const postFile = vi
      .spyOn(HttpClient.prototype, "postFile")
      .mockResolvedValue(undefined);
    const client = newClient();
    const bytes = new Uint8Array([1, 2, 3]);

    await client.uploadOrderPhoto("order_1", "setting_1", "file_1", bytes, {
      contentType: "image/jpeg",
      filename: "photo.jpg",
    });

    expect(postFile).toHaveBeenCalledWith(
      "/locale/app/v2/orders/order_1/settings/setting_1/photos/file_1/upload",
      bytes,
      "photo.jpg",
      "image/jpeg"
    );
  });
});

describe("YodooClient.createOrder options", () => {
  it("sends the client-supplied order id and serializes a Date createdAt", async () => {
    const post = vi
      .spyOn(HttpClient.prototype, "post")
      .mockResolvedValue({ id: "order_1" } as never);
    const client = newClient();
    const items = [
      {
        id: "11111111-1111-1111-1111-111111111111",
        offer: "offer_1",
        prices: [{ price: "price_1", quantity: 1, ids: ["22222222-2222-2222-2222-222222222222"] }],
      },
    ];

    await client.createOrder(items, undefined, "Awa, +229 97 00 00 00", {
      id: "33333333-3333-3333-3333-333333333333",
      createdAt: new Date("2026-10-03T10:00:00Z"),
    });

    expect(post).toHaveBeenCalledWith("/locale/app/v2/orders", {
      items,
      offlineAuthorizationCode: undefined,
      note: "Awa, +229 97 00 00 00",
      id: "33333333-3333-3333-3333-333333333333",
      createdAt: "2026-10-03T10:00:00.000Z",
    });
  });
});

describe("YodooClient AI chat", () => {
  it("posts the visitor message to ai/chat", async () => {
    const post = vi
      .spyOn(HttpClient.prototype, "post")
      .mockResolvedValue({ id: "m1", sessionId: "s1", role: "ASSISTANT" } as never);
    const client = newClient();
    const params = {
      message: "Vous avez des gâteaux sans gluten ?",
      visitor: { name: "Awa Diallo", phoneNumber: "+229 97 00 00 00" },
    };

    const reply = await client.sendAiMessage(params);

    expect(post).toHaveBeenCalledWith("/locale/app/v2/ai/chat", params);
    expect(reply.sessionId).toBe("s1");
  });

  it("reads a conversation without the response cache", async () => {
    const get = vi
      .spyOn(HttpClient.prototype, "get")
      .mockResolvedValue({ content: [] } as never);
    const client = newClient();

    await client.listAiMessages("s/1", { page: 1, size: 50 });

    expect(get).toHaveBeenCalledWith(
      "/locale/app/v2/ai/sessions/s%2F1/messages",
      { page: 1, size: 30, sort: undefined },
      { cache: false }
    );
  });
});

describe("YodooClient push", () => {
  it("registers and unregisters a device token", async () => {
    const post = vi.spyOn(HttpClient.prototype, "post").mockResolvedValue(undefined);
    const del = vi.spyOn(HttpClient.prototype, "delete").mockResolvedValue(undefined);
    const client = newClient();

    await client.registerPushDevice({ token: "tok:1", platform: "WEB" });
    await client.unregisterPushDevice("tok:1");

    expect(post).toHaveBeenCalledWith("/locale/app/v2/push/devices", {
      token: "tok:1",
      platform: "WEB",
    });
    expect(del).toHaveBeenCalledWith("/locale/app/v2/push/devices/tok%3A1");
  });
});
