"use client";

import { create } from "zustand";

export interface OHLCV {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

export type PriceSource = "magicblock" | "mock";

export interface HistoricalCacheEntry {
  candles: OHLCV[];
  lastFetched: number;
  oldestCandle: number;
}

export type HistoricalCache = Record<string, HistoricalCacheEntry>;

interface PriceStore {
  prices: Record<string, number>;
  ohlcvData: Record<string, OHLCV[]>;
  lastUpdated: Record<string, number>;
  connectionStatus: ConnectionStatus;
  priceSource: Record<string, PriceSource>;
  historicalCache: HistoricalCache;

  setPrice: (token: string, price: number) => void;
  setPrices: (prices: Record<string, number>) => void;
  setPriceWithSource: (token: string, price: number, source: PriceSource) => void;
  setOhlcv: (token: string, data: OHLCV[]) => void;
  clearOhlcv: (token: string) => void;
  appendOhlcv: (token: string, candle: OHLCV, maxCandles?: number) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  getPrice: (token: string) => number | undefined;
  getOhlcv: (token: string) => OHLCV[];
  getPriceSource: (token: string) => PriceSource | undefined;
  setHistoricalCandles: (symbol: string, timeframe: string, candles: OHLCV[]) => void;
  getHistoricalCandles: (symbol: string, timeframe: string) => OHLCV[] | null;
}

export const usePriceStore = create<PriceStore>((set, get) => ({
  prices: {},
  ohlcvData: {},
  lastUpdated: {},
  connectionStatus: "disconnected",
  priceSource: {},
  historicalCache: {},

  setPrice: (token, price) =>
    set((state) => ({
      prices: { ...state.prices, [token]: price },
      lastUpdated: { ...state.lastUpdated, [token]: Date.now() },
    })),

  setPrices: (prices) =>
    set((state) => {
      const now = Date.now();
      const updated: Record<string, number> = {};
      for (const token of Object.keys(prices)) {
        updated[token] = now;
      }
      return {
        prices: { ...state.prices, ...prices },
        lastUpdated: { ...state.lastUpdated, ...updated },
      };
    }),

  setPriceWithSource: (token, price, source) =>
    set((state) => ({
      prices: { ...state.prices, [token]: price },
      lastUpdated: { ...state.lastUpdated, [token]: Date.now() },
      priceSource: { ...state.priceSource, [token]: source },
    })),

  setOhlcv: (token, data) =>
    set((state) => ({
      ohlcvData: { ...state.ohlcvData, [token]: data },
      lastUpdated: { ...state.lastUpdated, [token]: Date.now() },
    })),

  clearOhlcv: (token) =>
    set((state) => {
      const newOhlcvData = { ...state.ohlcvData };
      delete newOhlcvData[token];
      const newLastUpdated = { ...state.lastUpdated };
      delete newLastUpdated[token];
      return {
        ohlcvData: newOhlcvData,
        lastUpdated: newLastUpdated,
      };
    }),

  appendOhlcv: (token, candle, maxCandles = 500) =>
    set((state) => {
      const existing = state.ohlcvData[token] || [];
      const lastCandle = existing[existing.length - 1];

      if (lastCandle && candle.time < lastCandle.time) {
        return state;
      }

      let updated: OHLCV[];

      if (lastCandle && lastCandle.time === candle.time) {
        updated = [...existing.slice(0, -1), candle];
      } else {
        updated = [...existing, candle];
      }

      if (updated.length > maxCandles) {
        updated = updated.slice(-maxCandles);
      }

      return {
        ohlcvData: { ...state.ohlcvData, [token]: updated },
      };
    }),

  setConnectionStatus: (status) =>
    set({ connectionStatus: status }),

  getPrice: (token) => get().prices[token],
  getOhlcv: (token) => get().ohlcvData[token] || [],
  getPriceSource: (token) => get().priceSource[token],

  setHistoricalCandles: (symbol, timeframe, candles) =>
    set((state) => {
      const key = `${symbol}:${timeframe}`;
      const oldestCandle = candles.length > 0
        ? Math.min(...candles.map((c) => c.time))
        : 0;

      return {
        historicalCache: {
          ...state.historicalCache,
          [key]: {
            candles,
            lastFetched: Date.now(),
            oldestCandle,
          },
        },
      };
    }),

  getHistoricalCandles: (symbol, timeframe) => {
    const key = `${symbol}:${timeframe}`;
    const entry = get().historicalCache[key];
    return entry?.candles ?? null;
  },
}));
