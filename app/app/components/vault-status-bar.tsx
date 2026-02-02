"use client";

import { useMemo } from "react";
import { useVault } from "../hooks/use-vault";
import { useMagicBlock } from "../hooks/use-magicblock";
import { useLightProtocol } from "../hooks/use-light-protocol";

interface VaultStatusBarProps {
  className?: string;
}

export function VaultStatusBar({ className = "" }: VaultStatusBarProps) {
  const {
    vault,
    isLocked,
    tradesToday,
    maxTradesPerDay,
    dailyLossLimit,
    balance,
  } = useVault();

  const { isSessionActive, delegationStatus } = useMagicBlock();
  const { zkStatus } = useLightProtocol();

  const balanceInSol = useMemo(() => {
    return Number(balance) / 1e9;
  }, [balance]);

  const dailyLimitInSol = useMemo(() => {
    return Number(dailyLossLimit) / 1e9;
  }, [dailyLossLimit]);

  if (!vault) {
    return (
      <div className={`border-bottom bg-bloomberg-secondary px-4 py-2 ${className}`}>
        <div className="flex items-center justify-center gap-2 text-bloomberg-label">
          <span>NO VAULT FOUND</span>
          <span className="text-accent">CREATE ONE TO START TRADING</span>
        </div>
      </div>
    );
  }

  const statusText = isLocked ? "LOCKED" : "TRADING ACTIVE";

  return (
    <div className={`border-bottom bg-bloomberg-secondary px-4 py-2 ${className}`}>
      <div className="flex items-center gap-6 text-bloomberg-label">
        <span className={isLocked ? "text-loss" : "text-accent"}>{statusText}</span>

        <span>VAULT:</span>
        <span className="text-bloomberg-value">{balanceInSol.toFixed(4)} SOL</span>

        <span className="mx-2">|</span>

        <span>TRADES:</span>
        <span className="text-bloomberg-value">{tradesToday}/{maxTradesPerDay || "∞"}</span>

        <span className="mx-2">|</span>

        <span>DAILY LIMIT:</span>
        <span className="text-bloomberg-value">{dailyLimitInSol.toFixed(2)} SOL</span>

        <span className="mx-2">|</span>

        {zkStatus.pendingSettlements > 0 && (
          <>
            <span className="text-yellow-400">[{zkStatus.pendingSettlements} PENDING]</span>
            <span className="mx-2">|</span>
          </>
        )}

        <span className={zkStatus.isPrivate ? "text-accent" : "text-muted"}>
          {zkStatus.isPrivate ? "[SETTLEMENT PRIVATE]" : "[PUBLIC]"}
        </span>
      </div>
    </div>
  );
}
