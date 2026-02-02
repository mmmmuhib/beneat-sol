"use client";

import { useState, useEffect, useCallback } from "react";

interface LockoutBannerProps {
  lockoutUntil: number;
  estimatedSavings?: number;
  onEmergencyUnlock?: () => void;
}

function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function LockoutBanner({
  lockoutUntil,
  estimatedSavings,
  onEmergencyUnlock,
}: LockoutBannerProps) {
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [isEmergencyExpanded, setIsEmergencyExpanded] = useState(false);

  const calculateRemaining = useCallback(() => {
    const now = Date.now() / 1000;
    return Math.max(0, lockoutUntil - now);
  }, [lockoutUntil]);

  useEffect(() => {
    setRemainingSeconds(calculateRemaining());

    const interval = setInterval(() => {
      const remaining = calculateRemaining();
      setRemainingSeconds(remaining);

      if (remaining <= 0) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [calculateRemaining]);

  const handleEmergencyUnlock = useCallback(() => {
    if (onEmergencyUnlock) {
      onEmergencyUnlock();
    }
  }, [onEmergencyUnlock]);

  const isLocked = remainingSeconds > 0;

  if (!isLocked) {
    return null;
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 pointer-events-none bg-[#1a0505]"
        aria-hidden="true"
      />

      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="lockout-title"
        aria-describedby="lockout-description"
      >
        <div
          className="w-full max-w-lg border-2 border-[var(--loss-red)] bg-bloomberg-secondary animate-pulse-border motion-safe:animate-pulse-border motion-reduce:animate-none"
          style={{
            boxShadow: "0 0 60px rgba(220, 38, 38, 0.3)",
          }}
        >
          <div className="h-2 w-full bg-[var(--loss-red)]" />

          <div className="flex flex-col items-center p-8 text-center">
            <div className="mb-6 flex h-20 w-20 items-center justify-center bg-[#1a0505] motion-safe:animate-pulse motion-reduce:animate-none">
              <svg
                className="h-10 w-10 text-loss"
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
            </div>

            <h2
              id="lockout-title"
              className="text-2xl font-bold uppercase tracking-wider text-loss"
            >
              Vault Locked
            </h2>

            <p
              id="lockout-description"
              className="sr-only"
            >
              Your vault is locked. Trading is disabled until the countdown ends.
            </p>

            <div className="mt-8">
              <div
                className="font-mono text-6xl font-bold tabular-nums text-bloomberg-value"
                aria-live="polite"
                aria-atomic="true"
              >
                {formatTime(remainingSeconds)}
              </div>
              <p className="mt-2 text-sm text-bloomberg-label">until unlock</p>
            </div>

            {estimatedSavings !== undefined && estimatedSavings > 0 && (
              <div className="mt-8 w-full border border-[var(--profit-green)] bg-[#0a2a12] p-4">
                <p className="text-sm text-[var(--text-secondary)]">
                  You saved an estimated
                </p>
                <p className="mt-1 text-3xl font-bold text-profit">
                  {formatCurrency(estimatedSavings)}
                </p>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  by not trading right now
                </p>
              </div>
            )}

            {onEmergencyUnlock && (
              <div className="mt-8 w-full">
                <button
                  type="button"
                  onClick={() => setIsEmergencyExpanded(!isEmergencyExpanded)}
                  className="flex w-full items-center justify-center gap-2 text-sm text-bloomberg-label transition hover:text-[var(--text-secondary)]"
                  aria-expanded={isEmergencyExpanded}
                  aria-controls="emergency-unlock-section"
                >
                  Emergency Unlock
                  <svg
                    className={`h-4 w-4 transition-transform ${
                      isEmergencyExpanded ? "rotate-180" : ""
                    }`}
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
                </button>

                <div
                  id="emergency-unlock-section"
                  className={`overflow-hidden transition-all duration-300 ${
                    isEmergencyExpanded
                      ? "mt-4 max-h-40 opacity-100"
                      : "max-h-0 opacity-0"
                  }`}
                >
                  <div className="border border-[var(--accent-orange)] bg-bloomberg-tertiary p-4">
                    <p className="text-sm text-accent">
                      Emergency unlock will add a 10% penalty to lockout duration
                    </p>
                    <button
                      type="button"
                      onClick={handleEmergencyUnlock}
                      className="mt-3 border border-bloomberg bg-bloomberg-secondary px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition hover:border-bloomberg hover:text-[var(--text-primary)]"
                    >
                      Unlock Now
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
