"use client";

import { useEffect, useRef, useState } from "react";
import { usePriceStore, type OHLCV } from "../stores/price-store";
import { CandleAggregator, type PriceTick, type Timeframe } from "../lib/candle-aggregator";
import { useHistoricalCandles } from "./use-historical-candles";

export type { Timeframe } from "../lib/candle-aggregator";

export interface UseCandleStreamOptions {
  token: string;
  timeframe: Timeframe;
  enabled?: boolean;
}

export interface UseCandleStreamReturn {
  isSeeding: boolean;
  isStreaming: boolean;
  lastCandleTime: number | null;
  historicalError: string | null;
}

function mergeCandles(historical: OHLCV[], live: OHLCV[]): OHLCV[] {
  // If we have both, ensure we don't include live candles that are older than the last historical
  if (historical.length > 0 && live.length > 0) {
    const lastHistoricalTime = historical[historical.length - 1].time;
    const filteredLive = live.filter(c => c.time >= lastHistoricalTime);
    
    const candleMap = new Map<number, OHLCV>();
    for (const candle of historical) candleMap.set(candle.time, candle);
    for (const candle of filteredLive) candleMap.set(candle.time, candle);
    
    return Array.from(candleMap.values()).sort((a, b) => a.time - b.time);
  }

  return historical.length > 0 ? historical : live;
}

export function useCandleStream({
  token,
  timeframe,
  enabled = true,
}: UseCandleStreamOptions): UseCandleStreamReturn {
  const [isStreaming, setIsStreaming] = useState(false);
  const [lastCandleTime, setLastCandleTime] = useState<number | null>(null);

  const aggregatorRef = useRef<CandleAggregator>(new CandleAggregator(timeframe));
  const lastProcessedPriceRef = useRef<{ price: number; timestamp: number } | null>(null);
  const tokenRef = useRef(token);
  const enabledRef = useRef(enabled);
  const liveCandlesRef = useRef<OHLCV[]>([]);
  const historicalSeededRef = useRef(false);

  const setOhlcv = usePriceStore((state) => state.setOhlcv);
  const appendOhlcv = usePriceStore((state) => state.appendOhlcv);
  const clearOhlcv = usePriceStore((state) => state.clearOhlcv);

  const {
    status: historicalStatus,
    candles: historicalCandles,
    error: historicalError,
  } = useHistoricalCandles({
    symbol: token,
    timeframe,
    enabled,
  });

  const isSeeding = historicalStatus === "loading" || historicalStatus === "idle";

  tokenRef.current = token;
  enabledRef.current = enabled;

  // Cleanup effect: Run when token or timeframe changes
  useEffect(() => {
    // 1. Reset local stream state
    liveCandlesRef.current = [];
    historicalSeededRef.current = false;
    lastProcessedPriceRef.current = null;
    
    // 2. Reset aggregator
    aggregatorRef.current.setTimeframe(timeframe);
    aggregatorRef.current.reset();

    // 3. Purge the global store for this token
    clearOhlcv(token);
    
    setIsStreaming(false);
  }, [token, timeframe, clearOhlcv]);


  useEffect(() => {
    if (historicalStatus !== "ready" || historicalCandles.length === 0) {
      return;
    }

    if (historicalSeededRef.current) {
      return;
    }

    historicalSeededRef.current = true;

    const merged = mergeCandles(historicalCandles, liveCandlesRef.current);
    setOhlcv(token, merged);

    const lastHistorical = historicalCandles[historicalCandles.length - 1];
    if (lastHistorical) {
      aggregatorRef.current.seedFromCandle(lastHistorical);
    }
  }, [historicalStatus, historicalCandles, token, setOhlcv]);

  useEffect(() => {
    if (!enabled) {
      setIsStreaming(false);
      return;
    }

    const unsubscribe = usePriceStore.subscribe((state, prevState) => {
      const currentToken = tokenRef.current;
      const currentEnabled = enabledRef.current;

      if (!currentEnabled) return;

      const newPrice = state.prices[currentToken];
      const newTimestamp = state.lastUpdated[currentToken];
      const oldPrice = prevState.prices[currentToken];
      const oldTimestamp = prevState.lastUpdated[currentToken];

      if (
        newPrice === undefined ||
        newTimestamp === undefined ||
        (newPrice === oldPrice && newTimestamp === oldTimestamp)
      ) {
        return;
      }

      const lastProcessed = lastProcessedPriceRef.current;
      if (
        lastProcessed &&
        lastProcessed.price === newPrice &&
        lastProcessed.timestamp === newTimestamp
      ) {
        return;
      }

      lastProcessedPriceRef.current = { price: newPrice, timestamp: newTimestamp };

      const tick: PriceTick = {
        price: newPrice,
        timestamp: Math.floor(newTimestamp / 1000),
      };

      const update = aggregatorRef.current.processTick(tick);

      if (update) {
        const existingLive = liveCandlesRef.current;
        const lastLive = existingLive[existingLive.length - 1];

        if (lastLive && lastLive.time === update.candle.time) {
          liveCandlesRef.current = [...existingLive.slice(0, -1), update.candle];
        } else {
          liveCandlesRef.current = [...existingLive, update.candle];
        }

        appendOhlcv(currentToken, update.candle);
        setLastCandleTime(update.candle.time);

        if (!isStreaming) {
          setIsStreaming(true);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [token, enabled, appendOhlcv, isStreaming]);

  return {
    isSeeding,
    isStreaming,
    lastCandleTime,
    historicalError,
  };
}
