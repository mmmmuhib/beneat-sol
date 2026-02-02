"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useOnboardingStore, deriveRulesFromSimulation } from "../../../stores/onboarding-store";
import {
  type SimulatorParams,
  runMonteCarloWithCurves,
} from "../../simulator/simulation-logic";
import { SimulatorControls } from "../../simulator/simulator-controls";
import { MonteCarloChart, MonteCarloLegend } from "../../simulator/monte-carlo-chart";
import { MonteCarloStats } from "../../simulator/monte-carlo-stats";

function InsightCard({
  stats,
  params,
}: {
  stats: {
    profitableCount: number;
    profitablePercent: number;
    medianReturn: number;
    worstCase: number;
    bestCase: number;
    avgMaxDrawdown: number;
  };
  params: SimulatorParams;
}) {
  const { rules, explanations } = deriveRulesFromSimulation(params, stats);

  let riskLevel: "low" | "medium" | "high" = "medium";
  let riskColor = "text-status-warning";
  let riskBg = "bg-status-warning/10";

  if (stats.profitablePercent > 55 && stats.avgMaxDrawdown < 20) {
    riskLevel = "low";
    riskColor = "text-status-safe";
    riskBg = "bg-status-safe/10";
  } else if (stats.profitablePercent < 40 || stats.avgMaxDrawdown > 35) {
    riskLevel = "high";
    riskColor = "text-status-danger";
    riskBg = "bg-status-danger/10";
  }

  return (
    <div className="rounded-2xl border border-primary/20 bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wider text-primary/70">
          Strategy Insight
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${riskBg} ${riskColor}`}
        >
          {riskLevel} risk
        </span>
      </div>

      <div className="space-y-3 text-sm">
        <div className="grid grid-cols-3 gap-2 rounded-lg bg-background/30 p-3">
          <div className="text-center">
            <p className="text-xs text-text-muted">Suggested Limit</p>
            <p className="font-mono font-semibold text-foreground">
              {rules.dailyLossLimit.toFixed(1)} SOL
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-text-muted">Max Trades</p>
            <p className="font-mono font-semibold text-foreground">
              {rules.maxTradesPerDay}/day
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-text-muted">Lockout</p>
            <p className="font-mono font-semibold text-foreground">
              {rules.lockoutDuration}h
            </p>
          </div>
        </div>

        <p className="text-xs leading-relaxed text-text-secondary">
          {explanations[0]}
        </p>
      </div>
    </div>
  );
}

export function SimulatorStep() {
  const {
    simulatorParams,
    setSimulatorParams,
    recordExploration,
    setLastSimulationStats,
    nextStep,
    prevStep,
    isReviewMode,
  } = useOnboardingStore();

  const [params, setParams] = useState<SimulatorParams>(simulatorParams);
  const [scenarioCount, setScenarioCount] = useState<number>(50);
  const [seed, setSeed] = useState<number>(0);

  const regenerateSimulations = useCallback(() => {
    setSeed((s) => s + 1);
  }, []);

  const handleParamsChange = useCallback(
    (newParams: SimulatorParams) => {
      setParams(newParams);
      setSimulatorParams(newParams);
      recordExploration(newParams);
    },
    [setSimulatorParams, recordExploration]
  );

  const monteCarloResult = useMemo(() => {
    void seed;
    return runMonteCarloWithCurves(params, scenarioCount);
  }, [params, scenarioCount, seed]);

  useEffect(() => {
    setLastSimulationStats(monteCarloResult.stats);
  }, [monteCarloResult.stats, setLastSimulationStats]);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          Explore Your Strategy
        </h2>
        <p className="mt-2 text-text-secondary">
          Adjust the parameters below to see how different trading approaches perform
          across {scenarioCount} simulated outcomes.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-4 flex items-center gap-4">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent to-border" />
          <span className="font-mono text-[11px] uppercase tracking-widest text-primary/70">
            monte carlo analysis
          </span>
          <div className="h-px flex-1 bg-gradient-to-l from-transparent to-border" />
        </div>

        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-background/30 p-4">
              <SimulatorControls
                params={params}
                onParamsChange={handleParamsChange}
                onRerun={regenerateSimulations}
                scenarioCount={scenarioCount}
                onScenarioCountChange={setScenarioCount}
              />
            </div>

            <InsightCard stats={monteCarloResult.stats} params={params} />
          </div>

          <div className="space-y-4">
            <div className="overflow-hidden rounded-xl border border-border">
              <div className="flex items-center justify-between border-b border-border/50 px-4 py-2">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                  <span className="font-mono text-[10px] uppercase tracking-wider text-text-secondary">
                    Parameter Stability
                  </span>
                </div>
                <span className="font-mono text-[10px] text-text-muted">
                  {scenarioCount} scenarios · {params.numTrades} trades each
                </span>
              </div>

              <div className="p-3">
                <MonteCarloChart
                  result={monteCarloResult}
                  startingBalance={params.startingBalance}
                  height={280}
                />
              </div>

              <MonteCarloLegend
                result={monteCarloResult}
                startingBalance={params.startingBalance}
              />
            </div>

            <div className="overflow-hidden rounded-xl border border-primary/20">
              <div className="border-b border-primary/10 bg-primary/5 px-3 py-1.5">
                <span className="font-mono text-[10px] uppercase tracking-wider text-primary/70">
                  Monte Carlo Statistics
                </span>
              </div>
              <MonteCarloStats
                result={monteCarloResult}
                scenarioCount={scenarioCount}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border/50 bg-card/50 p-4">
        <div className="flex items-start gap-3">
          <div className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" />
          <div>
            <p className="text-sm leading-relaxed text-text-secondary">
              <span className="font-medium text-primary">
                What to look for:
              </span>{" "}
              A tight spread between best and worst cases means your parameters
              are robust. Wide spreads indicate high variance—you might win big
              or lose big depending on luck.
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={prevStep}
          className={`inline-flex items-center gap-2 rounded-lg border border-border px-6 py-2.5 text-sm font-medium text-text-secondary transition hover:border-primary/50 hover:text-foreground ${
            isReviewMode ? "invisible" : ""
          }`}
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M11 17l-5-5m0 0l5-5m-5 5h12"
            />
          </svg>
          Back
        </button>

        <button
          onClick={nextStep}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-background transition hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-card"
        >
          Configure Rules
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13 7l5 5m0 0l-5 5m5-5H6"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
