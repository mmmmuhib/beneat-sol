"use client";

import type { OnboardingStep } from "../../stores/onboarding-store";

interface StepInfo {
  id: OnboardingStep;
  label: string;
  shortLabel: string;
}

const STEPS: StepInfo[] = [
  { id: "welcome", label: "Welcome", shortLabel: "1" },
  { id: "simulator", label: "Simulate", shortLabel: "2" },
  { id: "rules", label: "Configure", shortLabel: "3" },
  { id: "confirmation", label: "Confirm", shortLabel: "4" },
];

interface WizardStepIndicatorProps {
  currentStep: OnboardingStep;
  isReviewMode?: boolean;
}

export function WizardStepIndicator({
  currentStep,
  isReviewMode = false,
}: WizardStepIndicatorProps) {
  const currentIndex = STEPS.findIndex((s) => s.id === currentStep);
  const displaySteps = isReviewMode ? STEPS.slice(1) : STEPS;
  const adjustedCurrentIndex = isReviewMode ? currentIndex - 1 : currentIndex;

  return (
    <nav aria-label="Progress" className="mb-8">
      <ol className="flex items-center justify-center gap-2 sm:gap-4">
        {displaySteps.map((step, index) => {
          const isCompleted = index < adjustedCurrentIndex;
          const isCurrent = index === adjustedCurrentIndex;
          const stepNumber = isReviewMode ? index + 2 : index + 1;

          return (
            <li key={step.id} className="flex items-center">
              <div className="flex items-center gap-2">
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                    isCompleted
                      ? "bg-primary text-background"
                      : isCurrent
                        ? "border-2 border-primary bg-primary/10 text-primary"
                        : "border-2 border-border bg-card text-text-muted"
                  }`}
                  aria-current={isCurrent ? "step" : undefined}
                >
                  {isCompleted ? (
                    <svg
                      className="h-4 w-4"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  ) : (
                    stepNumber
                  )}
                </span>
                <span
                  className={`hidden text-sm font-medium sm:block ${
                    isCurrent
                      ? "text-primary"
                      : isCompleted
                        ? "text-foreground"
                        : "text-text-muted"
                  }`}
                >
                  {step.label}
                </span>
              </div>

              {index < displaySteps.length - 1 && (
                <div
                  className={`ml-2 h-0.5 w-8 sm:ml-4 sm:w-16 ${
                    index < adjustedCurrentIndex
                      ? "bg-primary"
                      : "bg-border"
                  }`}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
