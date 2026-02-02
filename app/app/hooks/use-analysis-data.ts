"use client";

import { useMemo } from "react";
import { useWalletConnection } from "@solana/react-hooks";
import {
  useTraderProfile,
  getTierFromRating,
} from "./use-trader-profile";
import { useDevMode } from "./use-dev-mode";
import { useDemoMode } from "./use-demo-mode";
import {
  getMockAnalysis,
  type Pattern,
  type TraderStats,
  type Tier,
} from "../lib/mock-analysis";

const DEMO_WALLET = "DemoWa11etAddressForPreviewPurposes111";

export interface AnalysisData {
  stats: TraderStats;
  overallRating: number;
  tier: Tier;
  estimatedPreventableLoss: number;
  walletAddress: string;
  patterns: Pattern[];
  recommendedRules: {
    dailyLossLimit: number;
    maxTradesPerDay: number;
    lockoutDuration: number;
  };
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  hasProfile: boolean;
  initializeProfile: () => Promise<string | null>;
  isSending: boolean;
}

export function useAnalysisData(): AnalysisData {
  const { isDevMode } = useDevMode();
  const { isDemoMode } = useDemoMode();
  const { wallet } = useWalletConnection();
  const {
    profile,
    tier,
    isLoading,
    error,
    hasProfile,
    initializeProfile,
    isSending,
  } = useTraderProfile();

  const walletAddress = wallet?.account.address;
  const isConnected = !!walletAddress || isDevMode || isDemoMode;

  const mockAnalysis = useMemo(
    () => getMockAnalysis(walletAddress ?? DEMO_WALLET),
    [walletAddress]
  );

  const stats: TraderStats = useMemo(() => {
    if (profile) {
      return {
        discipline: profile.discipline,
        patience: profile.patience,
        consistency: profile.consistency,
        timing: profile.timing,
        riskControl: profile.riskControl,
        endurance: profile.endurance,
      };
    }
    return mockAnalysis.stats;
  }, [profile, mockAnalysis.stats]);

  const overallRating = profile?.overallRating ?? mockAnalysis.overallRating;
  const derivedTier = profile ? tier : mockAnalysis.tier;
  const estimatedPreventableLoss = profile
    ? Math.abs(profile.totalPnl)
    : mockAnalysis.estimatedPreventableLoss;

  return {
    stats,
    overallRating,
    tier: derivedTier,
    estimatedPreventableLoss,
    walletAddress: walletAddress ?? DEMO_WALLET,
    patterns: mockAnalysis.patterns,
    recommendedRules: mockAnalysis.recommendedRules,
    isConnected,
    isLoading,
    error,
    hasProfile,
    initializeProfile,
    isSending,
  };
}
