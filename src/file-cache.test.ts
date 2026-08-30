import { describe, expect, it } from "vitest";
import { BoundedFileCache, type CachedFile } from "./file-cache.js";

function file(sizeBytes: number): CachedFile {
  return {
    bytes: new Uint8Array(sizeBytes),
    contentType: "image/png",
    cacheControl: "public, max-age=31536000, immutable",
  };
}

describe("BoundedFileCache", () => {
  it("returns a cached entry on the second get", () => {
    const cache = new BoundedFileCache(1024);
    cache.set("a", file(100));
    expect(cache.get("a")).toEqual(file(100));
  });

  it("does not cache an entry larger than maxBytes, without throwing", () => {
    const cache = new BoundedFileCache(100);
    cache.set("a", file(200));
    expect(cache.get("a")).toBeUndefined();
  });

  it("never caches anything when maxBytes is 0", () => {
    const cache = new BoundedFileCache(0);
    cache.set("a", file(1));
    expect(cache.get("a")).toBeUndefined();
  });

  it("evicts the least recently used entry to make room for a new one", () => {
    const cache = new BoundedFileCache(150);
    cache.set("a", file(100));
    cache.set("b", file(100));

    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toEqual(file(100));
  });

  it("does not evict an entry that was just accessed", () => {
    const cache = new BoundedFileCache(250);
    cache.set("a", file(100));
    cache.set("b", file(100));
    cache.get("a"); // marque "a" comme récemment utilisée ; "b" devient la plus ancienne

    cache.set("c", file(100)); // ne rentre plus (300 > 250) : évince la plus ancienne, "b"

    expect(cache.get("a")).toEqual(file(100));
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("c")).toEqual(file(100));
  });
});
