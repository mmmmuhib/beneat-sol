"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SimulatorParams, MonteCarloFullResult } from "../components/simulator/simulation-logic";

export type OnboardingStep = "welcome" | "simulator" | "rules" | "confirmation";
export type RulePreset = "conservative" | "balanced" | "aggressive" | "custom";

export interface CustomRules {
  dailyLossLimit: number;
  maxTradesPerDay: number;
  lockoutDuration: number;
}

export interface MonteCarloStats {
  profitableCount: number;
  profitablePercent: number;
  medianReturn: number;
  worstCase: number;
  bestCase: number;
  avgMaxDrawdown: number;
}

export const RULE_PRESETS: Record<Exclude<RulePreset, "custom">, CustomRules> = {
  conservative: {
    dailyLossLimit: 0.5,
    maxTradesPerDay: 5,
    lockoutDuration: 48,
  },
  balanced: {
    dailyLossLimit: 2,
    maxTradesPerDay: 10,
    lockoutDuration: 24,
  },
  aggressive: {
    dailyLossLimit: 5,
    maxTradesPerDay: 20,
    lockoutDuration: 12,
  },
};

export const DEFAULT_SIMULATOR_PARAMS: SimulatorParams = {
  winRate: 30,
  riskReward: 3,
  positionSize: 2,
  startingBalance: 10000,
  numTrades: 100,
};

interface OnboardingState {
  currentStep: OnboardingStep;
  simulatorParams: SimulatorParams;
  explorationHistory: SimulatorParams[];
  lastSimulationStats: MonteCarloStats | null;
  selectedPreset: RulePreset | null;
  customRules: CustomRules;
  isReviewMode: boolean;
  transactionStatus: "idle" | "initializing" | "setting-rules" | "success" | "error";
  transactionError: string | null;

  setStep: (step: OnboardingStep) => void;
  nextStep: () => void;
  prevStep: () => void;
  setSimulatorParams: (params: SimulatorParams) => void;
  recordExploration: (params: SimulatorParams) => void;
  setLastSimulationStats: (stats: MonteCarloStats) => void;
  setSelectedPreset: (preset: RulePreset) => void;
  setCustomRules: (rules: Partial<CustomRules>) => void;
  setReviewMode: (isReview: boolean) => void;
  setTransactionStatus: (status: OnboardingState["transactionStatus"], error?: string | null) => void;
  reset: () => void;
  getEffectiveRules: () => CustomRules;
}

const STEP_ORDER: OnboardingStep[] = ["welcome", "simulator", "rules", "confirmation"];

const initialState = {
  currentStep: "welcome" as OnboardingStep,
  simulatorParams: DEFAULT_SIMULATOR_PARAMS,
  explorationHistory: [] as SimulatorParams[],
  lastSimulationStats: null as MonteCarloStats | null,
  selectedPreset: null as RulePreset | null,
  customRules: RULE_PRESETS.balanced,
  isReviewMode: false,
  transactionStatus: "idle" as OnboardingState["transactionStatus"],
  transactionError: null as string | null,
};

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set, get) => ({
      ...initialState,

      setStep: (step) => set({ currentStep: step }),

      nextStep: () => {
        const state = get();
        const currentIndex = STEP_ORDER.indexOf(state.currentStep);
        if (currentIndex < STEP_ORDER.length - 1) {
          set({ currentStep: STEP_ORDER[currentIndex + 1] });
        }
      },

      prevStep: () => {
        const state = get();
        const currentIndex = STEP_ORDER.indexOf(state.currentStep);
        if (currentIndex > 0) {
          set({ currentStep: STEP_ORDER[currentIndex - 1] });
        }
      },

      setSimulatorParams: (params) => set({ simulatorParams: params }),

      recordExploration: (params) => {
        const state = get();
        const history = [...state.explorationHistory, params];
        if (history.length > 20) {
          history.shift();
        }
        set({ explorationHistory: history });
      },

      setLastSimulationStats: (stats) => set({ lastSimulationStats: stats }),

      setSelectedPreset: (preset) => {
        if (preset === "custom") {
          set({ selectedPreset: preset });
        } else {
          set({
            selectedPreset: preset,
            customRules: RULE_PRESETS[preset],
          });
        }
      },

      setCustomRules: (rules) => {
        const state = get();
        set({
          customRules: { ...state.customRules, ...rules },
          selectedPreset: "custom",
        });
      },

      setReviewMode: (isReview) => {
        set({ isReviewMode: isReview });
        if (isReview) {
          set({ currentStep: "simulator" });
        }
      },

      setTransactionStatus: (status, error = null) =>
        set({ transactionStatus: status, transactionError: error }),

      reset: () => set(initialState),

      getEffectiveRules: () => {
        const state = get();
        if (state.selectedPreset && state.selectedPreset !== "custom") {
          return RULE_PRESETS[state.selectedPreset];
        }
        return state.customRules;
      },
    }),
    {
      name: "beneat-onboarding-state",
      partialize: (state) => ({
        currentStep: state.currentStep,
        simulatorParams: state.simulatorParams,
        explorationHistory: state.explorationHistory,
        lastSimulationStats: state.lastSimulationStats,
        selectedPreset: state.selectedPreset,
        customRules: state.customRules,
        isReviewMode: state.isReviewMode,
      }),
    }
  )
);

export function deriveRulesFromSimulation(
  params: SimulatorParams,
  stats: MonteCarloStats
): { rules: CustomRules; explanations: string[] } {
  const typicalVaultSize = 10;
  const riskPerTrade = typicalVaultSize * (params.positionSize / 100);
  const dailyLossLimit = Math.max(0.5, Math.min(5, riskPerTrade * 3));

  const maxTradesPerDay = Math.min(Math.max(5, Math.ceil(params.numTrades / 10)), 20);

  let lockoutDuration = 24;
  if (stats.avgMaxDrawdown > 30 || stats.profitablePercent < 40) {
    lockoutDuration = 48;
  } else if (stats.avgMaxDrawdown < 15 && stats.profitablePercent > 60) {
    lockoutDuration = 12;
  }

  const explanations: string[] = [];

  explanations.push(
    `Daily loss limit of ${dailyLossLimit.toFixed(1)} SOL allows surviving ~3 consecutive losses at your position size.`
  );

  explanations.push(
    `${maxTradesPerDay} trades/day is scaled from your simulation's ${params.numTrades} trades over ~10 trading days.`
  );

  if (lockoutDuration === 48) {
    explanations.push(
      `48h lockout recommended due to ${stats.avgMaxDrawdown.toFixed(0)}% avg drawdown or ${stats.profitablePercent.toFixed(0)}% win rate.`
    );
  } else if (lockoutDuration === 12) {
    explanations.push(
      `12h lockout is suitable for your stable strategy (${stats.avgMaxDrawdown.toFixed(0)}% drawdown, ${stats.profitablePercent.toFixed(0)}% profitable).`
    );
  } else {
    explanations.push(
      `24h lockout provides standard recovery time for your risk profile.`
    );
  }

  return {
    rules: {
      dailyLossLimit: Math.round(dailyLossLimit * 100) / 100,
      maxTradesPerDay,
      lockoutDuration,
    },
    explanations,
  };
}
