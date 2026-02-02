"use client";

import { RULE_PRESETS, type RulePreset } from "../../stores/onboarding-store";

interface PresetInfo {
  id: RulePreset;
  label: string;
  description: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

const PRESETS: PresetInfo[] = [
  {
    id: "conservative",
    label: "Conservative",
    description: "Lower limits, longer lockouts. For risk-averse traders.",
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/30",
  },
  {
    id: "balanced",
    label: "Balanced",
    description: "Moderate limits for everyday trading. Recommended.",
    color: "text-primary",
    bgColor: "bg-primary/10",
    borderColor: "border-primary/30",
  },
  {
    id: "aggressive",
    label: "Aggressive",
    description: "Higher limits, shorter lockouts. For experienced traders.",
    color: "text-orange-400",
    bgColor: "bg-orange-500/10",
    borderColor: "border-orange-500/30",
  },
];

interface PresetSelectorProps {
  selectedPreset: RulePreset | null;
  onSelect: (preset: RulePreset) => void;
}

export function PresetSelector({ selectedPreset, onSelect }: PresetSelectorProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {PRESETS.map((preset) => {
        const isSelected = selectedPreset === preset.id;
        const rules = RULE_PRESETS[preset.id as Exclude<RulePreset, "custom">];

        return (
          <button
            key={preset.id}
            onClick={() => onSelect(preset.id)}
            className={`rounded-xl border p-4 text-left transition ${
              isSelected
                ? `${preset.borderColor} ${preset.bgColor}`
                : "border-border bg-card hover:border-primary/30"
            }`}
          >
            <div className="flex items-center justify-between">
              <span
                className={`text-sm font-semibold ${
                  isSelected ? preset.color : "text-foreground"
                }`}
              >
                {preset.label}
              </span>
              {isSelected && (
                <svg
                  className={`h-4 w-4 ${preset.color}`}
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
              )}
            </div>
            <p className="mt-1 text-xs text-text-muted">{preset.description}</p>

            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded bg-background/40 px-1.5 py-1">
                <p className="font-mono text-xs font-semibold text-foreground">
                  {rules.dailyLossLimit}
                </p>
                <p className="text-[10px] text-text-muted">SOL</p>
              </div>
              <div className="rounded bg-background/40 px-1.5 py-1">
                <p className="font-mono text-xs font-semibold text-foreground">
                  {rules.maxTradesPerDay}
                </p>
                <p className="text-[10px] text-text-muted">trades</p>
              </div>
              <div className="rounded bg-background/40 px-1.5 py-1">
                <p className="font-mono text-xs font-semibold text-foreground">
                  {rules.lockoutDuration}h
                </p>
                <p className="text-[10px] text-text-muted">lockout</p>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
