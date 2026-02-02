/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("../../lib/helius", () => ({
  getTransactionHistory: vi.fn(),
  hasHeliusApiKey: vi.fn(() => true),
}));

describe("useTradingHistory", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("fetches swap transactions for connected wallet", async () => {
    const { getTransactionHistory } = await import("../../lib/helius");
    (getTransactionHistory as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        signature: "sig1",
        type: "SWAP",
        timestamp: Date.now() / 1000 - 300,
        description: "Swapped SOL for USDC",
        fee: 5000,
      },
      {
        signature: "sig2",
        type: "SWAP",
        timestamp: Date.now() / 1000 - 600,
        description: "Swapped USDC for SOL",
        fee: 5000,
      },
    ]);

    const { useTradingHistory } = await import("../../hooks/use-trading-history");
    const { result } = renderHook(() =>
      useTradingHistory("86xCnPeV69n6t3DnyGvkKobf9FdN2H9oiVDdaMpo2MMY")
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.recentSwaps).toHaveLength(2);
    expect(result.current.tradesInLastHour).toBeGreaterThanOrEqual(0);
  });

  it("returns empty state when no wallet connected", async () => {
    const { useTradingHistory } = await import("../../hooks/use-trading-history");
    const { result } = renderHook(() => useTradingHistory(null));

    expect(result.current.recentSwaps).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });
});
