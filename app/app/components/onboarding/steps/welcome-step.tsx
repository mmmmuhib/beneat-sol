"use client";

import { useOnboardingStore } from "../../../stores/onboarding-store";
import { useDemoMode } from "../../../hooks/use-demo-mode";

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
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

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
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

function BrainIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
      />
    </svg>
  );
}

const benefits = [
  {
    icon: ShieldIcon,
    title: "Protect Capital",
    description:
      "Set personalized daily loss limits that automatically lock your vault when breached, preventing emotional overtrading.",
  },
  {
    icon: ChartIcon,
    title: "Enforce Discipline",
    description:
      "Define max trades per day and lockout durations that keep you accountable to your trading plan.",
  },
  {
    icon: BrainIcon,
    title: "Trade Smarter",
    description:
      "Use Monte Carlo simulations to understand how your strategy performs across thousands of scenarios before risking real capital.",
  },
];

export function WelcomeStep() {
  const { nextStep } = useOnboardingStore();
  const { isDemoMode } = useDemoMode();

  return (
    <div className="mx-auto max-w-2xl space-y-8 text-center">
      <div>
        <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5">
          <svg
            className="h-12 w-12 text-primary"
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

        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          {isDemoMode ? "Demo: Set Up Your Risk Vault" : "Set Up Your Risk Vault"}
        </h1>
        <p className="mt-4 text-lg text-text-secondary">
          {isDemoMode
            ? "Experience the full onboarding flow with simulated transactions. No real SOL required. Explore how risk management rules protect your trading capital."
            : "Before you start trading, let's configure your personal risk management rules. We'll guide you through understanding your strategy before locking in your limits."}
        </p>

        {isDemoMode && (
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2">
            <svg
              className="h-4 w-4 text-primary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span className="text-sm font-medium text-primary">
              Demo Mode: Simulated Transactions
            </span>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {benefits.map((benefit) => (
          <div
            key={benefit.title}
            className="rounded-2xl border border-border bg-card p-6 text-left transition hover:border-primary/30 hover:shadow-[0_20px_80px_-50px_rgba(16,185,129,0.15)]"
          >
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <benefit.icon className="h-6 w-6 text-primary" />
            </div>
            <h3 className="font-semibold text-foreground">{benefit.title}</h3>
            <p className="mt-2 text-sm text-text-secondary">
              {benefit.description}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6">
        <h3 className="font-semibold text-primary">How This Works</h3>
        <p className="mt-2 text-sm text-text-secondary">
          First, you&apos;ll explore the Monte Carlo simulator to understand how
          different trading parameters affect your outcomes. Then, we&apos;ll
          suggest personalized rules based on your exploration. Finally,
          you&apos;ll confirm and create your vault.
        </p>
      </div>

      <button
        onClick={nextStep}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-8 py-3 text-sm font-medium text-background transition hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-card"
      >
        Get Started
        <svg
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13 7l5 5m0 0l-5 5m5-5H6"
          />
        </svg>
      </button>
    </div>
  );
}
