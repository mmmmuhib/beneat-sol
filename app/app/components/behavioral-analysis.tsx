"use client";

import { useState, useCallback, useEffect } from "react";
import type { BehavioralState, RiskLevel } from "../hooks/use-behavioral-analysis";
import { useBehavioralStore } from "../stores/behavioral-store";
import { EmotionalSpeedometer } from "./emotional-speedometer";

interface BehavioralAnalysisProps {
  state: BehavioralState;
  onOverride: () => void;
  onWait: () => void;
  className?: string;
}

const RISK_LEVEL_CONFIG: Record<
  RiskLevel,
  {
    label: string;
  }
> = {
  low: {
    label: "NORMAL",
  },
  medium: {
    label: "CAUTION",
  },
  high: {
    label: "ELEVATED",
  },
  critical: {
    label: "CRITICAL",
  },
};

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function BehavioralAnalysis({
  state,
  onOverride,
  onWait,
  className = "",
}: BehavioralAnalysisProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showOverrideConfirm, setShowOverrideConfirm] = useState(false);
  const config = RISK_LEVEL_CONFIG[state.riskLevel];

  const { startCooldown, recordOverride, getCooldownRemaining } = useBehavioralStore();
  const [cooldownRemaining, setCooldownRemaining] = useState(getCooldownRemaining());

  useEffect(() => {
    if (cooldownRemaining <= 0) return;

    const interval = setInterval(() => {
      const remaining = getCooldownRemaining();
      setCooldownRemaining(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [cooldownRemaining, getCooldownRemaining]);

  const handleWait = useCallback(() => {
    if (state.suggestedCooldown > 0) {
      startCooldown(state.suggestedCooldown);
      setCooldownRemaining(state.suggestedCooldown);
    }
    onWait();
  }, [state.suggestedCooldown, startCooldown, onWait]);

  const handleOverride = useCallback(() => {
    if (!showOverrideConfirm) {
      setShowOverrideConfirm(true);
      return;
    }
    recordOverride();
    setShowOverrideConfirm(false);
    onOverride();
  }, [showOverrideConfirm, recordOverride, onOverride]);

  const shouldAutoExpand = state.riskLevel !== "low";

  useEffect(() => {
    if (shouldAutoExpand) {
      setIsExpanded(true);
    }
  }, [shouldAutoExpand]);

  if (state.riskLevel === "low" && !isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className={`w-full border-bloomberg bg-bloomberg-secondary px-3 py-1.5 ${className}`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img 
              src="/brain.svg" 
              alt="" 
              className="w-3.5 h-3.5 opacity-40"
              aria-hidden="true"
            />
            <span className="text-bloomberg-label">
              BEHAVIORAL PSYCHOANALYSIS
            </span>
          </div>
          <span className={`text-bloomberg-label ${state.riskLevel === 'low' ? 'text-accent' : 'text-loss'}`}>
            ✓ {config.label}
          </span>
        </div>
      </button>
    );
  }

  const isCoolingDown = cooldownRemaining > 0;
  const showBlockingUI = state.riskLevel === "critical" || state.riskLevel === "high";
  const patternLabel = state.primaryPattern?.replace("_", " ").toUpperCase();

  return (
    <div
      className={`border-bloomberg bg-bloomberg-secondary p-4 ${className}`}
    >
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <img 
            src="/brain.svg" 
            alt="" 
            className="w-4 h-4 opacity-50"
            aria-hidden="true"
          />
          <span className="text-bloomberg-label">
            BEHAVIORAL PSYCHOANALYSIS
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-bloomberg-label ${state.riskLevel === 'low' ? 'text-accent' : 'text-loss'}`}>
            {config.label}
          </span>
          {isExpanded && (
            <svg
              className="w-3 h-3 text-muted"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-4 gap-4 justify-items-center pb-4">
            <EmotionalSpeedometer
              score={state.emotionScore}
              label="EMOTION"
              size={80}
              inverted={true}
            />
            <EmotionalSpeedometer
              score={state.disciplineScore}
              label="DISCIPLINE"
              size={80}
              inverted={true}
            />
            <EmotionalSpeedometer
              score={state.patienceScore}
              label="PATIENCE"
              size={80}
              inverted={true}
            />
            <EmotionalSpeedometer
              score={state.riskScore}
              label="RISK"
              size={80}
              inverted={false}
            />
          </div>

          {state.activePatterns.length > 0 && (
            <div className="border-t pt-4">
              <span className="text-bloomberg-label">DETECTED PATTERNS</span>
              <div className="mt-2 text-bloomberg-value text-muted">
                {state.activePatterns.map(pattern => pattern).join(' • ')}
              </div>
            </div>
          )}

          {isCoolingDown && (
            <div className="mt-4 pt-4 border-t">
              <div className="flex justify-between mb-2">
                <span className="text-bloomberg-label">COOLDOWN</span>
                <span className="text-bloomberg-value text-accent">
                  {formatTime(cooldownRemaining)}
                </span>
              </div>
              <div className="h-2 bg-bloomberg-tertiary">
                <div
                  className="h-full bg-accent"
                  style={{ width: `${(cooldownRemaining / state.suggestedCooldown) * 100}%` }}
                />
              </div>
            </div>
          )}

          {showBlockingUI && !isCoolingDown && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleWait}
                  className="border-bloomberg bg-bloomberg-tertiary py-2 text-bloomberg-label text-accent"
                >
                  WAIT {formatTime(state.suggestedCooldown)}
                </button>
                <button
                  onClick={handleOverride}
                  className={`border-bloomberg py-2 text-bloomberg-label ${
                    showOverrideConfirm
                      ? "border-loss text-loss"
                      : "border-bloomberg text-accent"
                  }`}
                >
                  {showOverrideConfirm ? "CONFIRM" : "OVERRIDE"}
                </button>
              </div>

              {showOverrideConfirm && (
                <p className="text-bloomberg-label text-loss text-center">
                  ⚠ Overriding may lead to impulsive trades
                </p>
              )}
            </div>
          )}

          {state.riskLevel === "medium" && !isCoolingDown && (
            <div className="flex items-center justify-center gap-2 py-1.5 text-accent">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              <span className="text-bloomberg-label">
                Consider a short break
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
