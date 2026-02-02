"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useOnboardingStore } from "../../stores/onboarding-store";
import { useVault } from "../../hooks/use-vault";
import { useDemoMode } from "../../hooks/use-demo-mode";
import { WizardStepIndicator } from "./wizard-step-indicator";
import { WelcomeStep } from "./steps/welcome-step";
import { SimulatorStep } from "./steps/simulator-step";
import { RulesStep } from "./steps/rules-step";
import { ConfirmationStep } from "./steps/confirmation-step";

export function OnboardingWizard() {
  const router = useRouter();
  const {
    currentStep,
    isReviewMode,
    getEffectiveRules,
    setTransactionStatus,
    reset,
  } = useOnboardingStore();

  const { initializeVault, setRules, vault, isSending, isDemoInitialized } = useVault();
  const { isDemoMode } = useDemoMode();

  const handleCreateVault = useCallback(async () => {
    const rules = getEffectiveRules();

    if (isReviewMode) {
      setTransactionStatus("setting-rules");

      try {
        const dailyLossLimitLamports = BigInt(
          Math.floor(rules.dailyLossLimit * 1_000_000_000)
        );
        const lockoutDurationSeconds = rules.lockoutDuration * 3600;

        const signature = await setRules(
          dailyLossLimitLamports,
          rules.maxTradesPerDay,
          lockoutDurationSeconds
        );

        if (signature) {
          setTransactionStatus("success");
          setTimeout(() => {
            reset();
            router.push("/vault");
          }, 1500);
        } else {
          setTransactionStatus("error", "Failed to update rules. Please try again.");
        }
      } catch (err) {
        setTransactionStatus(
          "error",
          err instanceof Error ? err.message : "An unexpected error occurred"
        );
      }
    } else {
      setTransactionStatus("initializing");

      try {
        const lockoutDurationSeconds = rules.lockoutDuration * 3600;
        const initSignature = await initializeVault(lockoutDurationSeconds);

        if (!initSignature) {
          setTransactionStatus("error", "Failed to initialize vault. Please try again.");
          return;
        }

        setTransactionStatus("setting-rules");

        const dailyLossLimitLamports = BigInt(
          Math.floor(rules.dailyLossLimit * 1_000_000_000)
        );

        const rulesSignature = await setRules(
          dailyLossLimitLamports,
          rules.maxTradesPerDay,
          lockoutDurationSeconds
        );

        if (rulesSignature) {
          setTransactionStatus("success");
          setTimeout(() => {
            reset();
            router.push("/vault");
          }, 1500);
        } else {
          setTransactionStatus("error", "Vault created but failed to set rules. Please configure rules from the dashboard.");
          setTimeout(() => {
            reset();
            router.push("/vault");
          }, 3000);
        }
      } catch (err) {
        setTransactionStatus(
          "error",
          err instanceof Error ? err.message : "An unexpected error occurred"
        );
      }
    }
  }, [getEffectiveRules, isReviewMode, initializeVault, setRules, setTransactionStatus, reset, router]);

  const handleCancel = useCallback(() => {
    reset();
    router.push("/vault");
  }, [reset, router]);

  const renderStep = () => {
    switch (currentStep) {
      case "welcome":
        return <WelcomeStep />;
      case "simulator":
        return <SimulatorStep />;
      case "rules":
        return <RulesStep />;
      case "confirmation":
        return (
          <ConfirmationStep
            onConfirm={handleCreateVault}
            onCancel={handleCancel}
            isSending={isSending}
            hasExistingVault={!!vault && (!isDemoMode || isDemoInitialized)}
            isDemoMode={isDemoMode}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <WizardStepIndicator currentStep={currentStep} isReviewMode={isReviewMode} />
      {isDemoMode && (
        <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <svg
              className="h-5 w-5 text-primary"
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
              Demo Mode Active
            </span>
            <span className="text-xs text-text-secondary">
              Transactions are simulated for demonstration
            </span>
          </div>
        </div>
      )}
      {renderStep()}
    </div>
  );
}
