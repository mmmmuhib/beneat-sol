"use client";

import { useMemo } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
  type ChartOptions,
  type ChartData,
} from "chart.js";
import { Line } from "react-chartjs-2";
import type { MonteCarloFullResult } from "./simulation-logic";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend
);

interface MonteCarloChartProps {
  result: MonteCarloFullResult;
  startingBalance: number;
  height?: number;
}

const PERCENTILE_COLORS = {
  best: "#22c55e",
  p75: "#06b6d4",
  median: "#3b82f6",
  p25: "#eab308",
  worst: "#ef4444",
};

const PERCENTILE_LABELS = {
  best: "Best Case",
  p75: "75th Percentile",
  median: "Median",
  p25: "25th Percentile",
  worst: "Worst Case",
};

export function MonteCarloChart({
  result,
  startingBalance,
  height = 320,
}: MonteCarloChartProps) {
  const labels = useMemo(() => {
    const curveLength = result.curves[0]?.length || 0;
    return Array.from({ length: curveLength }, (_, i) => i.toString());
  }, [result.curves]);

  const datasets = useMemo(() => {
    const allDatasets: ChartData<"line">["datasets"] = [];

    result.curves.forEach((curve, idx) => {
      const isPercentileCurve =
        idx === result.percentileIndices.best ||
        idx === result.percentileIndices.worst ||
        idx === result.percentileIndices.median ||
        idx === result.percentileIndices.p25 ||
        idx === result.percentileIndices.p75;

      if (!isPercentileCurve) {
        allDatasets.push({
          label: `Sim ${idx + 1}`,
          data: curve,
          fill: false,
          borderColor: "rgba(255, 255, 255, 0.06)",
          borderWidth: 1,
          tension: 0.3,
          pointRadius: 0,
          pointHoverRadius: 0,
          order: 10,
        });
      }
    });

    const percentileOrder: (keyof typeof PERCENTILE_COLORS)[] = [
      "worst",
      "p25",
      "median",
      "p75",
      "best",
    ];

    percentileOrder.forEach((key, orderIdx) => {
      const curve = result.percentiles[key];
      const color = PERCENTILE_COLORS[key];
      const isDashed = key === "p25" || key === "p75";

      allDatasets.push({
        label: PERCENTILE_LABELS[key],
        data: curve,
        fill: false,
        borderColor: color,
        borderWidth: key === "median" ? 2.5 : isDashed ? 2 : 2.5,
        borderDash: isDashed ? [6, 4] : [],
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 4,
        pointHoverBackgroundColor: color,
        order: orderIdx,
      });
    });

    return allDatasets;
  }, [result]);

  const data: ChartData<"line"> = {
    labels,
    datasets,
  };

  const options: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      intersect: false,
      mode: "index",
    },
    plugins: {
      tooltip: {
        enabled: true,
        backgroundColor: "rgba(0, 0, 0, 0.9)",
        titleColor: "#fff",
        bodyColor: "#fff",
        borderColor: "rgba(255, 255, 255, 0.1)",
        borderWidth: 1,
        padding: 12,
        displayColors: true,
        filter: (item) => {
          const label = item.dataset.label || "";
          return Object.values(PERCENTILE_LABELS).includes(label);
        },
        callbacks: {
          title: (items) => `Trade #${items[0].label}`,
          label: (item) => {
            const value = item.raw as number;
            const pnl = ((value - startingBalance) / startingBalance) * 100;
            return `${item.dataset.label}: $${value.toLocaleString(undefined, {
              minimumFractionDigits: 0,
              maximumFractionDigits: 0,
            })} (${pnl >= 0 ? "+" : ""}${pnl.toFixed(1)}%)`;
          },
        },
      },
      legend: {
        display: true,
        position: "top",
        align: "center",
        labels: {
          color: "rgba(255, 255, 255, 0.6)",
          font: { size: 10, family: "monospace" },
          boxWidth: 16,
          boxHeight: 2,
          padding: 12,
          usePointStyle: false,
          filter: (item) => {
            return Object.values(PERCENTILE_LABELS).includes(item.text);
          },
        },
      },
    },
    scales: {
      x: {
        display: true,
        grid: {
          display: false,
        },
        ticks: {
          color: "rgba(255, 255, 255, 0.3)",
          font: { size: 9 },
          maxTicksLimit: 6,
        },
        border: {
          display: false,
        },
        title: {
          display: true,
          text: "Trade #",
          color: "rgba(255, 255, 255, 0.3)",
          font: { size: 9 },
        },
      },
      y: {
        display: true,
        position: "right",
        grid: {
          color: "rgba(255, 255, 255, 0.03)",
        },
        ticks: {
          color: "rgba(255, 255, 255, 0.3)",
          font: { size: 9 },
          maxTicksLimit: 5,
          callback: (value) => `$${(Number(value) / 1000).toFixed(0)}k`,
        },
        border: {
          display: false,
        },
        grace: "10%",
      },
    },
    animation: {
      duration: 400,
      easing: "easeOutQuart",
    },
  };

  return (
    <div className="relative">
      <div className="absolute left-3 top-2 z-10">
        <span className="rounded bg-background/50 px-2 py-1 font-mono text-[9px] tracking-wider text-text-muted">
          Start: ${startingBalance.toLocaleString()}
        </span>
      </div>

      <div style={{ height: `${height}px` }}>
        <Line data={data} options={options} />
      </div>
    </div>
  );
}

interface MonteCarloLegendProps {
  result: MonteCarloFullResult;
  startingBalance: number;
}

export function MonteCarloLegend({
  result,
  startingBalance,
}: MonteCarloLegendProps) {
  const percentileData = [
    { key: "best", label: "Best", color: PERCENTILE_COLORS.best },
    { key: "p75", label: "75th", color: PERCENTILE_COLORS.p75 },
    { key: "median", label: "Median", color: PERCENTILE_COLORS.median },
    { key: "p25", label: "25th", color: PERCENTILE_COLORS.p25 },
    { key: "worst", label: "Worst", color: PERCENTILE_COLORS.worst },
  ] as const;

  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 border-t border-border/50 bg-background/30 px-4 py-3">
      {percentileData.map(({ key, label, color }) => {
        const curve = result.percentiles[key];
        const finalValue = curve[curve.length - 1];
        const pnl = ((finalValue - startingBalance) / startingBalance) * 100;
        const isPositive = pnl >= 0;

        return (
          <div key={key} className="flex items-center gap-2">
            <div className="h-0.5 w-4" style={{ backgroundColor: color }} />
            <span className="font-mono text-[10px] text-text-secondary">
              {label}:
            </span>
            <span
              className={`font-mono text-[10px] font-medium ${
                isPositive ? "text-status-safe" : "text-status-danger"
              }`}
            >
              {isPositive ? "+" : ""}
              {pnl.toFixed(1)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
