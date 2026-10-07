import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpClient } from "./http-client.js";
import { TokenProvider } from "./token-provider.js";
import {
  ClientError,
  ConflictError,
  PayloadTooLargeError,
  RateLimitedError,
  ServerError,
} from "./errors.js";

function client(): { http: HttpClient; tokenProvider: TokenProvider } {
  const tokenProvider = {
    getToken: vi.fn().mockResolvedValue("tok"),
    invalidate: vi.fn(),
  } as unknown as TokenProvider;
  return {
    http: new HttpClient({ baseUrl: "https://api.example", tokenProvider }),
    tokenProvider,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("HttpClient.postFile", () => {
  it("sends a multipart/form-data POST with a single `file` field, no explicit Content-Type", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 204 }));
    const { http } = client();

    await http.postFile(
      "/locale/app/v2/orders/o1/settings/s1/photos/f1/upload",
      new Uint8Array([1, 2, 3]),
      "photo.jpg",
      "image/jpeg"
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://api.example/locale/app/v2/orders/o1/settings/s1/photos/f1/upload"
    );
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBeUndefined();
    expect(headers.Authorization).toBe("Bearer tok");
  });

  it("retries once on 401 with an invalidated token", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const { http, tokenProvider } = client();

    await http.postFile("/upload", new Uint8Array([1]));

    expect(tokenProvider.invalidate).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws a typed DomainError on a non-ok response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "Trop de tentatives" }), {
        status: 429,
      })
    );
    const { http } = client();

    await expect(http.postFile("/upload", new Uint8Array([1]))).rejects.toBeInstanceOf(
      RateLimitedError
    );
  });
});

describe("HttpClient language, 204 and errors", () => {
  it("sends Accept-Language when a language is configured", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));
    const tokenProvider = {
      getToken: vi.fn().mockResolvedValue("tok"),
      invalidate: vi.fn(),
    } as unknown as TokenProvider;
    const http = new HttpClient({
      baseUrl: "https://api.example",
      tokenProvider,
      language: "en",
    });

    await http.get("/x");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Accept-Language"]).toBe("en");
  });

  it("does not send Accept-Language by default", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));
    const { http } = client();

    await http.get("/x");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers as Record<string, string>).not.toHaveProperty("Accept-Language");
  });

  it("resolves a 204 POST to undefined and a 204 DELETE without reading a body", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response(null, { status: 204 }));
    const { http } = client();

    await expect(http.post("/push/devices", { token: "t" })).resolves.toBeUndefined();
    await expect(http.delete("/push/devices/t")).resolves.toBeUndefined();
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[1].method).toBe("DELETE");
  });

  it("does not cache a GET called with cache: false", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response("{}", { status: 200 }));
    const { http } = client();

    await http.get("/messages", undefined, { cache: false });
    await http.get("/messages", undefined, { cache: false });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    [409, ConflictError],
    [413, PayloadTooLargeError],
    [415, ClientError],
    [406, ClientError],
    [500, ServerError],
  ])("maps a %i to its typed error, keeping status and apiCode", async (status, type) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "msg", code: "SYNC_CONFLICT" }), { status })
    );
    const { http } = client();

    const error = await http.post("/x", {}).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(type);
    expect(error).toMatchObject({ status, apiCode: "SYNC_CONFLICT", message: "msg" });
  });
});
