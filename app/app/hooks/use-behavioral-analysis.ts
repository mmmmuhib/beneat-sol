"use client";

import { useMemo, useState, useEffect } from "react";
import { useVault } from "./use-vault";
import { useBehavioralStore } from "../stores/behavioral-store";
import { useTradingHistory } from "./use-trading-history";
import type { PatternType } from "../lib/analysis";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface BehavioralState {
  riskLevel: RiskLevel;
  riskScore: number;
  activePatterns: PatternType[];
  primaryPattern: PatternType | null;
  patternDescription: string;
  suggestedCooldown: number;
  canProceed: boolean;
  cooldownRemaining: number;
  isOverridden: boolean;
  emotionScore: number;
  disciplineScore: number;
  patienceScore: number;
}

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const BAD_HOURS_START = 23;
const BAD_HOURS_END = 5;

const PATTERN_DESCRIPTIONS: Record<PatternType, string> = {
  revenge_trading: "Revenge trading pattern detected",
  overtrading: "Approaching daily trade limit",
  losing_streak: "Recent losing streak",
  bad_hours: "Trading during risky hours",
  tilt_sizing: "Position sizing concerns",
};

const PATTERN_WEIGHTS: Record<PatternType, number> = {
  revenge_trading: 40,
  overtrading: 25,
  bad_hours: 20,
  losing_streak: 15,
  tilt_sizing: 15,
};

const COOLDOWN_SUGGESTIONS: Record<RiskLevel, number> = {
  low: 0,
  medium: 60,
  high: 180,
  critical: 300,
};

function isBadHour(hour: number): boolean {
  return hour >= BAD_HOURS_START || hour < BAD_HOURS_END;
}

function getRiskLevel(score: number): RiskLevel {
  if (score >= 81) return "critical";
  if (score >= 61) return "high";
  if (score >= 31) return "medium";
  return "low";
}

export function useBehavioralAnalysis(walletAddress?: string | null): BehavioralState {
  const {
    vault,
    tradesToday,
    maxTradesPerDay,
    isInCooldown: vaultCooldown,
    cooldownRemaining: vaultCooldownRemaining,
  } = useVault();

  const behavioralStore = useBehavioralStore();
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  const {
    tradesInLastHour: heliusTradesInHour,
    timeSinceLastTrade: heliusTimeSinceLastTrade,
  } = useTradingHistory(walletAddress ?? null);

  const userCooldownRemaining = behavioralStore.getCooldownRemaining();
  const recentOverrides = behavioralStore.getOverrideCount(3600);

  useEffect(() => {
    const needsTimer = vaultCooldown || userCooldownRemaining > 0;
    if (!needsTimer) return;

    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, [vaultCooldown, userCooldownRemaining]);

  const behavioralState = useMemo((): BehavioralState => {
    const activePatterns: PatternType[] = [];
    let totalScore = 0;

    if (!vault) {
      return {
        riskLevel: "low",
        riskScore: 0,
        activePatterns: [],
        primaryPattern: null,
        patternDescription: "",
        suggestedCooldown: 0,
        canProceed: true,
        cooldownRemaining: 0,
        isOverridden: false,
        emotionScore: 100,
        disciplineScore: 100,
        patienceScore: 100,
      };
    }

    const lastTradeTime = Number(vault.lastTradeTime) * 1000;
    const timeSinceLastTrade = currentTime - lastTradeTime;
    const isRecentLoss = vault.lastTradeWasLoss && timeSinceLastTrade < FIVE_MINUTES_MS;

    if (isRecentLoss) {
      activePatterns.push("revenge_trading");
      const recentnessMultiplier = 1 - timeSinceLastTrade / FIVE_MINUTES_MS;
      totalScore += PATTERN_WEIGHTS.revenge_trading * (0.5 + 0.5 * recentnessMultiplier);
    }

    if (maxTradesPerDay > 0) {
      const tradeRatio = tradesToday / maxTradesPerDay;
      if (tradeRatio >= 0.8) {
        activePatterns.push("overtrading");
        const severityMultiplier = Math.min(1, (tradeRatio - 0.8) / 0.2);
        totalScore += PATTERN_WEIGHTS.overtrading * (0.5 + 0.5 * severityMultiplier);
      }
    }

    const effectiveTradesInHour = heliusTradesInHour ?? 0;
    if (effectiveTradesInHour >= 6 && !activePatterns.includes("overtrading")) {
      activePatterns.push("overtrading");
      const heliusSeverity = Math.min(1, (effectiveTradesInHour - 6) / 4);
      totalScore += PATTERN_WEIGHTS.overtrading * heliusSeverity;
    }

    if (heliusTimeSinceLastTrade !== null && heliusTimeSinceLastTrade < FIVE_MINUTES_MS) {
      if (vault?.lastTradeWasLoss && !activePatterns.includes("revenge_trading")) {
        activePatterns.push("revenge_trading");
        const recentnessMultiplier = 1 - heliusTimeSinceLastTrade / FIVE_MINUTES_MS;
        totalScore += PATTERN_WEIGHTS.revenge_trading * (0.5 + 0.5 * recentnessMultiplier);
      }
    }

    const currentHour = new Date(currentTime).getHours();
    if (isBadHour(currentHour)) {
      activePatterns.push("bad_hours");
      totalScore += PATTERN_WEIGHTS.bad_hours;
    }

    if (vault.lastTradeWasLoss && !isRecentLoss) {
      activePatterns.push("losing_streak");
      totalScore += PATTERN_WEIGHTS.losing_streak * 0.5;
    }

    if (recentOverrides >= 2) {
      totalScore += 15;
    } else if (recentOverrides >= 1) {
      totalScore += 8;
    }

    totalScore = Math.min(100, Math.max(0, totalScore));

    const riskLevel = getRiskLevel(totalScore);
    const primaryPattern = activePatterns.length > 0 ? activePatterns[0] : null;

    let patternDescription = "";
    if (primaryPattern) {
      patternDescription = PATTERN_DESCRIPTIONS[primaryPattern];
      if (activePatterns.length > 1) {
        patternDescription += ` (+${activePatterns.length - 1} more)`;
      }
    }

    const suggestedCooldown = COOLDOWN_SUGGESTIONS[riskLevel];

    const effectiveCooldownRemaining = Math.max(
      vaultCooldownRemaining,
      userCooldownRemaining
    );

    const canProceed =
      riskLevel !== "critical" || effectiveCooldownRemaining === 0;

    const tradeRatio = maxTradesPerDay > 0 ? tradesToday / maxTradesPerDay : 0;

    const emotionScore = Math.max(0, Math.min(100, Math.round(
      100 - (
        (isRecentLoss ? 40 : 0) +
        (vault.lastTradeWasLoss ? 20 : 0) +
        Math.min(recentOverrides * 15, 40)
      )
    )));

    const disciplineScore = Math.max(0, Math.min(100, Math.round(
      100 - (
        (tradeRatio >= 0.8 ? 30 + (tradeRatio - 0.8) * 100 : 0) +
        Math.min(recentOverrides * 20, 40) +
        (isBadHour(currentHour) ? 20 : 0)
      )
    )));

    const patienceScore = Math.max(0, Math.min(100, Math.round(
      100 - (
        Math.max(0, 50 - (timeSinceLastTrade / 60000)) +
        (userCooldownRemaining > 0 ? 0 : 20)
      )
    )));

    return {
      riskLevel,
      riskScore: Math.round(totalScore),
      activePatterns,
      primaryPattern,
      patternDescription,
      suggestedCooldown,
      canProceed,
      cooldownRemaining: effectiveCooldownRemaining,
      isOverridden: false,
      emotionScore,
      disciplineScore,
      patienceScore,
    };
  }, [
    vault,
    tradesToday,
    maxTradesPerDay,
    vaultCooldown,
    vaultCooldownRemaining,
    userCooldownRemaining,
    currentTime,
    recentOverrides,
    heliusTradesInHour,
    heliusTimeSinceLastTrade,
  ]);

  return behavioralState;
}
