import type { OHLCV } from "../stores/price-store";
import type { Timeframe } from "./candle-aggregator";

const PYTH_BENCHMARKS_URL = "https://benchmarks.pyth.network/v1/shims/tradingview/history";

const PYTH_SYMBOLS: Record<string, string> = {
  SOL: "Crypto.SOL/USD",
  BTC: "Crypto.BTC/USD",
  ETH: "Crypto.ETH/USD",
};

const RESOLUTION_MAP: Record<Timeframe, string> = {
  "1m": "1",
  "5m": "5",
  "15m": "15",
  "1H": "60",
  "4H": "240",
  "1D": "D",
};

interface PythHistoryResponse {
  s: "ok" | "error" | "no_data";
  errmsg?: string;
  t?: number[];
  o?: number[];
  h?: number[];
  l?: number[];
  c?: number[];
  v?: number[];
}

export class PythBenchmarksError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PythBenchmarksError";
  }
}

export async function fetchHistoricalCandles(
  symbol: string,
  resolution: Timeframe,
  from: number,
  to: number,
  signal?: AbortSignal
): Promise<OHLCV[]> {
  const pythSymbol = PYTH_SYMBOLS[symbol];
  if (!pythSymbol) {
    throw new PythBenchmarksError(`Unsupported symbol: ${symbol}`);
  }

  const pythResolution = RESOLUTION_MAP[resolution];
  if (!pythResolution) {
    throw new PythBenchmarksError(`Unsupported resolution: ${resolution}`);
  }

  const params = new URLSearchParams({
    symbol: pythSymbol,
    resolution: pythResolution,
    from: from.toString(),
    to: to.toString(),
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  const combinedSignal = signal
    ? AbortSignal.any([signal, controller.signal])
    : controller.signal;

  try {
    const response = await fetch(`${PYTH_BENCHMARKS_URL}?${params}`, {
      signal: combinedSignal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new PythBenchmarksError(`HTTP error: ${response.status}`);
    }

    const data: PythHistoryResponse = await response.json();

    if (data.s === "error") {
      throw new PythBenchmarksError(data.errmsg ?? "Unknown API error");
    }

    if (data.s === "no_data" || !data.t || data.t.length === 0) {
      return [];
    }

    const candles: OHLCV[] = [];
    const { t, o, h, l, c, v } = data;

    if (!o || !h || !l || !c) {
      throw new PythBenchmarksError("Incomplete data in response");
    }

    for (let i = 0; i < t.length; i++) {
      candles.push({
        time: t[i],
        open: o[i],
        high: h[i],
        low: l[i],
        close: c[i],
        volume: v?.[i] ?? 0,
      });
    }

    return candles;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof PythBenchmarksError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new PythBenchmarksError("Request timed out or was aborted");
    }

    throw new PythBenchmarksError(
      error instanceof Error ? error.message : "Unknown error"
    );
  }
}

export function getSupportedSymbols(): string[] {
  return Object.keys(PYTH_SYMBOLS);
}

export function isPythSymbolSupported(symbol: string): boolean {
  return symbol in PYTH_SYMBOLS;
}
