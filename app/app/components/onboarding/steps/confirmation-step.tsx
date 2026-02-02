"use client";

import { useOnboardingStore } from "../../../stores/onboarding-store";

interface ConfirmationStepProps {
  onConfirm: () => Promise<void>;
  onCancel: () => void;
  isSending: boolean;
  hasExistingVault: boolean;
  isDemoMode?: boolean;
}

function formatDuration(hours: number): string {
  const days = Math.floor(hours / 24);
  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  }
  return `${hours}h`;
}

export function ConfirmationStep({
  onConfirm,
  onCancel,
  isSending,
  hasExistingVault,
  isDemoMode = false,
}: ConfirmationStepProps) {
  const {
    getEffectiveRules,
    transactionStatus,
    transactionError,
    prevStep,
    isReviewMode,
  } = useOnboardingStore();

  const rules = getEffectiveRules();

  const isProcessing =
    transactionStatus === "initializing" ||
    transactionStatus === "setting-rules";
  const isSuccess = transactionStatus === "success";
  const isError = transactionStatus === "error";

  const getStatusMessage = () => {
    switch (transactionStatus) {
      case "initializing":
        return isDemoMode
          ? "Simulating vault initialization..."
          : "Initializing your vault...";
      case "setting-rules":
        return isDemoMode
          ? "Simulating rule configuration..."
          : "Setting your rules...";
      case "success":
        return isReviewMode
          ? "Rules updated successfully!"
          : isDemoMode
            ? "Demo vault created successfully!"
            : "Vault created successfully!";
      case "error":
        return transactionError || "An error occurred. Please try again.";
      default:
        return null;
    }
  };

  const statusMessage = getStatusMessage();

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          {isReviewMode ? "Confirm Rule Changes" : "Confirm Your Vault"}
        </h2>
        <p className="mt-2 text-text-secondary">
          {isReviewMode
            ? "Review your updated rules before saving."
            : "Review your configuration before creating your vault."}
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6">
        <h3 className="mb-4 text-lg font-semibold text-foreground">
          Your Risk Rules
        </h3>

        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg bg-background/30 p-4">
            <div>
              <p className="text-sm font-medium text-foreground">
                Daily Loss Limit
              </p>
              <p className="text-xs text-text-muted">
                Trading pauses when reached
              </p>
            </div>
            <p className="font-mono text-lg font-semibold text-primary">
              {rules.dailyLossLimit.toFixed(2)} SOL
            </p>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-background/30 p-4">
            <div>
              <p className="text-sm font-medium text-foreground">
                Max Trades Per Day
              </p>
              <p className="text-xs text-text-muted">Prevents overtrading</p>
            </div>
            <p className="font-mono text-lg font-semibold text-primary">
              {rules.maxTradesPerDay}
            </p>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-background/30 p-4">
            <div>
              <p className="text-sm font-medium text-foreground">
                Lockout Duration
              </p>
              <p className="text-xs text-text-muted">Enforced cooling period</p>
            </div>
            <p className="font-mono text-lg font-semibold text-primary">
              {formatDuration(rules.lockoutDuration)}
            </p>
          </div>
        </div>
      </div>

      {!isReviewMode && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-start gap-3">
            <svg
              className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
              />
            </svg>
            <div>
              <p className="text-sm font-medium text-primary">
                {isDemoMode ? "Demo Transaction Details" : "Transaction Details"}
              </p>
              <p className="mt-1 text-xs text-text-secondary">
                {isDemoMode
                  ? "This demo will simulate two transactions: one to initialize your vault and one to set your rules. No real SOL will be spent."
                  : "This will create two transactions: one to initialize your vault and one to set your rules. You'll need to approve both in your wallet."}
              </p>
            </div>
          </div>
        </div>
      )}

      {statusMessage && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            isError
              ? "border-status-danger/30 bg-status-danger/10 text-status-danger"
              : isSuccess
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-status-warning/30 bg-status-warning/10 text-status-warning"
          }`}
          role={isError ? "alert" : "status"}
          aria-live="polite"
        >
          <div className="flex items-center gap-2">
            {isProcessing && (
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
            )}
            {isSuccess && (
              <svg
                className="h-4 w-4"
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
            {statusMessage}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <button
          onClick={prevStep}
          disabled={isProcessing || isSuccess}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-6 py-2.5 text-sm font-medium text-text-secondary transition hover:border-primary/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
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
          Edit Rules
        </button>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={isProcessing || isSuccess}
            className="rounded-lg border border-border px-6 py-2.5 text-sm font-medium text-text-secondary transition hover:border-status-danger/50 hover:text-status-danger disabled:cursor-not-allowed disabled:opacity-40"
          >
            Cancel
          </button>

          <button
            onClick={onConfirm}
            disabled={isProcessing || isSuccess || isSending}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-background transition hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-card disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isProcessing ? (
              <>
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
                Processing...
              </>
            ) : isReviewMode ? (
              <>
                Update Rules
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
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </>
            ) : (
              <>
                Create Vault
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
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
