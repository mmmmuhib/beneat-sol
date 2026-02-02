"use client";

import { useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useWalletConnection } from "@solana/react-hooks";
import { useDevMode } from "../../hooks/use-dev-mode";
import { useDemoMode } from "../../hooks/use-demo-mode";
import { useOnboardingStore } from "../../stores/onboarding-store";
import { OnboardingWizard } from "../../components/onboarding";

function OnboardingContent() {
  const searchParams = useSearchParams();
  const { status } = useWalletConnection();
  const { isDevMode } = useDevMode();
  const { isDemoMode } = useDemoMode();
  const { setReviewMode } = useOnboardingStore();

  const isReviewMode = searchParams.get("mode") === "review";

  useEffect(() => {
    if (isReviewMode) {
      setReviewMode(true);
    }
  }, [isReviewMode, setReviewMode]);

  const isConnected = status === "connected" || isDevMode || isDemoMode;

  if (!isConnected) {
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
            Connect your wallet to set up your vault and configure your risk
            management rules.
          </p>
          <p className="mt-6 text-sm text-text-muted">
            Use the Connect button in the navigation bar to get started.
          </p>
        </div>
      </div>
    );
  }

  return <OnboardingWizard />;
}

function LoadingFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="mt-4 text-text-secondary">Loading...</p>
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <div className="min-h-screen pt-20">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <Suspense fallback={<LoadingFallback />}>
          <OnboardingContent />
        </Suspense>
      </div>
    </div>
  );
}
