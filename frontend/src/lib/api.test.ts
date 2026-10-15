import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, send, setOrganization } from "./api";
afterEach(() => {
  vi.unstubAllGlobals();
  setOrganization("");
  document.cookie = "csrftoken=; max-age=0";
});
describe("session API client", () => {
  it("attaches tenant and current CSRF token without local storage", async () => {
    document.cookie = "csrftoken=test-token";
    setOrganization("org-1");
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ id: "ok" }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetcher);
    await send("stock-documents/one/post/", {}, "POST", "stable-key");
    const options = fetcher.mock.calls[0][1] as RequestInit;
    const headers = new Headers(options.headers);
    expect(headers.get("X-CSRFToken")).toBe("test-token");
    expect(headers.get("X-Organization-ID")).toBe("org-1");
    expect(headers.get("Idempotency-Key")).toBe("stable-key");
    expect(options.credentials).toBe("same-origin");
  });
  it("preserves business conflict messages", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              message: "Only 2 units available.",
              fields: { detail: "Only 2 units available." },
            },
          }),
          { status: 409 },
        ),
      ),
    );
    await expect(api("stock-documents/one/post/")).rejects.toEqual(
      expect.objectContaining({
        message: "Only 2 units available.",
        status: 409,
      }),
    );
  });
  it("handles an empty logout response", async () => {
    document.cookie = "csrftoken=logout-token";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    );
    expect(await send("auth/logout/", {})).toBeUndefined();
  });
  it("uses a safe fallback for a non-JSON error", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("upstream unavailable", { status: 502 }),
        ),
    );
    await expect(api("products/")).rejects.toBeInstanceOf(ApiError);
  });
});

it("waits for CSRF bootstrap before first login", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ csrfToken: "new-token" }), { status: 200 }),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "user" }), { status: 200 }),
    );
  vi.stubGlobal("fetch", fetcher);
  await send("auth/login/", { username: "demo", password: "example" });
  expect(fetcher.mock.calls[0][0]).toBe("/api/v1/auth/csrf/");
  expect(fetcher.mock.calls[1][0]).toBe("/api/v1/auth/login/");
  expect(new Headers(fetcher.mock.calls[1][1].headers).get("X-CSRFToken")).toBe(
    "new-token",
  );
});
