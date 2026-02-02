"use client";

import type { CustomRules } from "../../stores/onboarding-store";

interface RuleSuggestion {
  rules: CustomRules;
  explanations: string[];
}

interface RuleSuggestionsProps {
  suggestedRules: RuleSuggestion | null;
  currentRules: CustomRules;
  onApply: () => void;
}

export function RuleSuggestions({
  suggestedRules,
  currentRules,
  onApply,
}: RuleSuggestionsProps) {
  if (!suggestedRules) {
    return (
      <div className="rounded-2xl border border-border/50 bg-card/50 p-6">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <svg
              className="h-6 w-6 text-primary/50"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
              />
            </svg>
          </div>
          <p className="text-sm text-text-muted">
            Run the simulator to get personalized rule suggestions.
          </p>
        </div>
      </div>
    );
  }

  const { rules, explanations } = suggestedRules;

  const isDifferent =
    rules.dailyLossLimit !== currentRules.dailyLossLimit ||
    rules.maxTradesPerDay !== currentRules.maxTradesPerDay ||
    rules.lockoutDuration !== currentRules.lockoutDuration;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-primary/20 bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <svg
            className="h-5 w-5 text-primary"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
            />
          </svg>
          <span className="text-sm font-semibold text-primary">
            Smart Suggestions
          </span>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2 rounded-lg bg-background/30 p-3 text-center">
            <div>
              <p className="text-xs text-text-muted">Loss Limit</p>
              <p className="font-mono text-sm font-semibold text-foreground">
                {rules.dailyLossLimit.toFixed(1)} SOL
              </p>
            </div>
            <div>
              <p className="text-xs text-text-muted">Max Trades</p>
              <p className="font-mono text-sm font-semibold text-foreground">
                {rules.maxTradesPerDay}/day
              </p>
            </div>
            <div>
              <p className="text-xs text-text-muted">Lockout</p>
              <p className="font-mono text-sm font-semibold text-foreground">
                {rules.lockoutDuration}h
              </p>
            </div>
          </div>

          <div className="space-y-2">
            {explanations.map((explanation, index) => (
              <div key={index} className="flex items-start gap-2">
                <div className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-primary" />
                <p className="text-xs leading-relaxed text-text-secondary">
                  {explanation}
                </p>
              </div>
            ))}
          </div>

          {isDifferent && (
            <button
              onClick={onApply}
              className="mt-2 w-full rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition hover:bg-primary/20"
            >
              Apply Suggestions
            </button>
          )}

          {!isDifferent && (
            <div className="mt-2 flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2">
              <svg
                className="h-4 w-4 text-primary"
                fill="currentColor"
                viewBox="0 0 20 20"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="text-xs font-medium text-primary">
                Current rules match suggestions
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-border/50 bg-card/50 p-4">
        <p className="text-xs leading-relaxed text-text-muted">
          <span className="font-medium text-text-secondary">Why these values?</span>{" "}
          Suggestions are derived from your simulator exploration. The algorithm
          considers your typical position size, number of trades, and the statistical
          outcomes to recommend sustainable limits.
        </p>
      </div>
    </div>
  );
}
