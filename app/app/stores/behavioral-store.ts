"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface BehavioralStore {
  cooldownStartedAt: number | null;
  cooldownDuration: number;
  overrideTimestamps: number[];
  lastOverrideAt: number | null;

  startCooldown: (durationSeconds: number) => void;
  clearCooldown: () => void;
  recordOverride: () => void;
  getCooldownRemaining: () => number;
  isInUserCooldown: () => boolean;
  getOverrideCount: (withinSeconds?: number) => number;
}

export const useBehavioralStore = create<BehavioralStore>()(
  persist(
    (set, get) => ({
      cooldownStartedAt: null,
      cooldownDuration: 0,
      overrideTimestamps: [],
      lastOverrideAt: null,

      startCooldown: (durationSeconds: number) => {
        set({
          cooldownStartedAt: Date.now(),
          cooldownDuration: durationSeconds,
        });
      },

      clearCooldown: () => {
        set({
          cooldownStartedAt: null,
          cooldownDuration: 0,
        });
      },

      recordOverride: () => {
        const now = Date.now();
        const state = get();
        const recentOverrides = state.overrideTimestamps.filter(
          (ts) => now - ts < 24 * 60 * 60 * 1000
        );
        set({
          overrideTimestamps: [...recentOverrides, now],
          lastOverrideAt: now,
          cooldownStartedAt: null,
          cooldownDuration: 0,
        });
      },

      getCooldownRemaining: () => {
        const { cooldownStartedAt, cooldownDuration } = get();
        if (!cooldownStartedAt) return 0;

        const elapsed = (Date.now() - cooldownStartedAt) / 1000;
        const remaining = cooldownDuration - elapsed;
        return remaining > 0 ? Math.ceil(remaining) : 0;
      },

      isInUserCooldown: () => {
        return get().getCooldownRemaining() > 0;
      },

      getOverrideCount: (withinSeconds = 3600) => {
        const now = Date.now();
        const threshold = now - withinSeconds * 1000;
        return get().overrideTimestamps.filter((ts) => ts > threshold).length;
      },
    }),
    {
      name: "beneat-behavioral-state",
      partialize: (state) => ({
        cooldownStartedAt: state.cooldownStartedAt,
        cooldownDuration: state.cooldownDuration,
        overrideTimestamps: state.overrideTimestamps,
        lastOverrideAt: state.lastOverrideAt,
      }),
    }
  )
);
