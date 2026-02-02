"use client";

import { useEffect, useRef, useState } from "react";
import type { IChartApi, ISeriesApi, CandlestickData, Time } from "lightweight-charts";
import { useCandleStream, type Timeframe } from "../hooks/use-candle-stream";
import { usePriceStore, type OHLCV } from "../stores/price-store";

interface PriceChartProps {
  token: string;
  className?: string;
}

const EMPTY_OHLCV: OHLCV[] = [];

const TIMEFRAMES: { label: string; value: Timeframe }[] = [
  { label: "1M", value: "1m" },
  { label: "5M", value: "5m" },
  { label: "15M", value: "15m" },
  { label: "1H", value: "1H" },
  { label: "4H", value: "4H" },
  { label: "1D", value: "1D" },
];

export function PriceChart({ token, className = "" }: PriceChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const initialLoadDoneRef = useRef(false);
  const lastDataLengthRef = useRef(0);

  const [timeframe, setTimeframe] = useState<Timeframe>("15m");
  const { isSeeding, historicalError } = useCandleStream({ token, timeframe });
  const ohlcvData = usePriceStore((state) => state.ohlcvData[token]) ?? EMPTY_OHLCV;
  const currentPrice = usePriceStore((state) => state.prices[token]);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    let chart: IChartApi | null = null;
    let isMounted = true;

    async function initChart() {
      const { createChart, CandlestickSeries } = await import("lightweight-charts");

      if (!chartContainerRef.current || !isMounted) return;

      const chartInstance = createChart(chartContainerRef.current, {
        layout: {
          background: { color: "#000000" },
          textColor: "#888888",
        },
        grid: {
          vertLines: { color: "#222222" },
          horzLines: { color: "#222222" },
        },
        crosshair: {
          mode: 1,
          vertLine: { color: "#f97316", width: 1, style: 2 },
          horzLine: { color: "#f97316", width: 1, style: 2 },
        },
        rightPriceScale: {
          borderColor: "#333333",
          autoScale: true,
        },
        timeScale: {
          borderColor: "#333333",
          timeVisible: true,
          secondsVisible: false,
        },
        handleScale: {
          axisPressedMouseMove: true,
        },
        handleScroll: {
          vertTouchDrag: false,
        },
      });

      const candlestickSeries = chartInstance.addSeries(CandlestickSeries, {
        upColor: "#22c55e",
        downColor: "#ef4444",
        borderUpColor: "#22c55e",
        borderDownColor: "#ef4444",
        wickUpColor: "#22c55e",
        wickDownColor: "#ef4444",
      });

      chartRef.current = chartInstance;
      seriesRef.current = candlestickSeries;

      const resizeObserver = new ResizeObserver((entries) => {
        if (entries.length === 0 || !chartRef.current) return;
        const { width, height } = entries[0].contentRect;
        chartRef.current.applyOptions({ width, height });
      });

      resizeObserver.observe(chartContainerRef.current);

      const currentData = usePriceStore.getState().ohlcvData[token] ?? [];
      if (currentData.length > 0) {
        const sorted = [...currentData].sort((a, b) => a.time - b.time);
        candlestickSeries.setData(sorted.map(c => ({
          time: c.time as Time,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        })));
        chartInstance.timeScale().fitContent();
        initialLoadDoneRef.current = true;
        lastDataLengthRef.current = currentData.length;
      }

      return () => {
        resizeObserver.disconnect();
        chartInstance.remove();
        chartRef.current = null;
        seriesRef.current = null;
      };
    }

    const cleanupPromise = initChart();

    return () => {
      isMounted = false;
      cleanupPromise.then((cleanup) => cleanup?.());
    };
  }, []);

  const lastTokenRef = useRef(token);
  const lastTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!seriesRef.current) return;

    const formatCandle = (candle: OHLCV): CandlestickData<Time> => ({
      time: (candle.time as number) as Time,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    });

    const tokenChanged = token !== lastTokenRef.current;
    if (tokenChanged) {
      seriesRef.current.setData([]);
      initialLoadDoneRef.current = false;
      lastDataLengthRef.current = 0;
      lastTimeRef.current = 0;
      lastTokenRef.current = token;
    }

    if (ohlcvData.length === 0) {
      return;
    }

    const sortedData = [...ohlcvData].sort((a, b) => a.time - b.time);
    const lastCandle = sortedData[sortedData.length - 1];
    const lastTime = lastCandle.time;

    const dataLengthChanged = ohlcvData.length !== lastDataLengthRef.current;
    const isInitialLoad = !initialLoadDoneRef.current;
    const isTimeReversed = lastTime < lastTimeRef.current;

    if (isInitialLoad || dataLengthChanged || isTimeReversed || tokenChanged) {
      const formattedData = sortedData.map(formatCandle);
      seriesRef.current.setData(formattedData);

      if (isInitialLoad && chartRef.current) {
        chartRef.current.timeScale().fitContent();
      }

      initialLoadDoneRef.current = true;
      lastDataLengthRef.current = ohlcvData.length;
      lastTimeRef.current = lastTime;
    } else {
      seriesRef.current.update(formatCandle(lastCandle));
      lastTimeRef.current = lastTime;
    }
  }, [ohlcvData, token]);

  return (
    <div className={`border-bloomberg bg-bloomberg-secondary ${className}`}>
      <div className="border-bottom px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-bloomberg-label">PAIR</span>
            <span className="text-bloomberg-value">{token}/USD</span>
          </div>

          {currentPrice && (
            <div className="flex items-center gap-2">
              <span className="text-bloomberg-value text-accent">
                ${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          )}

          {isSeeding && (
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
              <span className="text-bloomberg-label">LOADING</span>
            </div>
          )}

          {historicalError && !isSeeding && (
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              <span className="text-bloomberg-label text-accent">LIVE ONLY</span>
            </div>
          )}
        </div>

        <div className="flex gap-1">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.value}
              onClick={() => setTimeframe(tf.value)}
              className={`px-3 py-1 text-bloomberg-label ${
                timeframe === tf.value
                  ? "border-focus-bloomberg bg-bloomberg-tertiary text-accent"
                  : "border-bloomberg bg-bloomberg-secondary hover:bg-bloomberg-tertiary"
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>
      </div>

      <div ref={chartContainerRef} className="h-[400px] w-full" />
    </div>
  );
}
