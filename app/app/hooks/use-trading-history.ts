"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  getTransactionHistory,
  hasHeliusApiKey,
  type EnhancedTransaction,
} from "../lib/helius";

export interface TradingHistoryState {
  recentSwaps: EnhancedTransaction[];
  tradesInLastHour: number;
  tradesInLast24Hours: number;
  lastTradeTimestamp: number | null;
  timeSinceLastTrade: number | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const ONE_HOUR_MS = 60 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const REFRESH_INTERVAL_MS = 60 * 1000;

export function useTradingHistory(
  walletAddress: string | null
): TradingHistoryState {
  const [transactions, setTransactions] = useState<EnhancedTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    if (!walletAddress || !hasHeliusApiKey()) {
      setTransactions([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const swaps = await getTransactionHistory({
        address: walletAddress,
        type: "SWAP",
        limit: 50,
      });

      setTransactions(swaps);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch history");
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    fetchHistory();

    const interval = setInterval(fetchHistory, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchHistory]);

  const derivedState = useMemo(() => {
    const now = Date.now();
    const oneHourAgo = now - ONE_HOUR_MS;
    const twentyFourHoursAgo = now - TWENTY_FOUR_HOURS_MS;

    const tradesInLastHour = transactions.filter(
      (tx) => tx.timestamp * 1000 > oneHourAgo
    ).length;

    const tradesInLast24Hours = transactions.filter(
      (tx) => tx.timestamp * 1000 > twentyFourHoursAgo
    ).length;

    const lastTrade = transactions[0];
    const lastTradeTimestamp = lastTrade ? lastTrade.timestamp * 1000 : null;
    const timeSinceLastTrade = lastTradeTimestamp
      ? now - lastTradeTimestamp
      : null;

    return {
      tradesInLastHour,
      tradesInLast24Hours,
      lastTradeTimestamp,
      timeSinceLastTrade,
    };
  }, [transactions]);

  return {
    recentSwaps: transactions,
    ...derivedState,
    isLoading,
    error,
    refresh: fetchHistory,
  };
}
