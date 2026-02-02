"use client";

import { useState, useCallback, useEffect } from "react";
import {
  useOnboardingStore,
  deriveRulesFromSimulation,
  RULE_PRESETS,
  type RulePreset,
  type CustomRules,
} from "../../../stores/onboarding-store";
import { PresetSelector } from "../preset-selector";
import { RuleSuggestions } from "../rule-suggestions";

interface ValidationErrors {
  dailyLossLimit?: string;
  maxTrades?: string;
  lockoutDuration?: string;
}

const VALIDATION = {
  dailyLossLimit: { min: 0.01, max: 1000 },
  maxTrades: { min: 1, max: 100 },
  lockoutDuration: { min: 1, max: 168 },
} as const;

export function RulesStep() {
  const {
    simulatorParams,
    lastSimulationStats,
    selectedPreset,
    customRules,
    setSelectedPreset,
    setCustomRules,
    nextStep,
    prevStep,
  } = useOnboardingStore();

  const [dailyLossLimit, setDailyLossLimit] = useState<string>(
    customRules.dailyLossLimit.toString()
  );
  const [maxTrades, setMaxTrades] = useState<string>(
    customRules.maxTradesPerDay.toString()
  );
  const [lockoutDuration, setLockoutDuration] = useState<string>(
    customRules.lockoutDuration.toString()
  );

  const [errors, setErrors] = useState<ValidationErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const suggestedRules = lastSimulationStats
    ? deriveRulesFromSimulation(simulatorParams, lastSimulationStats)
    : null;

  useEffect(() => {
    setDailyLossLimit(customRules.dailyLossLimit.toString());
    setMaxTrades(customRules.maxTradesPerDay.toString());
    setLockoutDuration(customRules.lockoutDuration.toString());
  }, [customRules]);

  const validateField = useCallback(
    (field: keyof ValidationErrors, value: string): string | undefined => {
      const numValue = parseFloat(value);

      if (value === "" || isNaN(numValue)) {
        return "This field is required";
      }

      const { min, max } = VALIDATION[field];

      if (numValue < min) {
        if (field === "dailyLossLimit") return `Minimum is ${min} SOL`;
        if (field === "maxTrades") return `Minimum is ${min} trade`;
        if (field === "lockoutDuration") return `Minimum is ${min} hour`;
      }

      if (numValue > max) {
        if (field === "dailyLossLimit") return `Maximum is ${max} SOL`;
        if (field === "maxTrades") return `Maximum is ${max} trades`;
        if (field === "lockoutDuration") return `Maximum is ${max} hours (1 week)`;
      }

      return undefined;
    },
    []
  );

  const handleBlur = (field: keyof ValidationErrors) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const value =
      field === "dailyLossLimit"
        ? dailyLossLimit
        : field === "maxTrades"
          ? maxTrades
          : lockoutDuration;
    const error = validateField(field, value);
    setErrors((prev) => ({ ...prev, [field]: error }));
  };

  const handleFieldChange = (field: keyof CustomRules, value: string) => {
    if (field === "dailyLossLimit") {
      setDailyLossLimit(value);
      if (touched.dailyLossLimit) {
        setErrors((prev) => ({
          ...prev,
          dailyLossLimit: validateField("dailyLossLimit", value),
        }));
      }
    } else if (field === "maxTradesPerDay") {
      setMaxTrades(value);
      if (touched.maxTrades) {
        setErrors((prev) => ({
          ...prev,
          maxTrades: validateField("maxTrades", value),
        }));
      }
    } else if (field === "lockoutDuration") {
      setLockoutDuration(value);
      if (touched.lockoutDuration) {
        setErrors((prev) => ({
          ...prev,
          lockoutDuration: validateField("lockoutDuration", value),
        }));
      }
    }

    const numValue = parseFloat(value);
    if (!isNaN(numValue)) {
      setCustomRules({ [field]: numValue });
    }
  };

  const handlePresetSelect = (preset: RulePreset) => {
    setSelectedPreset(preset);
    setErrors({});
    setTouched({});
  };

  const handleApplySuggestion = () => {
    if (suggestedRules) {
      setCustomRules(suggestedRules.rules);
      setSelectedPreset("custom");
    }
  };

  const validateAll = useCallback((): boolean => {
    const newErrors: ValidationErrors = {
      dailyLossLimit: validateField("dailyLossLimit", dailyLossLimit),
      maxTrades: validateField("maxTrades", maxTrades),
      lockoutDuration: validateField("lockoutDuration", lockoutDuration),
    };

    setErrors(newErrors);
    setTouched({
      dailyLossLimit: true,
      maxTrades: true,
      lockoutDuration: true,
    });

    return !Object.values(newErrors).some(Boolean);
  }, [dailyLossLimit, maxTrades, lockoutDuration, validateField]);

  const handleNext = () => {
    if (validateAll()) {
      nextStep();
    }
  };

  const isFormValid =
    dailyLossLimit !== "" &&
    maxTrades !== "" &&
    lockoutDuration !== "" &&
    !errors.dailyLossLimit &&
    !errors.maxTrades &&
    !errors.lockoutDuration;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          Configure Your Rules
        </h2>
        <p className="mt-2 text-text-secondary">
          Set your personal risk limits. Choose a preset or customize based on
          your simulation results.
        </p>
      </div>

      <PresetSelector
        selectedPreset={selectedPreset}
        onSelect={handlePresetSelect}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6 rounded-2xl border border-border bg-card p-6">
          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-foreground">
              Risk Limits
            </h3>
            <p className="text-sm text-text-muted">
              {selectedPreset === "custom"
                ? "Your custom configuration"
                : selectedPreset
                  ? `${selectedPreset.charAt(0).toUpperCase() + selectedPreset.slice(1)} preset`
                  : "Select a preset or configure manually"}
            </p>
          </div>

          <div className="space-y-5">
            <div className="space-y-2">
              <label
                htmlFor="daily-loss-limit"
                className="block text-sm font-medium text-text-secondary"
              >
                Daily Loss Limit (SOL)
              </label>
              <input
                id="daily-loss-limit"
                type="number"
                min={VALIDATION.dailyLossLimit.min}
                max={VALIDATION.dailyLossLimit.max}
                step="0.01"
                placeholder="e.g., 2"
                value={dailyLossLimit}
                onChange={(e) =>
                  handleFieldChange("dailyLossLimit", e.target.value)
                }
                onBlur={() => handleBlur("dailyLossLimit")}
                aria-invalid={touched.dailyLossLimit && !!errors.dailyLossLimit}
                className={`w-full rounded-lg border bg-card px-4 py-2.5 text-sm text-foreground outline-none transition placeholder:text-text-muted ${
                  touched.dailyLossLimit && errors.dailyLossLimit
                    ? "border-status-danger focus:border-status-danger focus:ring-2 focus:ring-status-danger/20"
                    : "border-border focus:border-primary focus:ring-2 focus:ring-primary/20"
                }`}
              />
              {touched.dailyLossLimit && errors.dailyLossLimit && (
                <p className="text-sm text-status-danger" role="alert">
                  {errors.dailyLossLimit}
                </p>
              )}
              <p className="text-xs text-text-muted">
                Trading pauses when daily losses reach this amount.
              </p>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="max-trades"
                className="block text-sm font-medium text-text-secondary"
              >
                Max Trades Per Day
              </label>
              <input
                id="max-trades"
                type="number"
                min={VALIDATION.maxTrades.min}
                max={VALIDATION.maxTrades.max}
                step="1"
                placeholder="e.g., 10"
                value={maxTrades}
                onChange={(e) =>
                  handleFieldChange("maxTradesPerDay", e.target.value)
                }
                onBlur={() => handleBlur("maxTrades")}
                aria-invalid={touched.maxTrades && !!errors.maxTrades}
                className={`w-full rounded-lg border bg-card px-4 py-2.5 text-sm text-foreground outline-none transition placeholder:text-text-muted ${
                  touched.maxTrades && errors.maxTrades
                    ? "border-status-danger focus:border-status-danger focus:ring-2 focus:ring-status-danger/20"
                    : "border-border focus:border-primary focus:ring-2 focus:ring-primary/20"
                }`}
              />
              {touched.maxTrades && errors.maxTrades && (
                <p className="text-sm text-status-danger" role="alert">
                  {errors.maxTrades}
                </p>
              )}
              <p className="text-xs text-text-muted">
                Prevents overtrading by limiting daily trade count.
              </p>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="lockout-duration"
                className="block text-sm font-medium text-text-secondary"
              >
                Lockout Duration (hours)
              </label>
              <div className="space-y-3">
                <input
                  id="lockout-duration"
                  type="number"
                  min={VALIDATION.lockoutDuration.min}
                  max={VALIDATION.lockoutDuration.max}
                  step="1"
                  placeholder="e.g., 24"
                  value={lockoutDuration}
                  onChange={(e) =>
                    handleFieldChange("lockoutDuration", e.target.value)
                  }
                  onBlur={() => handleBlur("lockoutDuration")}
                  aria-invalid={
                    touched.lockoutDuration && !!errors.lockoutDuration
                  }
                  className={`w-full rounded-lg border bg-card px-4 py-2.5 text-sm text-foreground outline-none transition placeholder:text-text-muted ${
                    touched.lockoutDuration && errors.lockoutDuration
                      ? "border-status-danger focus:border-status-danger focus:ring-2 focus:ring-status-danger/20"
                      : "border-border focus:border-primary focus:ring-2 focus:ring-primary/20"
                  }`}
                />
                <input
                  type="range"
                  min={VALIDATION.lockoutDuration.min}
                  max={VALIDATION.lockoutDuration.max}
                  step="1"
                  value={lockoutDuration || VALIDATION.lockoutDuration.min}
                  onChange={(e) =>
                    handleFieldChange("lockoutDuration", e.target.value)
                  }
                  aria-label="Lockout duration slider"
                  className="w-full cursor-pointer accent-primary"
                />
                <div className="flex justify-between text-xs text-text-muted">
                  <span>1 hour</span>
                  <span>84 hours</span>
                  <span>168 hours (1 week)</span>
                </div>
              </div>
              {touched.lockoutDuration && errors.lockoutDuration && (
                <p className="text-sm text-status-danger" role="alert">
                  {errors.lockoutDuration}
                </p>
              )}
              <p className="text-xs text-text-muted">
                How long trading remains locked after a rule breach.
              </p>
            </div>
          </div>
        </div>

        <RuleSuggestions
          suggestedRules={suggestedRules}
          currentRules={customRules}
          onApply={handleApplySuggestion}
        />
      </div>

      <div className="flex items-center justify-between">
        <button
          onClick={prevStep}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-6 py-2.5 text-sm font-medium text-text-secondary transition hover:border-primary/50 hover:text-foreground"
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
          Back to Simulator
        </button>

        <button
          onClick={handleNext}
          disabled={!isFormValid}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-background transition hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-card disabled:cursor-not-allowed disabled:opacity-40"
        >
          Review & Confirm
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
