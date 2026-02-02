import { describe, it, expect, vi, beforeEach } from "vitest";

describe("HeliusClient", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_HELIUS_API_KEY", "test-api-key");
  });

  describe("getPriorityFeeEstimate", () => {
    it("returns priority fee estimate for account keys", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            jsonrpc: "2.0",
            id: "1",
            result: {
              priorityFeeEstimate: 15000,
              priorityFeeLevels: {
                min: 10000,
                low: 12000,
                medium: 15000,
                high: 20000,
                veryHigh: 50000,
              },
            },
          }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { getPriorityFeeEstimate } = await import("../../lib/helius");
      const result = await getPriorityFeeEstimate({
        accountKeys: ["JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4"],
      });

      expect(result.priorityFeeEstimate).toBe(15000);
      expect(result.priorityFeeLevels?.medium).toBe(15000);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("helius-rpc.com"),
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("getPriorityFeeEstimate"),
        })
      );
    });

    it("returns fallback fee when API fails", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new Error("Network error"))
      );

      const { getPriorityFeeEstimate } = await import("../../lib/helius");
      const result = await getPriorityFeeEstimate({
        accountKeys: ["test-account"],
      });

      expect(result.priorityFeeEstimate).toBe(50000);
    });
  });

  describe("getTransactionHistory", () => {
    it("fetches parsed transaction history for address", async () => {
      const mockTransactions = [
        {
          signature: "sig1",
          type: "SWAP",
          timestamp: 1706400000,
          description: "Swapped 1 SOL for 100 USDC",
          fee: 5000,
          events: {
            swap: {
              tokenInputs: [{ mint: "So11...", amount: "1000000000" }],
              tokenOutputs: [{ mint: "EPjF...", amount: "100000000" }],
            },
          },
        },
      ];

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockTransactions),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { getTransactionHistory } = await import("../../lib/helius");
      const result = await getTransactionHistory({
        address: "86xCnPeV69n6t3DnyGvkKobf9FdN2H9oiVDdaMpo2MMY",
        type: "SWAP",
        limit: 10,
      });

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("SWAP");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/v0/addresses/86xCnPeV69n6t3DnyGvkKobf9FdN2H9oiVDdaMpo2MMY/transactions"),
        expect.any(Object)
      );
    });

    it("returns empty array on API failure", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new Error("Network error"))
      );

      const { getTransactionHistory } = await import("../../lib/helius");
      const result = await getTransactionHistory({
        address: "test-address",
      });

      expect(result).toEqual([]);
    });
  });
});
