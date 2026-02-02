import type { OHLCV } from "../stores/price-store";

export type Timeframe = "1m" | "5m" | "15m" | "1H" | "4H" | "1D";

export interface PriceTick {
  price: number;
  timestamp: number;
}

export interface CandleUpdate {
  candle: OHLCV;
  isNewCandle: boolean;
}

export const INTERVALS: Record<Timeframe, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1H": 3600,
  "4H": 14400,
  "1D": 86400,
};

export class CandleAggregator {
  private currentCandle: OHLCV | null = null;
  private timeframe: Timeframe;

  constructor(timeframe: Timeframe) {
    this.timeframe = timeframe;
  }

  private getBucketTime(timestamp: number): number {
    const interval = INTERVALS[this.timeframe];
    return Math.floor(timestamp / interval) * interval;
  }

  processTick(tick: PriceTick): CandleUpdate | null {
    const { price, timestamp } = tick;

    if (price <= 0) {
      return null;
    }

    const bucketTime = this.getBucketTime(timestamp);

    if (this.currentCandle && this.currentCandle.time === bucketTime) {
      this.currentCandle = {
        ...this.currentCandle,
        high: Math.max(this.currentCandle.high, price),
        low: Math.min(this.currentCandle.low, price),
        close: price,
      };

      return {
        candle: { ...this.currentCandle },
        isNewCandle: false,
      };
    }

    const newCandle: OHLCV = {
      time: bucketTime,
      open: price,
      high: price,
      low: price,
      close: price,
      volume: 0,
    };

    this.currentCandle = newCandle;

    return {
      candle: { ...newCandle },
      isNewCandle: true,
    };
  }

  setTimeframe(timeframe: Timeframe): void {
    this.timeframe = timeframe;
    this.currentCandle = null;
  }

  getTimeframe(): Timeframe {
    return this.timeframe;
  }

  getCurrentCandle(): OHLCV | null {
    return this.currentCandle ? { ...this.currentCandle } : null;
  }

  seedFromCandle(candle: OHLCV): void {
    this.currentCandle = { ...candle };
  }

  reset(): void {
    this.currentCandle = null;
  }
}
