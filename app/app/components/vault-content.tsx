"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWalletConnection } from "@solana/react-hooks";
import { useVault } from "../hooks/use-vault";
import { useDevMode } from "../hooks/use-dev-mode";
import { useDemoMode } from "../hooks/use-demo-mode";
import { useLightProtocol } from "../hooks/use-light-protocol";
import { useMagicBlock } from "../hooks/use-magicblock";
import { useOnboardingStore } from "../stores/onboarding-store";
import { RuleConfig } from "./rule-config";
import { LockoutBanner } from "./lockout-banner";
import { EquityCurveSimulator } from "./simulator";
import type { CompressedBalance } from "../hooks/use-light-protocol";

const LAMPORTS_PER_SOL = 1_000_000_000n;
const SOL_PRICE_USD = 170;
const USDC_DEVNET_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const USDC_DECIMALS = 6;

function formatSol(lamports: bigint): string {
  return (Number(lamports) / Number(LAMPORTS_PER_SOL)).toFixed(4);
}

function formatUsd(lamports: bigint): string {
  const sol = Number(lamports) / Number(LAMPORTS_PER_SOL);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(sol * SOL_PRICE_USD);
}

function formatUsdc(amount: bigint, decimals: number = USDC_DECIMALS): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount) / Math.pow(10, decimals));
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const days = Math.floor(hours / 24);
  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  }
  return `${hours}h`;
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
      />
    </svg>
  );
}

function UnlockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"
      />
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
      />
    </svg>
  );
}

function EyeSlashIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"
      />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  );
}

function StatusBadge({
  isLocked,
  lockoutRemaining,
}: {
  isLocked: boolean;
  lockoutRemaining: number;
}) {
  if (isLocked) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-status-locked/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-status-locked">
        <LockIcon className="h-3.5 w-3.5" />
        Locked
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-status-safe/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-status-safe">
      <UnlockIcon className="h-3.5 w-3.5" />
      Active
    </span>
  );
}

function BalanceCard({ balance }: { balance: bigint }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
        Vault Balance
      </p>
      <p className="mt-3 text-4xl font-bold tabular-nums text-foreground">
        {formatSol(balance)}{" "}
        <span className="text-xl font-normal text-text-muted">SOL</span>
      </p>
      <p className="mt-1 text-lg text-text-secondary">{formatUsd(balance)}</p>
      <p className="mt-1 text-xs text-text-muted">(estimate)</p>
    </div>
  );
}

function DepositWithdrawCard({
  balance,
  onDeposit,
  onWithdraw,
  isSending,
  isLocked,
}: {
  balance: bigint;
  onDeposit: (amount: bigint) => Promise<string | null>;
  onWithdraw: (amount: bigint) => Promise<string | null>;
  isSending: boolean;
  isLocked: boolean;
}) {
  const [amount, setAmount] = useState("");
  const [txStatus, setTxStatus] = useState<string | null>(null);

  const handleDeposit = useCallback(async () => {
    if (!amount || parseFloat(amount) <= 0) return;

    setTxStatus("Building transaction...");
    const depositAmount = BigInt(
      Math.floor(parseFloat(amount) * Number(LAMPORTS_PER_SOL))
    );

    const signature = await onDeposit(depositAmount);
    if (signature) {
      setTxStatus(`Deposited! Tx: ${signature.slice(0, 16)}...`);
      setAmount("");
    } else {
      setTxStatus("Transaction failed. Please try again.");
    }
  }, [amount, onDeposit]);

  const handleWithdraw = useCallback(async () => {
    if (!amount || parseFloat(amount) <= 0) return;

    setTxStatus("Building transaction...");
    const withdrawAmount = BigInt(
      Math.floor(parseFloat(amount) * Number(LAMPORTS_PER_SOL))
    );

    if (withdrawAmount > balance) {
      setTxStatus("Error: Insufficient balance");
      return;
    }

    const signature = await onWithdraw(withdrawAmount);
    if (signature) {
      setTxStatus(`Withdrawn! Tx: ${signature.slice(0, 16)}...`);
      setAmount("");
    } else {
      setTxStatus("Transaction failed. Please try again.");
    }
  }, [amount, balance, onWithdraw]);

  const handleWithdrawAll = useCallback(async () => {
    if (balance === 0n) return;

    setTxStatus("Building transaction...");
    const signature = await onWithdraw(balance);
    if (signature) {
      setTxStatus(`Withdrawn all! Tx: ${signature.slice(0, 16)}...`);
      setAmount("");
    } else {
      setTxStatus("Transaction failed. Please try again.");
    }
  }, [balance, onWithdraw]);

  const parsedAmount = parseFloat(amount) || 0;
  const isValidDeposit = parsedAmount > 0;
  const isValidWithdraw =
    parsedAmount > 0 &&
    BigInt(Math.floor(parsedAmount * Number(LAMPORTS_PER_SOL))) <= balance;

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h3 className="text-lg font-semibold text-foreground">
        Deposit / Withdraw
      </h3>
      <p className="mt-1 text-sm text-text-muted">
        Manage your vault balance
      </p>

      <div className="mt-6 space-y-4">
        <div>
          <label
            htmlFor="amount"
            className="block text-sm font-medium text-text-secondary"
          >
            Amount (SOL)
          </label>
          <input
            id="amount"
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={isSending || isLocked}
            className="mt-2 w-full rounded-lg border border-border bg-card px-4 py-3 text-lg font-medium tabular-nums text-foreground outline-none transition placeholder:text-text-muted focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleDeposit}
            disabled={isSending || !isValidDeposit}
            className="flex-1 rounded-lg bg-primary px-4 py-3 text-sm font-medium text-background transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSending ? "Confirming..." : "Deposit"}
          </button>
          <button
            onClick={handleWithdraw}
            disabled={isSending || !isValidWithdraw || isLocked}
            className="flex-1 rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium text-foreground transition hover:border-primary/50 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSending ? "Confirming..." : "Withdraw"}
          </button>
        </div>

        <button
          onClick={handleWithdrawAll}
          disabled={isSending || balance === 0n || isLocked}
          className="w-full rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-text-secondary transition hover:border-primary/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          Withdraw All ({formatSol(balance)} SOL)
        </button>

        {txStatus && (
          <div
            className={`rounded-lg border px-4 py-3 text-sm ${
              txStatus.startsWith("Error") || txStatus.includes("failed")
                ? "border-status-danger/30 bg-status-danger/10 text-status-danger"
                : txStatus.includes("Confirming") ||
                    txStatus.includes("Building")
                  ? "border-status-warning/30 bg-status-warning/10 text-status-warning"
                  : "border-primary/30 bg-primary/10 text-primary"
            }`}
          >
            {txStatus}
          </div>
        )}

        {isLocked && (
          <p className="text-center text-sm text-status-warning">
            Withdrawals are disabled during lockout
          </p>
        )}
      </div>
    </div>
  );
}

function ChartBarIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
      />
    </svg>
  );
}

function RulesCard({
  dailyLossLimit,
  maxTradesPerDay,
  lockoutDuration,
  onEditRules,
  onReviewWithSimulator,
}: {
  dailyLossLimit: bigint;
  maxTradesPerDay: number;
  lockoutDuration: number;
  onEditRules: () => void;
  onReviewWithSimulator: () => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Rules</h3>
          <p className="mt-1 text-sm text-text-muted">Your risk limits</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onReviewWithSimulator}
            className="rounded-lg p-2 text-text-secondary transition hover:bg-primary/10 hover:text-primary"
            aria-label="Review with simulator"
            title="Review with Simulator"
          >
            <ChartBarIcon className="h-5 w-5" />
          </button>
          <button
            onClick={onEditRules}
            className="rounded-lg p-2 text-text-secondary transition hover:bg-primary/10 hover:text-primary"
            aria-label="Edit rules"
            title="Quick Edit"
          >
            <SettingsIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        <div className="rounded-lg bg-background/30 p-3">
          <p className="text-xs text-text-muted">Daily Loss Limit</p>
          <p className="mt-1 font-mono text-lg font-semibold text-foreground">
            {formatSol(dailyLossLimit)} SOL
          </p>
        </div>

        <div className="rounded-lg bg-background/30 p-3">
          <p className="text-xs text-text-muted">Max Trades/Day</p>
          <p className="mt-1 font-mono text-lg font-semibold text-foreground">
            {maxTradesPerDay}
          </p>
        </div>

        <div className="rounded-lg bg-background/30 p-3">
          <p className="text-xs text-text-muted">Lockout Duration</p>
          <p className="mt-1 font-mono text-lg font-semibold text-foreground">
            {formatDuration(lockoutDuration)}
          </p>
        </div>
      </div>
    </div>
  );
}

function ShieldedBalanceCard({
  compressedBalance,
  isLoading,
}: {
  compressedBalance: CompressedBalance | null;
  isLoading: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
        Shielded Balance
      </p>
      {isLoading ? (
        <div className="mt-3 flex items-center gap-2">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-text-secondary">Loading...</p>
        </div>
      ) : compressedBalance ? (
        <>
          <p className="mt-3 text-4xl font-bold tabular-nums text-foreground">
            {formatUsdc(compressedBalance.amount, compressedBalance.decimals)}{" "}
            <span className="text-xl font-normal text-text-muted">zUSDC</span>
          </p>
          <div className="mt-3 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary">
              <ShieldIcon className="h-3.5 w-3.5" />
              Shielded
            </span>
            <span className="text-xs text-text-muted">PRIVATE</span>
          </div>
        </>
      ) : (
        <p className="mt-3 text-sm text-text-muted">No compressed balance</p>
      )}
    </div>
  );
}

function HiddenOrdersCard({ count }: { count: number }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
        Hidden Orders
      </p>
      <p className="mt-3 text-4xl font-bold tabular-nums text-foreground">
        {count}
      </p>
      <div className="mt-3 flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-status-safe/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-status-safe">
          <EyeSlashIcon className="h-3.5 w-3.5" />
          Active
        </span>
        <span className="text-xs text-text-muted">INVISIBLE TO CHAIN</span>
      </div>
    </div>
  );
}

function SessionStatsBar({
  tradesToday,
  maxTradesPerDay,
  totalDeposited,
  totalWithdrawn,
  lockoutCount,
  hiddenOrdersCount,
}: {
  tradesToday: number;
  maxTradesPerDay: number;
  totalDeposited: bigint;
  totalWithdrawn: bigint;
  lockoutCount: number;
  hiddenOrdersCount: number;
}) {
  const tradePercentage = maxTradesPerDay > 0
    ? Math.min(100, (tradesToday / maxTradesPerDay) * 100)
    : 0;

  const netPnl = totalDeposited - totalWithdrawn;
  const isProfitable = netPnl >= 0n;

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-text-muted">
        Session Stats
      </h3>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <div>
          <p className="text-xs text-text-muted">Trades Today</p>
          <p className="mt-1 font-mono text-lg font-semibold text-foreground">
            {tradesToday}/{maxTradesPerDay}
          </p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border">
            <div
              className={`h-full rounded-full transition-all ${
                tradePercentage >= 80
                  ? "bg-status-danger"
                  : tradePercentage >= 50
                    ? "bg-status-warning"
                    : "bg-primary"
              }`}
              style={{ width: `${tradePercentage}%` }}
            />
          </div>
        </div>

        <div>
          <p className="text-xs text-text-muted">Net P&L</p>
          <p
            className={`mt-1 font-mono text-lg font-semibold ${
              isProfitable ? "text-status-safe" : "text-status-danger"
            }`}
          >
            {isProfitable ? "+" : "-"}
            {formatSol(isProfitable ? netPnl : -netPnl)} SOL
          </p>
        </div>

        <div>
          <p className="text-xs text-text-muted">Total Deposited</p>
          <p className="mt-1 font-mono text-lg font-semibold text-foreground">
            {formatSol(totalDeposited)} SOL
          </p>
        </div>

        <div>
          <p className="text-xs text-text-muted">Lockout Count</p>
          <p className="mt-1 font-mono text-lg font-semibold text-foreground">
            {lockoutCount}
          </p>
        </div>

        <div>
          <p className="text-xs text-text-muted">Hidden Orders</p>
          <p className="mt-1 font-mono text-lg font-semibold text-foreground">
            {hiddenOrdersCount}
          </p>
        </div>
      </div>
    </div>
  );
}

function InitializeVaultCard({
  onInitialize,
  isSending,
  isDemoMode = false,
}: {
  onInitialize: (lockoutDuration: number) => Promise<string | null>;
  isSending: boolean;
  isDemoMode?: boolean;
}) {
  const [lockoutHours, setLockoutHours] = useState("24");
  const [status, setStatus] = useState<string | null>(null);

  const handleInitialize = useCallback(async () => {
    const hours = parseInt(lockoutHours) || 24;
    const seconds = hours * 3600;

    setStatus(isDemoMode ? "Simulating vault initialization..." : "Initializing vault...");
    const signature = await onInitialize(seconds);

    if (signature) {
      setStatus(isDemoMode ? "Demo vault initialized!" : "Vault initialized successfully!");
    } else {
      setStatus("Failed to initialize vault. Please try again.");
    }
  }, [lockoutHours, onInitialize, isDemoMode]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
          <svg
            className="h-10 w-10 text-primary"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
        </div>

        <h2 className="text-2xl font-bold text-foreground">
          {isDemoMode ? "Initialize Demo Vault" : "Initialize Your Vault"}
        </h2>
        <p className="mt-3 text-text-secondary">
          {isDemoMode
            ? "Create a demo vault to explore the risk enforcement features. No real transactions will be executed."
            : "Create your personal risk enforcement vault to protect your trading capital."}
        </p>

        {isDemoMode && (
          <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 px-4 py-2">
            <p className="text-xs text-primary">
              Demo Mode: Transactions are simulated
            </p>
          </div>
        )}

        <div className="mt-8 space-y-4">
          <div className="text-left">
            <label
              htmlFor="lockout-hours"
              className="block text-sm font-medium text-text-secondary"
            >
              Default Lockout Duration (hours)
            </label>
            <input
              id="lockout-hours"
              type="number"
              min="1"
              max="168"
              value={lockoutHours}
              onChange={(e) => setLockoutHours(e.target.value)}
              disabled={isSending}
              className="mt-2 w-full rounded-lg border border-border bg-card px-4 py-3 text-foreground outline-none transition placeholder:text-text-muted focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
            />
            <p className="mt-1 text-xs text-text-muted">
              How long trading will be locked when rules are breached
            </p>
          </div>

          <button
            onClick={handleInitialize}
            disabled={isSending}
            className="w-full rounded-lg bg-primary px-4 py-3 text-sm font-medium text-background transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSending ? "Initializing..." : isDemoMode ? "Initialize Demo Vault" : "Initialize Vault"}
          </button>

          {status && (
            <div
              className={`rounded-lg border px-4 py-3 text-sm ${
                status.includes("Failed") || status.includes("failed")
                  ? "border-status-danger/30 bg-status-danger/10 text-status-danger"
                  : status.includes("Initializing") || status.includes("Simulating")
                    ? "border-status-warning/30 bg-status-warning/10 text-status-warning"
                    : "border-primary/30 bg-primary/10 text-primary"
              }`}
            >
              {status}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ConnectWalletPrompt() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
          <svg
            className="h-10 w-10 text-primary"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3"
            />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-foreground">
          Connect Your Wallet
        </h2>
        <p className="mt-3 text-text-secondary">
          Connect your wallet to access your vault and manage your risk
          settings.
        </p>
        <p className="mt-6 text-sm text-text-muted">
          Use the Connect button in the navigation bar to get started.
        </p>
      </div>
    </div>
  );
}

function VaultDashboard() {
  const router = useRouter();
  const {
    vault,
    balance,
    isLoading,
    error,
    isLocked,
    lockoutRemaining,
    dailyLossLimit,
    maxTradesPerDay,
    tradesToday,
    totalDeposited,
    totalWithdrawn,
    lockoutCount,
    initializeVault,
    deposit,
    withdraw,
    unlock,
    isSending,
    isDemoInitialized,
  } = useVault();

  const { getCompressedBalance, isLoading: isLoadingLight } = useLightProtocol();
  const { ghostOrders } = useMagicBlock();
  const { reset: resetOnboarding, setCustomRules } = useOnboardingStore();
  const { isDemoMode } = useDemoMode();

  const [showRuleConfig, setShowRuleConfig] = useState(false);
  const [compressedBalance, setCompressedBalance] = useState<CompressedBalance | null>(null);
  const [isLoadingCompressed, setIsLoadingCompressed] = useState(false);
  const [shouldRedirectToOnboarding, setShouldRedirectToOnboarding] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchCompressedBalance() {
      if (!vault) return;

      setIsLoadingCompressed(true);
      try {
        const balance = await getCompressedBalance(USDC_DEVNET_MINT);
        if (!cancelled && balance) {
          setCompressedBalance(balance);
        }
      } catch (err) {
        console.error("[Vault] Failed to fetch compressed balance:", err);
      } finally {
        if (!cancelled) {
          setIsLoadingCompressed(false);
        }
      }
    }

    fetchCompressedBalance();

    return () => {
      cancelled = true;
    };
  }, [vault, getCompressedBalance]);

  const lockoutUntil = useMemo(() => {
    if (!vault) return 0;
    return Number(vault.lockoutUntil);
  }, [vault]);

  const lockoutDuration = vault?.lockoutDuration ?? 0;

  const activeGhostOrders = useMemo(() => {
    return ghostOrders.filter((o) => o.status === "active");
  }, [ghostOrders]);

  useEffect(() => {
    if (!isLoading && !vault && !error) {
      const onboardingState = localStorage.getItem("beneat-onboarding-state");
      const hasIncompleteWizard = onboardingState !== null;

      if (hasIncompleteWizard || !vault) {
        setShouldRedirectToOnboarding(true);
      }
    }
  }, [isLoading, vault, error]);

  useEffect(() => {
    if (shouldRedirectToOnboarding) {
      router.push("/vault/onboarding");
    }
  }, [shouldRedirectToOnboarding, router]);

  const handleReviewWithSimulator = useCallback(() => {
    if (vault) {
      resetOnboarding();
      setCustomRules({
        dailyLossLimit: Number(dailyLossLimit) / Number(LAMPORTS_PER_SOL),
        maxTradesPerDay,
        lockoutDuration: lockoutDuration / 3600,
      });
      router.push("/vault/onboarding?mode=review");
    }
  }, [vault, resetOnboarding, setCustomRules, dailyLossLimit, maxTradesPerDay, lockoutDuration, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="mt-4 text-text-secondary">Loading vault...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="max-w-md rounded-2xl border border-status-danger/30 bg-status-danger/10 p-6 text-center">
          <p className="font-semibold text-status-danger">Error</p>
          <p className="mt-2 text-sm text-status-danger">{error}</p>
        </div>
      </div>
    );
  }

  const hasVault = isDemoMode ? isDemoInitialized : !!vault;

  if (!hasVault) {
    return (
      <InitializeVaultCard
        onInitialize={initializeVault}
        isSending={isSending}
        isDemoMode={isDemoMode}
      />
    );
  }

  return (
    <>
      {isLocked && (
        <LockoutBanner lockoutUntil={lockoutUntil} onEmergencyUnlock={unlock} />
      )}

      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              Vault Management
            </h1>
            <p className="mt-1 text-text-secondary">
              Manage your capital and risk settings
            </p>
          </div>
          <StatusBadge isLocked={isLocked} lockoutRemaining={lockoutRemaining} />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <BalanceCard balance={balance} />

          <DepositWithdrawCard
            balance={balance}
            onDeposit={deposit}
            onWithdraw={withdraw}
            isSending={isSending}
            isLocked={isLocked}
          />

          <RulesCard
            dailyLossLimit={dailyLossLimit}
            maxTradesPerDay={maxTradesPerDay}
            lockoutDuration={lockoutDuration}
            onEditRules={() => setShowRuleConfig(!showRuleConfig)}
            onReviewWithSimulator={handleReviewWithSimulator}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <ShieldedBalanceCard
            compressedBalance={compressedBalance}
            isLoading={isLoadingCompressed || isLoadingLight}
          />

          <HiddenOrdersCard count={activeGhostOrders.length} />

          <div className="rounded-2xl border border-border bg-card p-6 opacity-50">
            <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
              Reserved
            </p>
            <p className="mt-3 text-sm text-text-muted">
              Additional privacy features coming soon
            </p>
          </div>
        </div>

        <SessionStatsBar
          tradesToday={tradesToday}
          maxTradesPerDay={maxTradesPerDay}
          totalDeposited={totalDeposited}
          totalWithdrawn={totalWithdrawn}
          lockoutCount={lockoutCount}
          hiddenOrdersCount={activeGhostOrders.length}
        />

        <div className="rounded-2xl border border-border bg-card p-6">
          <EquityCurveSimulator />
        </div>

        {showRuleConfig && (
          <div className="flex justify-center">
            <RuleConfig
              initialDailyLossLimit={
                Number(dailyLossLimit) / Number(LAMPORTS_PER_SOL)
              }
              initialMaxTrades={maxTradesPerDay}
              initialLockoutDuration={lockoutDuration / 3600}
              onSave={() => setShowRuleConfig(false)}
            />
          </div>
        )}
      </div>
    </>
  );
}

export function VaultContent() {
  const { status } = useWalletConnection();
  const { isDevMode } = useDevMode();
  const { isDemoMode } = useDemoMode();

  return (
    <div className="min-h-screen pt-20">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {status !== "connected" && !isDevMode && !isDemoMode ? (
          <ConnectWalletPrompt />
        ) : (
          <VaultDashboard />
        )}
      </div>
    </div>
  );
}
