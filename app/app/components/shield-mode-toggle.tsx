"use client";

import { useState } from "react";
import { useShield } from "../hooks/use-shield";

interface ShieldModeToggleProps {
  className?: string;
  compact?: boolean;
}

export function ShieldModeToggle({ className = "", compact = false }: ShieldModeToggleProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const { shieldMode, enableShieldMode, disableShieldMode, canShield, isShielding } = useShield();

  const handleToggle = () => {
    if (!canShield) return;
    if (shieldMode) {
      disableShieldMode();
    } else {
      enableShieldMode();
    }
  };

  const getTooltipText = () => {
    if (!canShield && !shieldMode) {
      return "Connect wallet and enable ZK privacy to use shield mode";
    }
    return "Trades execute privately via ZK compression. Your balance and order details are hidden until execution.";
  };

  if (compact) {
    return (
      <div className={`relative ${className}`}>
        <button
          onClick={handleToggle}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          disabled={!canShield || isShielding}
          className={`flex items-center gap-2 px-3 py-2 transition ${
            shieldMode
              ? "border-focus-bloomberg bg-bloomberg-tertiary"
              : "border-bloomberg bg-bloomberg-primary"
          } ${
            !canShield ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
          }`}
        >
          <svg
            className={`h-4 w-4 transition ${
              shieldMode ? "text-accent animate-glow-pulse" : "text-bloomberg-label"
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
            />
          </svg>
          <span className="text-[10px] uppercase tracking-wider font-medium text-bloomberg-label">
            SHIELD
          </span>
          <div
            className={`relative h-4 w-8 rounded-full transition ${
              shieldMode
                ? "bg-[var(--accent-orange)]"
                : "bg-[var(--border-color)]"
            }`}
          >
            <div
              className={`absolute top-0.5 h-3 w-3 rounded-full transition-all ${
                shieldMode
                  ? "right-0.5 bg-bloomberg-primary"
                  : "left-0.5 bg-[var(--text-muted)]"
              }`}
            />
          </div>
          <span
            className={`text-[10px] uppercase tracking-wider font-bold ${
              shieldMode ? "text-accent" : "text-bloomberg-label"
            }`}
          >
            {shieldMode ? "ACTIVE" : "INACTIVE"}
          </span>
        </button>

        {showTooltip && (
          <div className="absolute top-full left-0 z-50 mt-2 w-64 border-bloomberg bg-bloomberg-secondary p-3">
            <p className="text-[10px] uppercase tracking-wider text-bloomberg-label">
              {getTooltipText()}
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={handleToggle}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        disabled={!canShield || isShielding}
        className={`flex items-center gap-3 px-4 py-3 transition w-full ${
          shieldMode
            ? "border-focus-bloomberg bg-bloomberg-tertiary bg-bloomberg-secondary"
            : "border-bloomberg bg-bloomberg-secondary"
        } ${
          !canShield ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
        }`}
      >
        <svg
          className={`h-5 w-5 transition ${
            shieldMode ? "text-accent animate-glow-pulse" : "text-bloomberg-label"
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
          />
        </svg>

        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] uppercase tracking-wider font-medium text-bloomberg-label">
              SHIELD MODE
            </span>
            <span
              className={`text-[10px] uppercase tracking-wider font-bold ${
                shieldMode ? "text-accent" : "text-bloomberg-label"
              }`}
            >
              {shieldMode ? "ACTIVE" : "INACTIVE"}
            </span>
          </div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
            Trades execute privately via ZK
          </p>
        </div>

        <div
          className={`relative h-6 w-11 rounded-full transition ${
            shieldMode
              ? "bg-[var(--accent-orange)]"
              : "bg-[var(--border-color)]"
          }`}
        >
          <div
            className={`absolute top-0.5 h-5 w-5 rounded-full transition-all ${
              shieldMode
                ? "right-0.5 bg-bloomberg-primary"
                : "left-0.5 bg-[var(--text-muted)]"
            }`}
          />
        </div>
      </button>

      {showTooltip && (
        <div className="absolute top-full left-0 z-50 mt-2 w-full border-bloomberg bg-bloomberg-secondary p-3">
          <p className="text-[10px] uppercase tracking-wider text-bloomberg-label">
            {getTooltipText()}
          </p>
        </div>
      )}
    </div>
  );
}
