import { afterEach, describe, expect, it, vi } from "vitest";
import { YodooClient } from "./client.js";
import { SyncStore } from "./sync-store.js";
import type {
  SyncMainSnapshot,
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
