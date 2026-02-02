"use client";

import { create } from "zustand";

export interface OnChainTraderProfile {
  authority: string;
  overallRating: number;
  discipline: number;
  patience: number;
  consistency: number;
  timing: number;
  riskControl: number;
  endurance: number;
  totalTrades: number;
  totalWins: number;
  totalPnl: number;
  avgTradeSize: number;
  tradingDays: number;
  lastUpdated: number;
}

export interface LeaderboardEntry {
  authority: string;
  overallRating: number;
  totalTrades: number;
  totalPnl: number;
}

interface GamificationStore {
  profile: OnChainTraderProfile | null;
  isProfileDelegated: boolean;
  leaderboard: LeaderboardEntry[];
  lastStatChange: { stat: string; delta: number } | null;

  setProfile: (profile: OnChainTraderProfile | null) => void;
  setProfileDelegated: (delegated: boolean) => void;
  setLeaderboard: (entries: LeaderboardEntry[]) => void;
  setLastStatChange: (change: { stat: string; delta: number } | null) => void;
  clearProfile: () => void;
}

export const useGamificationStore = create<GamificationStore>((set) => ({
  profile: null,
  isProfileDelegated: false,
  leaderboard: [],
  lastStatChange: null,

  setProfile: (profile) => set({ profile }),
  setProfileDelegated: (delegated) => set({ isProfileDelegated: delegated }),
  setLeaderboard: (entries) => set({ leaderboard: entries }),
  setLastStatChange: (change) => set({ lastStatChange: change }),
  clearProfile: () =>
    set({ profile: null, isProfileDelegated: false, lastStatChange: null }),
}));
