"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { usePriceStore, type OHLCV } from "../stores/price-store";
import { fetchHistoricalCandles, isPythSymbolSupported } from "../lib/pyth-benchmarks";
import { INTERVALS, type Timeframe } from "../lib/candle-aggregator";

export type HistoricalStatus = "idle" | "loading" | "ready" | "error";

export interface UseHistoricalCandlesOptions {
  symbol: string;
  timeframe: Timeframe;
  candleCount?: number;
  enabled?: boolean;
}

export interface UseHistoricalCandlesReturn {
  status: HistoricalStatus;
  candles: OHLCV[];
  error: string | null;
  refetch: () => void;
}

const DEFAULT_CANDLE_COUNT = 200;

export function useHistoricalCandles({
  symbol,
  timeframe,
  candleCount = DEFAULT_CANDLE_COUNT,
  enabled = true,
}: UseHistoricalCandlesOptions): UseHistoricalCandlesReturn {
  const [status, setStatus] = useState<HistoricalStatus>("idle");
  const [candles, setCandles] = useState<OHLCV[]>([]);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const lastFetchKeyRef = useRef<string>("");

  const getHistoricalCandles = usePriceStore((state) => state.getHistoricalCandles);
  const setHistoricalCandles = usePriceStore((state) => state.setHistoricalCandles);

  const fetchCandles = useCallback(async (forceRefetch = false) => {
    if (!enabled || !isPythSymbolSupported(symbol)) {
      setStatus("idle");
      setCandles([]);
      return;
    }

    const cacheKey = `${symbol}:${timeframe}`;

    if (!forceRefetch) {
      const cached = getHistoricalCandles(symbol, timeframe);
      if (cached && cached.length > 0) {
        setCandles(cached);
        setStatus("ready");
        return;
      }
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    lastFetchKeyRef.current = cacheKey;

    setStatus("loading");
    setError(null);

    const now = Math.floor(Date.now() / 1000);
    const intervalSeconds = INTERVALS[timeframe];
    const from = now - intervalSeconds * candleCount;

    try {
      const fetchedCandles = await fetchHistoricalCandles(
        symbol,
        timeframe,
        from,
        now,
        abortControllerRef.current.signal
      );

      if (lastFetchKeyRef.current !== cacheKey) {
        return;
      }

      setHistoricalCandles(symbol, timeframe, fetchedCandles);
      setCandles(fetchedCandles);
      setStatus("ready");
    } catch (err) {
      if (lastFetchKeyRef.current !== cacheKey) {
        return;
      }

      const errorMessage = err instanceof Error ? err.message : "Failed to fetch historical data";
      setError(errorMessage);
      setStatus("error");
      setCandles([]);
    }
  }, [symbol, timeframe, candleCount, enabled, getHistoricalCandles, setHistoricalCandles]);

  const refetch = useCallback(() => {
    fetchCandles(true);
  }, [fetchCandles]);

  useEffect(() => {
    fetchCandles();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchCandles]);

  return {
    status,
    candles,
    error,
    refetch,
  };
}
