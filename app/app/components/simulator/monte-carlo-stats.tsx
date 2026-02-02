"use client";

import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  BarChart3,
  Target,
} from "lucide-react";
import type { MonteCarloFullResult } from "./simulation-logic";

interface MonteCarloStatsProps {
  result: MonteCarloFullResult;
  scenarioCount: number;
  compact?: boolean;
}

interface StatItemProps {
  label: string;
  value: string;
  subValue?: string;
  isPositive?: boolean;
  isNegative?: boolean;
  icon?: React.ReactNode;
}

function StatItem({
  label,
  value,
  subValue,
  isPositive,
  isNegative,
  icon,
}: StatItemProps) {
  return (
    <div className="flex items-center gap-2">
      {icon && <span className="text-text-muted">{icon}</span>}
      <div>
        <div className="font-mono text-[9px] uppercase tracking-wider text-text-muted">
          {label}
        </div>
        <div
          className={`font-mono text-sm font-medium ${
            isPositive
              ? "text-status-safe"
              : isNegative
                ? "text-status-danger"
                : "text-foreground"
          }`}
        >
          {value}
        </div>
        {subValue && (
          <div className="font-mono text-[9px] text-text-muted">{subValue}</div>
        )}
      </div>
    </div>
  );
}

export function MonteCarloStats({
  result,
  scenarioCount,
  compact = false,
}: MonteCarloStatsProps) {
  const { stats } = result;
  const isProfitableMajority = stats.profitablePercent >= 50;
  const isMedianPositive = stats.medianReturn >= 0;

  if (compact) {
    return (
      <div className="flex items-center justify-between gap-4 border-t border-border/50 bg-background/30 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <BarChart3 className="h-3 w-3 text-text-muted" />
          <span
            className={`font-mono text-xs font-medium ${
              isProfitableMajority ? "text-status-safe" : "text-status-danger"
            }`}
          >
            {stats.profitablePercent.toFixed(0)}% profitable
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {isMedianPositive ? (
            <TrendingUp className="h-3 w-3 text-status-safe" />
          ) : (
            <TrendingDown className="h-3 w-3 text-status-danger" />
          )}
          <span
            className={`font-mono text-xs ${
              isMedianPositive ? "text-status-safe" : "text-status-danger"
            }`}
          >
            Median: {isMedianPositive ? "+" : ""}
            {stats.medianReturn.toFixed(1)}%
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <AlertTriangle className="h-3 w-3 text-text-muted" />
          <span className="font-mono text-xs text-text-secondary">
            -{stats.avgMaxDrawdown.toFixed(1)}% avg DD
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 border border-border/50 bg-background/20 p-4 sm:grid-cols-4">
      <StatItem
        label="Profitable Scenarios"
        value={`${stats.profitablePercent.toFixed(0)}%`}
        subValue={`${stats.profitableCount} of ${scenarioCount}`}
        isPositive={isProfitableMajority}
        isNegative={!isProfitableMajority}
        icon={<Target className="h-4 w-4" />}
      />

      <StatItem
        label="Median Final Return"
        value={`${isMedianPositive ? "+" : ""}${stats.medianReturn.toFixed(1)}%`}
        isPositive={isMedianPositive}
        isNegative={!isMedianPositive}
        icon={
          isMedianPositive ? (
            <TrendingUp className="h-4 w-4" />
          ) : (
            <TrendingDown className="h-4 w-4" />
          )
        }
      />

      <StatItem
        label="Best / Worst Case"
        value={`+${stats.bestCase.toFixed(1)}% / ${stats.worstCase.toFixed(1)}%`}
        icon={<BarChart3 className="h-4 w-4" />}
      />

      <StatItem
        label="Avg Max Drawdown"
        value={`-${stats.avgMaxDrawdown.toFixed(1)}%`}
        isNegative={stats.avgMaxDrawdown > 25}
        icon={<AlertTriangle className="h-4 w-4" />}
      />
    </div>
  );
}
