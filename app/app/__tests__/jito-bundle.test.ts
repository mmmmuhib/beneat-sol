import { describe, it, expect, vi, beforeEach } from "vitest";

describe("estimateBundleTip with Helius", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_HELIUS_API_KEY", "test-api-key");
    vi.resetModules();
  });

  it("uses Helius priority fee when available", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          jsonrpc: "2.0",
          id: "1",
          result: {
            priorityFeeEstimate: 25000,
            priorityFeeLevels: {
              min: 10000,
              low: 15000,
              medium: 25000,
              high: 50000,
              veryHigh: 100000,
            },
          },
        }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { estimateBundleTip } = await import("../lib/jito-bundle");

    const mockConnection = {
      getRecentPrioritizationFees: vi.fn().mockResolvedValue([]),
    } as unknown as import("@solana/web3.js").Connection;

    const tip = await estimateBundleTip(mockConnection, "medium");

    expect(tip).toBe(25000);
    expect(mockFetch).toHaveBeenCalled();
  });

  it("falls back to connection fees when Helius unavailable", async () => {
    vi.stubEnv("NEXT_PUBLIC_HELIUS_API_KEY", "");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("No API key"))
    );

    const mockConnection = {
      getRecentPrioritizationFees: vi.fn().mockResolvedValue([
        { prioritizationFee: 30000, slot: 1 },
        { prioritizationFee: 40000, slot: 2 },
      ]),
    } as unknown as import("@solana/web3.js").Connection;

    const { estimateBundleTip } = await import("../lib/jito-bundle");
    const tip = await estimateBundleTip(mockConnection, "medium");

    expect(tip).toBeGreaterThanOrEqual(10000);
  });
});
