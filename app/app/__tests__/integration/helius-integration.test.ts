import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("Helius Integration (E2E)", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_HELIUS_API_KEY", "test-key");
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("priority fee flows through to Jito bundle estimation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            jsonrpc: "2.0",
            id: "1",
            result: {
              priorityFeeEstimate: 30000,
              priorityFeeLevels: {
                min: 10000,
                low: 20000,
                medium: 30000,
                high: 50000,
                veryHigh: 100000,
              },
            },
          }),
      })
    );

    const { estimateBundleTip } = await import("../../lib/jito-bundle");
    const mockConnection = {
      getRecentPrioritizationFees: vi.fn(),
    } as unknown as import("@solana/web3.js").Connection;

    const tip = await estimateBundleTip(mockConnection, "medium");

    expect(tip).toBe(30000);
    expect(mockConnection.getRecentPrioritizationFees).not.toHaveBeenCalled();
  });

  it("webhook store processes events correctly", async () => {
    const { useWebhookStore } = await import("../../stores/webhook-store");

    useWebhookStore.getState().reset();

    useWebhookStore.getState().processWebhookEvent({
      type: "LOCKOUT_TRIGGERED",
      signature: "test-sig",
      timestamp: Date.now(),
      data: { reason: "max_daily_loss" },
    });

    expect(useWebhookStore.getState().isLocked).toBe(true);
    expect(useWebhookStore.getState().events).toHaveLength(1);
  });

  it("hasHeliusApiKey returns correct status", async () => {
    const { hasHeliusApiKey } = await import("../../lib/helius");
    expect(hasHeliusApiKey()).toBe(true);

    vi.stubEnv("NEXT_PUBLIC_HELIUS_API_KEY", "");
    vi.resetModules();

    const { hasHeliusApiKey: checkAgain } = await import("../../lib/helius");
    expect(checkAgain()).toBe(false);
  });

  it("transaction history and webhook utilities are exported correctly", async () => {
    const helius = await import("../../lib/helius");
    const webhooks = await import("../../lib/helius-webhooks");

    expect(typeof helius.getPriorityFeeEstimate).toBe("function");
    expect(typeof helius.getTransactionHistory).toBe("function");
    expect(typeof helius.hasHeliusApiKey).toBe("function");

    expect(typeof webhooks.createVaultWebhook).toBe("function");
    expect(typeof webhooks.deleteWebhook).toBe("function");
    expect(typeof webhooks.listWebhooks).toBe("function");
  });

  it("priority fee gracefully degrades when Helius unavailable", async () => {
    vi.stubEnv("NEXT_PUBLIC_HELIUS_API_KEY", "");
    vi.resetModules();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("No API key"))
    );

    const mockConnection = {
      getRecentPrioritizationFees: vi.fn().mockResolvedValue([
        { prioritizationFee: 20000, slot: 1 },
        { prioritizationFee: 30000, slot: 2 },
      ]),
    } as unknown as import("@solana/web3.js").Connection;

    const { estimateBundleTip } = await import("../../lib/jito-bundle");
    const tip = await estimateBundleTip(mockConnection, "medium");

    expect(tip).toBeGreaterThanOrEqual(10000);
    expect(mockConnection.getRecentPrioritizationFees).toHaveBeenCalled();
  });

  describe("circuit breaker", () => {
    it("opens circuit after consecutive failures", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockRejectedValue(new Error("Network error"))
      );

      const { getPriorityFeeEstimate, getCircuitState, resetCircuit } =
        await import("../../lib/helius");

      resetCircuit();

      await getPriorityFeeEstimate({ accountKeys: ["test"] });
      await getPriorityFeeEstimate({ accountKeys: ["test"] });
      await getPriorityFeeEstimate({ accountKeys: ["test"] });

      expect(getCircuitState()).toBe("OPEN");
    });

    it("skips network call when circuit is open", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
      vi.stubGlobal("fetch", mockFetch);

      const { getPriorityFeeEstimate, resetCircuit } =
        await import("../../lib/helius");

      resetCircuit();

      await getPriorityFeeEstimate({ accountKeys: ["test"] });
      await getPriorityFeeEstimate({ accountKeys: ["test"] });
      await getPriorityFeeEstimate({ accountKeys: ["test"] });

      const callCountAfterOpen = mockFetch.mock.calls.length;

      await getPriorityFeeEstimate({ accountKeys: ["test"] });
      await getPriorityFeeEstimate({ accountKeys: ["test"] });

      expect(mockFetch.mock.calls.length).toBe(callCountAfterOpen);
    });

    it("opens circuit immediately on rate limit (429)", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 429,
        })
      );

      const { getPriorityFeeEstimate, getCircuitState, resetCircuit } =
        await import("../../lib/helius");

      resetCircuit();

      await getPriorityFeeEstimate({ accountKeys: ["test"] });

      expect(getCircuitState()).toBe("OPEN");
    });

    it("resets circuit on successful request", async () => {
      const mockFetch = vi
        .fn()
        .mockRejectedValueOnce(new Error("fail"))
        .mockRejectedValueOnce(new Error("fail"))
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              jsonrpc: "2.0",
              result: { priorityFeeEstimate: 10000 },
            }),
        });
      vi.stubGlobal("fetch", mockFetch);

      const { getPriorityFeeEstimate, getCircuitState, resetCircuit } =
        await import("../../lib/helius");

      resetCircuit();

      await getPriorityFeeEstimate({ accountKeys: ["test"] });
      await getPriorityFeeEstimate({ accountKeys: ["test"] });

      expect(getCircuitState()).toBe("CLOSED");

      await getPriorityFeeEstimate({ accountKeys: ["test"] });

      expect(getCircuitState()).toBe("CLOSED");
    });
  });
});
