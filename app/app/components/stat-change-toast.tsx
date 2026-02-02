"use client";

import { useEffect, useState } from "react";
import { useGamificationStore } from "../stores/gamification-store";

const STAT_LABELS: Record<string, string> = {
  discipline: "Discipline",
  patience: "Patience",
  consistency: "Consistency",
  timing: "Timing",
  riskControl: "Risk Control",
  endurance: "Endurance",
};

export function StatChangeToast() {
  const { lastStatChange, setLastStatChange } = useGamificationStore();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!lastStatChange) return;
    setVisible(true);
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => setLastStatChange(null), 300);
    }, 3000);
    return () => clearTimeout(timer);
  }, [lastStatChange, setLastStatChange]);

  if (!lastStatChange) return null;

  const isPositive = lastStatChange.delta > 0;
  const label = STAT_LABELS[lastStatChange.stat] || lastStatChange.stat;

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 rounded-xl border px-4 py-3 shadow-lg transition-all duration-300 ${
        visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
      } ${
        isPositive
          ? "border-green-500/30 bg-green-500/10 text-green-400"
          : "border-red-500/30 bg-red-500/10 text-red-400"
      }`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2">
        <span className="text-lg font-bold">
          {isPositive ? "+" : ""}
          {lastStatChange.delta}
        </span>
        <span className="text-sm font-medium">{label}</span>
      </div>
    </div>
  );
}
