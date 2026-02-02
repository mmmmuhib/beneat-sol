/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";

vi.mock("../../hooks/use-vault", () => ({
  useVault: () => ({
    vault: {
      lastTradeTime: BigInt(Math.floor(Date.now() / 1000) - 60),
      lastTradeWasLoss: true,
    },
    tradesToday: 5,
    maxTradesPerDay: 10,
    isInCooldown: false,
    cooldownRemaining: 0,
  }),
}));

vi.mock("../../stores/behavioral-store", () => ({
  useBehavioralStore: () => ({
    getCooldownRemaining: () => 0,
    getOverrideCount: () => 0,
  }),
}));

vi.mock("../../hooks/use-trading-history", () => ({
  useTradingHistory: () => ({
    tradesInLastHour: 8,
    tradesInLast24Hours: 15,
    timeSinceLastTrade: 60000,
    isLoading: false,
  }),
}));

describe("useBehavioralAnalysis with Helius data", () => {
  it("detects overtrading from transaction history", async () => {
    const { useBehavioralAnalysis } = await import(
      "../../hooks/use-behavioral-analysis"
    );
    const { result } = renderHook(() => useBehavioralAnalysis("test-wallet"));

    expect(result.current.activePatterns).toContain("overtrading");
  });

  it("uses helius trades for more accurate pattern detection", async () => {
    const { useBehavioralAnalysis } = await import(
      "../../hooks/use-behavioral-analysis"
    );
    const { result } = renderHook(() => useBehavioralAnalysis("test-wallet"));

    expect(result.current.riskScore).toBeGreaterThan(0);
  });
});
