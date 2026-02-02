"use client";

import { useState } from "react";
import { useMagicBlock } from "../hooks/use-magicblock";

interface GhostModeToggleProps {
  className?: string;
  compact?: boolean;
}

export function GhostModeToggle({ className = "", compact = false }: GhostModeToggleProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const {
    isPrivacyModeEnabled,
    enablePrivacyMode,
    disablePrivacyMode,
    isSessionActive,
  } = useMagicBlock();

  const canGhost = isSessionActive;

  const handleToggle = () => {
    if (!canGhost) return;
    if (isPrivacyModeEnabled) {
      disablePrivacyMode();
    } else {
      enablePrivacyMode();
    }
  };

  const getTooltipText = () => {
    if (!canGhost && !isPrivacyModeEnabled) {
      return "Start a MagicBlock session to enable Ghost mode";
    }
    return "SL/TP orders route through MagicBlock for mempool privacy";
  };

  const icon = (
    <svg
      className={`h-4 w-4 transition ${
        isPrivacyModeEnabled ? "text-accent animate-glow-pulse" : "text-bloomberg-label"
      }`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
      />
    </svg>
  );

  if (compact) {
    return (
      <div className={`relative ${className}`}>
        <button
          onClick={handleToggle}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          disabled={!canGhost}
          className={`flex items-center gap-2 px-3 py-2 transition ${
            isPrivacyModeEnabled
              ? "border-focus-bloomberg bg-bloomberg-tertiary"
              : "border-bloomberg bg-bloomberg-primary"
          } ${!canGhost ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        >
          {icon}
          <span className="text-[10px] uppercase tracking-wider font-medium text-bloomberg-label">
            GHOST
          </span>
          <div
            className={`relative h-4 w-8 rounded-full transition ${
              isPrivacyModeEnabled
                ? "bg-[var(--accent-orange)]"
                : "bg-[var(--border-color)]"
            }`}
          >
            <div
              className={`absolute top-0.5 h-3 w-3 rounded-full transition-all ${
                isPrivacyModeEnabled
                  ? "right-0.5 bg-bloomberg-primary"
                  : "left-0.5 bg-[var(--text-muted)]"
              }`}
            />
          </div>
          <span
            className={`text-[10px] uppercase tracking-wider font-bold ${
              isPrivacyModeEnabled ? "text-accent" : "text-bloomberg-label"
            }`}
          >
            {isPrivacyModeEnabled ? "ACTIVE" : "INACTIVE"}
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
        disabled={!canGhost}
        className={`flex items-center gap-3 px-4 py-3 transition w-full ${
          isPrivacyModeEnabled
            ? "border-focus-bloomberg bg-bloomberg-tertiary bg-bloomberg-secondary"
            : "border-bloomberg bg-bloomberg-secondary"
        } ${!canGhost ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
      >
        {icon}

        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] uppercase tracking-wider font-medium text-bloomberg-label">
              GHOST MODE
            </span>
            <span
              className={`text-[10px] uppercase tracking-wider font-bold ${
                isPrivacyModeEnabled ? "text-accent" : "text-bloomberg-label"
              }`}
            >
              {isPrivacyModeEnabled ? "ACTIVE" : "INACTIVE"}
            </span>
          </div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
            SL/TP uses mempool privacy
          </p>
        </div>

        <div
          className={`relative h-6 w-11 rounded-full transition ${
            isPrivacyModeEnabled
              ? "bg-[var(--accent-orange)]"
              : "bg-[var(--border-color)]"
          }`}
        >
          <div
            className={`absolute top-0.5 h-5 w-5 rounded-full transition-all ${
              isPrivacyModeEnabled
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
