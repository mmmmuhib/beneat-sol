"use client";

import { useState } from "react";
import { useMagicBlock } from "../hooks/use-magicblock";
import { useLightProtocol } from "../hooks/use-light-protocol";
import { useVault } from "../hooks/use-vault";

interface PrivacyIndicatorProps {
  className?: string;
}

export function PrivacyIndicator({ className = "" }: PrivacyIndicatorProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const {
    isSessionActive,
    delegationStatus,
    delegatedAccount,
    isPrivacyModeEnabled,
    enablePrivacyMode,
    disablePrivacyMode,
    delegateVaultToER,
    commitAndUndelegate,
    createSession,
    endSession,
  } = useMagicBlock();

  const {
    zkStatus,
    enablePrivateMode,
    disablePrivateMode,
  } = useLightProtocol();

  const { vaultAddress } = useVault();

  const isSettlementPrivate = zkStatus.isPrivate;
  const hasPendingSettlement = zkStatus.pendingSettlements > 0;
  const hasIntentPrivacy = isSessionActive && delegationStatus === "delegated";
  const isFullyPrivate = isSettlementPrivate && hasIntentPrivacy;

  const handleToggleER = async () => {
    if (delegationStatus === "delegated") {
      await commitAndUndelegate();
    } else if (isSessionActive && vaultAddress) {
      await delegateVaultToER(vaultAddress);
    } else if (vaultAddress) {
      const success = await createSession(vaultAddress);
      if (success) {
        await delegateVaultToER(vaultAddress);
      }
    }
  };

  const handleToggleZK = () => {
    if (zkStatus.isPrivate) {
      disablePrivateMode();
    } else {
      enablePrivateMode();
    }
  };

  const handleToggleSession = async () => {
    if (isSessionActive) {
      if (delegationStatus === "delegated") {
        await commitAndUndelegate();
      }
      await endSession();
      disablePrivacyMode();
    } else if (vaultAddress) {
      await createSession(vaultAddress);
      enablePrivacyMode();
    }
  };

  return (
    <div className={`fixed bottom-4 right-4 z-50 ${className}`}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`flex items-center gap-2 px-4 py-2 transition ${
          isFullyPrivate
            ? "border-bloomberg bg-bloomberg-secondary text-accent"
            : hasPendingSettlement
              ? "border border-yellow-500/50 bg-yellow-500/10 text-yellow-400"
              : isSettlementPrivate || hasIntentPrivacy
                ? "border-bloomberg bg-bloomberg-secondary text-accent"
                : "border-bloomberg bg-bloomberg-primary text-[var(--text-primary)]"
        }`}
      >
        <svg
          className={`h-4 w-4 ${isFullyPrivate || isSettlementPrivate ? "animate-glow-pulse" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          {isSettlementPrivate ? (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
            />
          ) : (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m0-10.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.57-.598-3.75h-.152c-3.196 0-6.1-1.249-8.25-3.286zm0 13.036h.008v.008H12v-.008z"
            />
          )}
        </svg>
        <span className="text-[10px] uppercase tracking-wider font-medium">
          {hasPendingSettlement
            ? "PENDING"
            : isFullyPrivate
              ? "SETTLEMENT PRIVATE"
              : isSettlementPrivate
                ? "P&L PRIVATE"
                : "PRIVACY"}
        </span>
        <svg
          className={`h-3 w-3 transition ${isExpanded ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4.5 15.75l7.5-7.5 7.5 7.5"
          />
        </svg>
      </button>

      {isExpanded && (
        <div className="absolute bottom-full right-0 mb-2 w-72 border-bloomberg bg-bloomberg-secondary">
          <div className="relative border-b border-[var(--border-color)] px-4 py-3">
            <h4 className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
              PRIVACY CONTROLS
            </h4>
          </div>

          <div className="space-y-2 p-3">
            <div className="border-bloomberg p-3 bg-bloomberg-tertiary">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      isSessionActive ? "bg-blue-400 animate-glow-pulse" : "bg-[var(--text-muted)]"
                    }`}
                  />
                  <span className="text-[10px] uppercase tracking-wider font-medium text-[var(--text-primary)]">
                    MAGICBLOCK SESSION
                  </span>
                </div>
                <button
                  onClick={handleToggleSession}
                  className={`px-2 py-1 text-[10px] uppercase tracking-wider font-medium transition ${
                    isSessionActive
                      ? "border-bloomberg bg-bloomberg-tertiary text-accent"
                      : "border-bloomberg bg-bloomberg-primary text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {isSessionActive ? "END" : "START"}
                </button>
              </div>
              <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                TEE-SECURED EPHEMERAL SESSION
              </p>
            </div>

            <div className="border-bloomberg p-3 bg-bloomberg-tertiary">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      delegationStatus === "delegated"
                        ? "bg-purple-400 animate-glow-pulse"
                        : "bg-[var(--text-muted)]"
                    }`}
                  />
                  <span className="text-[10px] uppercase tracking-wider font-medium text-[var(--text-primary)]">
                    EPHEMERAL ROLLUP
                  </span>
                </div>
                <button
                  onClick={handleToggleER}
                  disabled={!vaultAddress || delegationStatus === "delegating" || delegationStatus === "committing"}
                  className={`px-2 py-1 text-[10px] uppercase tracking-wider font-medium transition ${
                    delegationStatus === "delegated"
                      ? "border-bloomberg bg-bloomberg-tertiary text-accent"
                      : "border-bloomberg bg-bloomberg-primary text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-50"
                  }`}
                >
                  {delegationStatus === "delegating"
                    ? "..."
                    : delegationStatus === "committing"
                      ? "..."
                      : delegationStatus === "delegated"
                        ? "COMMIT"
                        : "DELEGATE"}
                </button>
              </div>
              <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                {delegatedAccount
                  ? "VAULT DELEGATED TO ER"
                  : "DELEGATE VAULT FOR PRIVATE TRADING"}
              </p>
            </div>

            <div className="border-bloomberg p-3 bg-bloomberg-tertiary">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      zkStatus.isPrivate ? "bg-emerald-400 animate-glow-pulse" : "bg-[var(--text-muted)]"
                    }`}
                  />
                  <span className="text-[10px] uppercase tracking-wider font-medium text-[var(--text-primary)]">
                    ZK P&L
                  </span>
                </div>
                <button
                  onClick={handleToggleZK}
                  className={`px-2 py-1 text-[10px] uppercase tracking-wider font-medium transition ${
                    zkStatus.isPrivate
                      ? "border-bloomberg bg-bloomberg-tertiary text-accent"
                      : "border-bloomberg bg-bloomberg-primary text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {zkStatus.isPrivate ? "DISABLE" : "ENABLE"}
                </button>
              </div>
              <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                LIGHT PROTOCOL ZK COMPRESSED SETTLEMENT
              </p>
              {zkStatus.pendingSettlements > 0 && (
                <p className="mt-1 text-[10px] uppercase tracking-wider text-yellow-400">
                  {zkStatus.pendingSettlements} PENDING SETTLEMENT(S)
                </p>
              )}
            </div>
          </div>

          <div className="border-t border-[var(--border-color)] p-3">
            <div className={`p-2 text-center ${
              hasPendingSettlement
                ? "border border-yellow-500/30 bg-yellow-500/5"
                : isSettlementPrivate
                  ? "border border-emerald-500/30 bg-emerald-500/5"
                  : "border-bloomberg bg-bloomberg-tertiary"
            }`}>
              <p className="text-[10px] uppercase tracking-wider">
                {hasPendingSettlement ? (
                  <span className="text-yellow-400">FUNDS AWAITING COMPRESSION</span>
                ) : isFullyPrivate ? (
                  <span className="text-emerald-400">INTENT + SETTLEMENT PRIVACY ACTIVE</span>
                ) : isSettlementPrivate ? (
                  <span className="text-emerald-400">P&L SETTLEMENT COMPRESSED — TRADES VISIBLE ON L1</span>
                ) : (
                  <span className="text-[var(--text-muted)]">ENABLE ZK P&L TO COMPRESS SETTLEMENT</span>
                )}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
