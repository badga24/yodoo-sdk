import { afterEach, describe, expect, it, vi } from "vitest";
import { YodooClient } from "./client.js";
import { SyncStore } from "./sync-store.js";
import type { SyncSnapshot } from "./types.js";

function snapshot(version: string): SyncSnapshot {
  return {
    version,
    generatedAt: "2026-09-03T10:00:00Z",
    content: {},
    catalogues: [],
    offers: [],
    events: [],
    records: 1,
  };
}

function storeOf(version: string): SyncStore {
  return new SyncStore(snapshot(version));
}

function newClient(options?: { autoSync?: boolean }): YodooClient {
  return new YodooClient({
    appId: "app",
    appSecret: "secret",
    ...options,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("YodooClient.getStore", () => {
  it("triggers sync() once and memoizes the result", async () => {
    const sync = vi
      .spyOn(YodooClient.prototype, "sync")
      .mockResolvedValue(storeOf("v1"));
    const client = newClient();

    const a = await client.getStore();
    const b = await client.getStore();

    expect(a).toBe(b);
    expect(a.version).toBe("v1");
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it("shares a single in-flight sync across concurrent callers", async () => {
    const sync = vi
      .spyOn(YodooClient.prototype, "sync")
      .mockResolvedValue(storeOf("v1"));
    const client = newClient();

    const [a, b] = await Promise.all([client.getStore(), client.getStore()]);

    expect(a).toBe(b);
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it("retries on the next call after a failed sync", async () => {
    const sync = vi
      .spyOn(YodooClient.prototype, "sync")
      .mockRejectedValueOnce(new Error("stream broke"))
      .mockResolvedValueOnce(storeOf("v2"));
    const client = newClient();

    await expect(client.getStore()).rejects.toThrow("stream broke");
    const store = await client.getStore();

    expect(store.version).toBe("v2");
    expect(sync).toHaveBeenCalledTimes(2);
  });
});

describe("YodooClient.refreshStore", () => {
  it("re-syncs with the current version and replaces the memoized store", async () => {
    const sync = vi
      .spyOn(YodooClient.prototype, "sync")
      .mockResolvedValueOnce(storeOf("v1"))
      .mockResolvedValueOnce(storeOf("v2"));
    const client = newClient();

    const first = await client.getStore();
    expect(first.version).toBe("v1");

    const refreshed = await client.refreshStore();
    expect(refreshed.version).toBe("v2");
    expect(await client.getStore()).toBe(refreshed);

    expect(sync).toHaveBeenNthCalledWith(1);
    expect(sync).toHaveBeenNthCalledWith(2, "v1");
  });

  it("keeps the previous store when the refresh sync fails", async () => {
    vi.spyOn(YodooClient.prototype, "sync")
      .mockResolvedValueOnce(storeOf("v1"))
      .mockRejectedValueOnce(new Error("429"));
    const client = newClient();

    const first = await client.getStore();
    await expect(client.refreshStore()).rejects.toThrow("429");

    expect(await client.getStore()).toBe(first);
  });

  it("syncs from scratch when called before any getStore()", async () => {
    const sync = vi
      .spyOn(YodooClient.prototype, "sync")
      .mockResolvedValue(storeOf("v1"));
    const client = newClient();

    await client.refreshStore();

    expect(sync).toHaveBeenCalledTimes(1);
    expect(sync).toHaveBeenCalledWith(undefined);
  });
});

describe("YodooClient autoSync option", () => {
  it("kicks off sync() from the constructor without being awaited", async () => {
    const sync = vi
      .spyOn(YodooClient.prototype, "sync")
      .mockResolvedValue(storeOf("v1"));

    const client = newClient({ autoSync: true });
    expect(sync).toHaveBeenCalledTimes(1); // already fired, synchronously, at construction

    const store = await client.getStore();
    expect(store.version).toBe("v1");
    expect(sync).toHaveBeenCalledTimes(1); // getStore() reused the in-flight sync
  });

  it("does not touch the network when left off", () => {
    const sync = vi
      .spyOn(YodooClient.prototype, "sync")
      .mockResolvedValue(storeOf("v1"));

    newClient();

    expect(sync).not.toHaveBeenCalled();
  });

  it("does not raise an unhandled rejection when the initial sync fails", async () => {
    vi.spyOn(YodooClient.prototype, "sync").mockRejectedValue(
      new Error("initial sync failed")
    );

    const client = newClient({ autoSync: true });
    // Laisse tourner les microtasks du fire-and-forget : ne doit pas rejeter le process.
    await new Promise((resolve) => setTimeout(resolve, 0));

    await expect(client.getStore()).rejects.toThrow("initial sync failed");
  });
});
