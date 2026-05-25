import { afterEach, describe, expect, it, vi } from "vitest";
import { ChutesClient } from "./client";

type FakeResponse = {
  ok: boolean;
  status: number;
  headers: { get: (name: string) => string | null };
  text: () => Promise<string>;
};

function ok(content: string): FakeResponse {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => JSON.stringify({ choices: [{ message: { content } }] })
  };
}

function err(status: number, body = "error"): FakeResponse {
  return {
    ok: false,
    status,
    headers: { get: () => null },
    text: async () => body
  };
}

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function newClient() {
  return new ChutesClient({ provider: "nvidia", apiKey: "test-key", retryBaseDelayMs: 1, maxAttempts: 4 });
}

describe("ChutesClient retry/backoff", () => {
  it("retries after a 429 and succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(err(429, "rate limited"))
      .mockResolvedValueOnce(ok("RECOVERED"));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await newClient().chat({ messages: [{ role: "user", content: "hi" }] });

    expect(result).toBe("RECOVERED");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries on a transient network error then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce(ok("OK_AFTER_NETWORK"));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await newClient().chat({ messages: [{ role: "user", content: "hi" }] });

    expect(result).toBe("OK_AFTER_NETWORK");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a non-retryable status (400) and fails fast", async () => {
    const fetchMock = vi.fn().mockResolvedValue(err(400, "bad request"));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(newClient().chat({ messages: [{ role: "user", content: "hi" }] })).rejects.toThrow("400");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives up after exhausting attempts on persistent 429", async () => {
    const fetchMock = vi.fn().mockResolvedValue(err(429, "still limited"));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(newClient().chat({ messages: [{ role: "user", content: "hi" }] })).rejects.toThrow("429");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
