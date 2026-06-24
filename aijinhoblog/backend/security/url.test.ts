import { describe, expect, it, vi } from "vitest";

import { assertPublicHttpUrl, fetchPublicHttpUrl, UnsafeUrlError } from "@/backend/security/url";

describe("public HTTP URL guard", () => {
  it("allows public http and https URLs", async () => {
    const resolveAddresses = vi.fn(async () => ["93.184.216.34"]);

    await expect(
      assertPublicHttpUrl("https://example.com/articles/1", { resolveAddresses }),
    ).resolves.toMatchObject({
      href: "https://example.com/articles/1",
    });
    await expect(
      assertPublicHttpUrl("http://example.com", { resolveAddresses }),
    ).resolves.toMatchObject({
      href: "http://example.com/",
    });
  });

  it("rejects non-http protocols", async () => {
    await expect(assertPublicHttpUrl("file:///etc/passwd")).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("rejects localhost, private, link-local, and metadata addresses", async () => {
    await expect(assertPublicHttpUrl("http://127.0.0.1/admin")).rejects.toBeInstanceOf(
      UnsafeUrlError,
    );
    await expect(assertPublicHttpUrl("http://10.0.0.5/admin")).rejects.toBeInstanceOf(
      UnsafeUrlError,
    );
    await expect(assertPublicHttpUrl("http://172.16.0.10/admin")).rejects.toBeInstanceOf(
      UnsafeUrlError,
    );
    await expect(assertPublicHttpUrl("http://192.168.1.10/admin")).rejects.toBeInstanceOf(
      UnsafeUrlError,
    );
    await expect(assertPublicHttpUrl("http://169.254.169.254/latest")).rejects.toBeInstanceOf(
      UnsafeUrlError,
    );
    await expect(assertPublicHttpUrl("http://[::1]/admin")).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("rejects hostnames that resolve to private addresses", async () => {
    await expect(
      assertPublicHttpUrl("https://internal.example", {
        resolveAddresses: async () => ["10.0.0.5"],
      }),
    ).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("follows redirects only after re-validating the next URL", async () => {
    const resolveAddresses = vi.fn(async (hostname: string) => {
      if (hostname === "start.example" || hostname === "next.example") {
        return ["93.184.216.34"];
      }

      return [];
    });
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = input instanceof URL ? input.toString() : input.toString();

      if (url === "https://start.example/") {
        return new Response(null, {
          headers: {
            location: "https://next.example/page",
          },
          status: 302,
        });
      }

      return new Response("ok");
    }) as unknown as typeof fetch;

    const response = await fetchPublicHttpUrl(
      "https://start.example/",
      {},
      {
        fetcher,
        resolveAddresses,
      },
    );

    await expect(response.text()).resolves.toBe("ok");
    expect(resolveAddresses).toHaveBeenCalledWith("next.example");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("blocks redirects to private addresses", async () => {
    const fetcher = vi.fn(async () => {
      return new Response(null, {
        headers: {
          location: "http://127.0.0.1/admin",
        },
        status: 302,
      });
    }) as unknown as typeof fetch;

    await expect(
      fetchPublicHttpUrl(
        "https://start.example/",
        {},
        {
          fetcher,
          resolveAddresses: async () => ["93.184.216.34"],
        },
      ),
    ).rejects.toBeInstanceOf(UnsafeUrlError);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
