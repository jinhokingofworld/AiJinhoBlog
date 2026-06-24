import { afterEach, describe, expect, it, vi } from "vitest";

import { RetryableRequestError, fetchJsonWithRetry } from "@/backend/ai/http";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("fetchJsonWithRetry", () => {
  it("retries retryable responses before returning success", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ message: "잠시 실패" }), { status: 500 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    globalThis.fetch = fetchMock;

    const result = await fetchJsonWithRetry<{ ok: boolean }>(
      "https://example.com/test",
      {
        method: "POST",
      },
      {
        retryDelayMs: 0,
        totalAttempts: 2,
      },
    );

    expect(result.data).toEqual({ ok: true });
    expect(result.attempts).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-retryable responses", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ message: "인증 실패" }), { status: 401 }));
    globalThis.fetch = fetchMock;

    await expect(
      fetchJsonWithRetry(
        "https://example.com/test",
        {
          method: "POST",
        },
        {
          retryDelayMs: 0,
          totalAttempts: 3,
        },
      ),
    ).rejects.toMatchObject<Partial<RetryableRequestError>>({
      attempts: 1,
      message: "인증 실패",
      status: 401,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
