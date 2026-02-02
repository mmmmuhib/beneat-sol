"use client";

import { useState, useEffect, useCallback } from "react";
import { useVault } from "../hooks/use-vault";

interface RuleConfigProps {
  initialDailyLossLimit?: number;
  initialMaxTrades?: number;
  initialLockoutDuration?: number;
  onSave?: () => void;
}

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

export function RuleConfig({
  initialDailyLossLimit,
  initialMaxTrades,
  initialLockoutDuration,
  onSave,
}: RuleConfigProps) {
  const { setRules, vault, isSending } = useVault();

  const [dailyLossLimit, setDailyLossLimit] = useState<string>(
    initialDailyLossLimit?.toString() ?? ""
  );
  const [maxTrades, setMaxTrades] = useState<string>(
    initialMaxTrades?.toString() ?? ""
  );
  const [lockoutDuration, setLockoutDuration] = useState<string>(
    initialLockoutDuration?.toString() ?? ""
  );

  const [errors, setErrors] = useState<ValidationErrors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "success" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (initialDailyLossLimit !== undefined) {
      setDailyLossLimit(initialDailyLossLimit.toString());
    }
    if (initialMaxTrades !== undefined) {
      setMaxTrades(initialMaxTrades.toString());
    }
    if (initialLockoutDuration !== undefined) {
      setLockoutDuration(initialLockoutDuration.toString());
    }
  }, [initialDailyLossLimit, initialMaxTrades, initialLockoutDuration]);

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

  const validateAll = useCallback((): boolean => {
    const newErrors: ValidationErrors = {
      dailyLossLimit: validateField("dailyLossLimit", dailyLossLimit),
      maxTrades: validateField("maxTrades", maxTrades),
      lockoutDuration: validateField("lockoutDuration", lockoutDuration),
    };

    setErrors(newErrors);
    return !Object.values(newErrors).some(Boolean);
  }, [dailyLossLimit, maxTrades, lockoutDuration, validateField]);

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

  const handleSave = async () => {
    setTouched({
      dailyLossLimit: true,
      maxTrades: true,
      lockoutDuration: true,
    });

    if (!validateAll()) {
      return;
    }

    setSaveStatus("saving");
    setErrorMessage(null);

    try {
      const dailyLossLimitLamports = BigInt(
        Math.floor(parseFloat(dailyLossLimit) * 1_000_000_000)
      );
      const lockoutDurationSeconds = Math.floor(
        parseFloat(lockoutDuration) * 3600
      );
      const maxTradesValue = Math.floor(parseFloat(maxTrades));

      const signature = await setRules(
        dailyLossLimitLamports,
        maxTradesValue,
        lockoutDurationSeconds
      );

      if (signature) {
        setSaveStatus("success");
        onSave?.();
        setTimeout(() => {
          setSaveStatus("idle");
        }, 3000);
      } else {
        setSaveStatus("error");
        setErrorMessage("Transaction failed. Please try again.");
      }
    } catch (err) {
      setSaveStatus("error");
      setErrorMessage(
        err instanceof Error ? err.message : "An unexpected error occurred"
      );
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
    <section className="w-full max-w-lg space-y-6 rounded-2xl border border-border bg-card p-6 shadow-[0_20px_80px_-50px_rgba(16,185,129,0.15)]">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">
          Configure Vault Rules
        </h2>
        <p className="text-sm text-text-muted">
          Set your personal risk limits to protect your trading capital.
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
            placeholder="e.g., 5"
            value={dailyLossLimit}
            onChange={(e) => {
              setDailyLossLimit(e.target.value);
              if (touched.dailyLossLimit) {
                setErrors((prev) => ({
                  ...prev,
                  dailyLossLimit: validateField("dailyLossLimit", e.target.value),
                }));
              }
            }}
            onBlur={() => handleBlur("dailyLossLimit")}
            disabled={isSending || saveStatus === "saving"}
            aria-invalid={touched.dailyLossLimit && !!errors.dailyLossLimit}
            aria-describedby={
              errors.dailyLossLimit ? "daily-loss-limit-error" : undefined
            }
            className={`w-full rounded-lg border bg-card px-4 py-2.5 text-sm text-foreground outline-none transition placeholder:text-text-muted disabled:cursor-not-allowed disabled:opacity-60 ${
              touched.dailyLossLimit && errors.dailyLossLimit
                ? "border-status-danger focus:border-status-danger focus:ring-2 focus:ring-status-danger/20"
                : "border-border focus:border-primary focus:ring-2 focus:ring-primary/20"
            }`}
          />
          {touched.dailyLossLimit && errors.dailyLossLimit && (
            <p
              id="daily-loss-limit-error"
              className="text-sm text-status-danger"
              role="alert"
            >
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
            onChange={(e) => {
              setMaxTrades(e.target.value);
              if (touched.maxTrades) {
                setErrors((prev) => ({
                  ...prev,
                  maxTrades: validateField("maxTrades", e.target.value),
                }));
              }
            }}
            onBlur={() => handleBlur("maxTrades")}
            disabled={isSending || saveStatus === "saving"}
            aria-invalid={touched.maxTrades && !!errors.maxTrades}
            aria-describedby={errors.maxTrades ? "max-trades-error" : undefined}
            className={`w-full rounded-lg border bg-card px-4 py-2.5 text-sm text-foreground outline-none transition placeholder:text-text-muted disabled:cursor-not-allowed disabled:opacity-60 ${
              touched.maxTrades && errors.maxTrades
                ? "border-status-danger focus:border-status-danger focus:ring-2 focus:ring-status-danger/20"
                : "border-border focus:border-primary focus:ring-2 focus:ring-primary/20"
            }`}
          />
          {touched.maxTrades && errors.maxTrades && (
            <p
              id="max-trades-error"
              className="text-sm text-status-danger"
              role="alert"
            >
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
              onChange={(e) => {
                setLockoutDuration(e.target.value);
                if (touched.lockoutDuration) {
                  setErrors((prev) => ({
                    ...prev,
                    lockoutDuration: validateField(
                      "lockoutDuration",
                      e.target.value
                    ),
                  }));
                }
              }}
              onBlur={() => handleBlur("lockoutDuration")}
              disabled={isSending || saveStatus === "saving"}
              aria-invalid={touched.lockoutDuration && !!errors.lockoutDuration}
              aria-describedby={
                errors.lockoutDuration ? "lockout-duration-error" : undefined
              }
              className={`w-full rounded-lg border bg-card px-4 py-2.5 text-sm text-foreground outline-none transition placeholder:text-text-muted disabled:cursor-not-allowed disabled:opacity-60 ${
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
              onChange={(e) => {
                setLockoutDuration(e.target.value);
                setTouched((prev) => ({ ...prev, lockoutDuration: true }));
                setErrors((prev) => ({
                  ...prev,
                  lockoutDuration: validateField("lockoutDuration", e.target.value),
                }));
              }}
              disabled={isSending || saveStatus === "saving"}
              aria-label="Lockout duration slider"
              className="w-full cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-60"
            />
            <div className="flex justify-between text-xs text-text-muted">
              <span>1 hour</span>
              <span>84 hours</span>
              <span>168 hours (1 week)</span>
            </div>
          </div>
          {touched.lockoutDuration && errors.lockoutDuration && (
            <p
              id="lockout-duration-error"
              className="text-sm text-status-danger"
              role="alert"
            >
              {errors.lockoutDuration}
            </p>
          )}
          <p className="text-xs text-text-muted">
            How long trading remains locked after a rule breach.
          </p>
        </div>
      </div>

      {saveStatus === "success" && (
        <div
          className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary"
          role="status"
          aria-live="polite"
        >
          Rules saved successfully!
        </div>
      )}

      {saveStatus === "error" && errorMessage && (
        <div
          className="rounded-lg border border-status-danger/30 bg-status-danger/10 px-4 py-3 text-sm text-status-danger"
          role="alert"
        >
          {errorMessage}
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={!isFormValid || isSending || saveStatus === "saving"}
        className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-card disabled:cursor-not-allowed disabled:opacity-40"
      >
        {saveStatus === "saving" || isSending ? (
          <span className="flex items-center justify-center gap-2">
            <svg
              className="h-4 w-4 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Saving...
          </span>
        ) : (
          "Save Rules"
        )}
      </button>

      {vault && (
        <div className="border-t border-border pt-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
            Current Rules
          </p>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-background/30 p-3">
              <p className="text-xs text-text-muted">Loss Limit</p>
              <p className="font-mono text-sm font-semibold text-foreground">
                {(Number(vault.dailyLossLimit) / 1_000_000_000).toFixed(2)} SOL
              </p>
            </div>
            <div className="rounded-lg bg-background/30 p-3">
              <p className="text-xs text-text-muted">Max Trades</p>
              <p className="font-mono text-sm font-semibold text-foreground">
                {vault.maxTradesPerDay}
              </p>
            </div>
            <div className="rounded-lg bg-background/30 p-3">
              <p className="text-xs text-text-muted">Lockout</p>
              <p className="font-mono text-sm font-semibold text-foreground">
                {Math.floor(vault.lockoutDuration / 3600)}h
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
