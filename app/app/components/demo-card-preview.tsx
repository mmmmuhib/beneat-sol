"use client";

import { TraderCard } from "./trader-card";
import type { TraderStats, Tier } from "../lib/mock-analysis";

interface DemoCardPreviewProps {
  stats: TraderStats;
  overallRating: number;
  tier: Tier;
  estimatedPreventableLoss: number;
}

export function DemoCardPreview({
  stats,
  overallRating,
  tier,
  estimatedPreventableLoss,
}: DemoCardPreviewProps) {
  return (
    <div className="relative w-full max-w-sm">
      <div className="blur-[3px] opacity-60">
        <TraderCard
          walletAddress="DemoWa11et...s111"
          stats={stats}
          overallRating={overallRating}
          tier={tier}
          estimatedPreventableLoss={estimatedPreventableLoss}
        />
      </div>
      <div className="absolute inset-0 z-10 flex items-center justify-center">
        <div className="mx-4 w-full max-w-xs rounded-2xl border border-border bg-card p-6 text-center shadow-2xl">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <svg
              className="h-6 w-6 text-primary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"
              />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-foreground">
            See Your Real Stats
          </h3>
          <p className="mt-1.5 text-sm text-text-secondary">
            Connect your wallet to get your personalized trader card
          </p>
          <p className="mt-4 text-xs text-text-muted">
            Use the Connect button in the navigation bar
          </p>
        </div>
      </div>
    </div>
  );
}
