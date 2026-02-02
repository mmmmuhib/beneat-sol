"use client";

import { useWalletConnection } from "@solana/react-hooks";
import { TraderCard } from "./trader-card";
import {
  useTraderProfile,
  getTierFromRating,
} from "../hooks/use-trader-profile";
import { getMockAnalysis } from "../lib/mock-analysis";
import { useDevMode } from "../hooks/use-dev-mode";
import { useDemoMode } from "../hooks/use-demo-mode";

export function ProfileSkeleton() {
  return (
    <div
      className="w-full max-w-[280px] animate-pulse"
      style={{ aspectRatio: "27/40" }}
    >
      <div className="h-full rounded-xl border border-border bg-card p-4">
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between">
            <div className="flex flex-col gap-1">
              <div className="h-9 w-14 rounded bg-border" />
              <div className="h-2.5 w-8 rounded bg-border" />
              <div className="h-3 w-3 rounded bg-border" />
            </div>
            <div className="h-5 w-16 rounded-md bg-border" />
          </div>

          <div className="flex flex-1 flex-col items-center justify-center gap-3">
            <div className="h-[72px] w-[72px] rounded-full bg-border" />
            <div className="flex w-full items-center justify-center gap-1.5 border-y border-border py-1.5">
              <div className="h-3 w-3 rounded bg-border" />
              <div className="h-3 w-24 rounded bg-border" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-3">
            {[...Array(2)].map((_, col) => (
              <div key={col} className="flex flex-col gap-1">
                {[...Array(3)].map((_, row) => (
                  <div key={row} className="flex items-center justify-between px-1.5 py-0.5">
                    <div className="h-3.5 w-6 rounded bg-border" />
                    <div className="h-2.5 w-6 rounded bg-border" />
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div className="mt-2 flex items-center justify-center gap-1.5">
            <div className="h-3 w-24 rounded bg-border" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function InitializeProfilePrompt({
  onInitialize,
  isSending,
}: {
  onInitialize: () => void;
  isSending: boolean;
}) {
  return (
    <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center">
      <div className="flex flex-col items-center space-y-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <svg
            className="h-8 w-8 text-primary"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
            />
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-foreground">
            Create Your Trader Profile
          </h3>
          <p className="mt-1 text-sm text-text-secondary">
            Initialize your on-chain profile to track stats and earn your tier
          </p>
        </div>
        <button
          onClick={onInitialize}
          disabled={isSending}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-background transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
        >
          {isSending ? "Creating..." : "Create Profile"}
        </button>
      </div>
    </div>
  );
}

export function TraderCardConnected() {
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

  if (isLoading) {
    return <ProfileSkeleton />;
  }

  if (!walletAddress && !isDevMode && !isDemoMode) {
    return null;
  }

  if (error) {
    return (
      <div className="w-full max-w-sm rounded-2xl border border-status-danger/30 bg-status-danger/5 p-4 text-center">
        <p className="text-sm text-status-danger">{error}</p>
      </div>
    );
  }

  if (!hasProfile && !isDevMode && !isDemoMode) {
    return (
      <InitializeProfilePrompt
        onInitialize={initializeProfile}
        isSending={isSending}
      />
    );
  }

  const displayAddress = walletAddress ?? "Unknown";

  if (profile) {
    return (
      <TraderCard
        walletAddress={displayAddress}
        stats={{
          discipline: profile.discipline,
          patience: profile.patience,
          consistency: profile.consistency,
          timing: profile.timing,
          riskControl: profile.riskControl,
          endurance: profile.endurance,
        }}
        overallRating={profile.overallRating}
        tier={tier}
        estimatedPreventableLoss={Math.abs(profile.totalPnl)}
      />
    );
  }

  if (isDevMode || isDemoMode) {
    const mockAnalysis = getMockAnalysis(displayAddress);
    return (
      <TraderCard
        walletAddress={displayAddress}
        stats={mockAnalysis.stats}
        overallRating={mockAnalysis.overallRating}
        tier={mockAnalysis.tier}
        estimatedPreventableLoss={mockAnalysis.estimatedPreventableLoss}
      />
    );
  }

  return null;
}
