"use client";

import { useMemo, useState } from "react";
import { type Pattern } from "../lib/mock-analysis";
import { useAnalysisData } from "../hooks/use-analysis-data";
import { TraderCard } from "../components/trader-card";
import { DemoCardPreview } from "../components/demo-card-preview";
import {
  ProfileSkeleton,
  InitializeProfilePrompt,
} from "../components/trader-card-connected";

const PATTERN_NAMES: Record<Pattern["type"], string> = {
  revenge_trading: "Revenge Trading",
  overtrading: "Overtrading",
  losing_streak: "Losing Streak",
  bad_hours: "Bad Trading Hours",
  tilt_sizing: "Emotional Sizing",
};

const PATTERN_ICONS: Record<Pattern["type"], string> = {
  revenge_trading:
    "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z",
  overtrading:
    "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z",
  losing_streak:
    "M2.25 6L9 12.75l4.286-4.286a11.948 11.948 0 014.306 6.43l.776 2.898m0 0l3.182-5.511m-3.182 5.51l-5.511-3.181",
  bad_hours: "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z",
  tilt_sizing:
    "M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 01-2.031.352 5.988 5.988 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971z",
};

const tierColors: Record<string, string> = {
  Bronze: "#cd7f32",
  Silver: "#c0c0c0",
  Gold: "#ffd700",
  Diamond: "#10b981",
  Legendary: "#8b5cf6",
};

function SeverityDot({ severity }: { severity: "low" | "medium" | "high" }) {
  const colors = {
    high: "bg-status-danger",
    medium: "bg-status-warning",
    low: "bg-status-safe",
  };
  return (
    <span
      className={`h-2 w-2 rounded-full ${colors[severity]}`}
      aria-hidden="true"
    />
  );
}

function ImpactBar({
  percentage,
  severity,
}: {
  percentage: number;
  severity: "low" | "medium" | "high";
}) {
  const colors = {
    high: "bg-status-danger",
    medium: "bg-status-warning",
    low: "bg-status-safe",
  };
  return (
    <div className="h-1.5 w-full rounded-full bg-border">
      <div
        className={`h-full rounded-full transition-all duration-500 ${colors[severity]}`}
        style={{ width: `${Math.min(percentage, 100)}%` }}
        role="progressbar"
        aria-valuenow={percentage}
        aria-valuemin={0}
        aria-valuemax={100}
      />
    </div>
  );
}

function StatBar({ label, value }: { label: string; value: number }) {
  const percentage = (value / 99) * 100;
  const color =
    value >= 70
      ? "bg-status-safe"
      : value >= 40
        ? "bg-status-warning"
        : "bg-status-danger";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-text-secondary">{label}</span>
        <span className="font-mono text-sm font-bold text-foreground">
          {value}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-border">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  variant = "default",
}: {
  label: string;
  value: string | number;
  variant?: "default" | "danger";
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
        {label}
      </p>
      <p
        className={`mt-1 text-xl font-bold tabular-nums ${variant === "danger" ? "text-status-danger" : "text-foreground"}`}
      >
        {value}
      </p>
    </div>
  );
}

function PatternCard({
  pattern,
  totalLoss,
  isExpanded,
  onToggle,
}: {
  pattern: Pattern;
  totalLoss: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const lossPercentage =
    totalLoss > 0 ? (pattern.estimatedLoss / totalLoss) * 100 : 0;

  return (
    <button
      onClick={onToggle}
      className="w-full rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      aria-expanded={isExpanded}
      aria-label={`${PATTERN_NAMES[pattern.type]}, ${pattern.severity} severity, click to ${isExpanded ? "collapse" : "expand"}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${
              pattern.severity === "high"
                ? "bg-status-danger/10"
                : pattern.severity === "medium"
                  ? "bg-status-warning/10"
                  : "bg-status-safe/10"
            }`}
          >
            <svg
              className={`h-5 w-5 ${
                pattern.severity === "high"
                  ? "text-status-danger"
                  : pattern.severity === "medium"
                    ? "text-status-warning"
                    : "text-status-safe"
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d={PATTERN_ICONS[pattern.type]}
              />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground">
                {PATTERN_NAMES[pattern.type]}
              </span>
              <SeverityDot severity={pattern.severity} />
            </div>
            <span className="text-sm text-text-muted">
              {pattern.occurrences} occurrence
              {pattern.occurrences !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold tabular-nums text-status-danger">
            -${pattern.estimatedLoss.toLocaleString()}
          </span>
          <svg
            className={`h-5 w-5 text-text-muted transition-transform ${isExpanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </div>

      <div className="mt-3">
        <ImpactBar percentage={lossPercentage} severity={pattern.severity} />
        <div className="mt-1 flex justify-between text-xs text-text-muted">
          <span>Impact on losses</span>
          <span className="tabular-nums">{Math.round(lossPercentage)}%</span>
        </div>
      </div>

      {isExpanded && (
        <div className="mt-4 border-t border-border pt-4">
          <p className="text-sm text-text-secondary">{pattern.description}</p>
        </div>
      )}
    </button>
  );
}

function HeroCard() {
  const data = useAnalysisData();

  if (data.isLoading) {
    return <ProfileSkeleton />;
  }

  if (!data.isConnected) {
    return (
      <DemoCardPreview
        stats={data.stats}
        overallRating={data.overallRating}
        tier={data.tier}
        estimatedPreventableLoss={data.estimatedPreventableLoss}
      />
    );
  }

  if (data.error) {
    return (
      <div className="w-full max-w-sm rounded-2xl border border-status-danger/30 bg-status-danger/5 p-4 text-center">
        <p className="text-sm text-status-danger">{data.error}</p>
      </div>
    );
  }

  if (!data.hasProfile) {
    return (
      <InitializeProfilePrompt
        onInitialize={data.initializeProfile}
        isSending={data.isSending}
      />
    );
  }

  return (
    <TraderCard
      walletAddress={data.walletAddress}
      stats={data.stats}
      overallRating={data.overallRating}
      tier={data.tier}
      estimatedPreventableLoss={data.estimatedPreventableLoss}
    />
  );
}

function AnalysisDashboard() {
  const data = useAnalysisData();
  const [expandedPattern, setExpandedPattern] = useState<number | null>(null);

  const sortedPatterns = useMemo(() => {
    const severityOrder = { high: 0, medium: 1, low: 2 };
    return [...data.patterns].sort(
      (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
    );
  }, [data.patterns]);

  const totalPatternLoss = data.patterns.reduce(
    (sum, p) => sum + p.estimatedLoss,
    0
  );

  const criticalCount = data.patterns.filter(
    (p) => p.severity === "high"
  ).length;

  return (
    <>
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">
          Your Trading Analysis
        </h1>
        <p className="mt-1 flex items-center gap-2 text-sm text-text-secondary">
          <span>Last 30 days</span>
          <span className="text-text-muted">•</span>
          <span
            className="font-semibold"
            style={{ color: tierColors[data.tier] }}
          >
            {data.tier}
          </span>
          <span className="text-text-muted">tier</span>
        </p>
      </header>

      <div className="grid gap-6 md:grid-cols-[280px_1fr]">
        <div className="flex justify-center md:justify-start">
          <HeroCard />
        </div>
        <div className="grid grid-cols-2 content-center gap-x-6 gap-y-4">
          <StatBar label="Discipline" value={data.stats.discipline} />
          <StatBar label="Timing" value={data.stats.timing} />
          <StatBar label="Patience" value={data.stats.patience} />
          <StatBar label="Risk Control" value={data.stats.riskControl} />
          <StatBar label="Consistency" value={data.stats.consistency} />
          <StatBar label="Endurance" value={data.stats.endurance} />
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Overall Rating" value={data.overallRating} />
        <MetricCard label="Patterns" value={data.patterns.length} />
        <MetricCard label="Critical" value={criticalCount} variant="danger" />
        <MetricCard
          label="Est. Loss"
          value={`$${data.estimatedPreventableLoss.toLocaleString()}`}
          variant="danger"
        />
      </div>

      <section className="mt-10" aria-labelledby="patterns-heading">
        <div className="mb-4 flex items-center justify-between">
          <h2
            id="patterns-heading"
            className="text-lg font-semibold text-foreground"
          >
            Detected Patterns
          </h2>
          {criticalCount > 0 && (
            <span className="flex items-center gap-1.5 rounded-full bg-status-danger/10 px-2.5 py-1 text-xs font-medium text-status-danger">
              <SeverityDot severity="high" />
              {criticalCount} critical
            </span>
          )}
        </div>

        <div className="space-y-3">
          {sortedPatterns.map((pattern, idx) => (
            <PatternCard
              key={`${pattern.type}-${idx}`}
              pattern={pattern}
              totalLoss={totalPatternLoss}
              isExpanded={expandedPattern === idx}
              onToggle={() =>
                setExpandedPattern(expandedPattern === idx ? null : idx)
              }
            />
          ))}
        </div>
      </section>
    </>
  );
}

export default function AnalyzePage() {
  return (
    <div className="min-h-screen pt-20">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <AnalysisDashboard />
      </div>
    </div>
  );
}
