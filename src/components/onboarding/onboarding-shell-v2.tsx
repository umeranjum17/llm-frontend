"use client";

import { useRouter } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import { useOnboardingStore } from "@/stores/onboarding-store";
import { markOnboardingCompleted } from "@/lib/db/queries";
import { OnboardingLayout } from "./onboarding-layout";
import { UseCaseStep } from "./steps/use-case-step";
import { ProviderStepV2 } from "./steps/provider-step-v2";
import { FirstTaskStep } from "./steps/first-task-step";
import { EnhancementStep } from "./steps/enhancement-step";
import type { Step } from "./stepper";

const STEP_LABELS = [
  "Pick what you're doing",
  "Connect AI provider",
  "Run your first task",
  "Improve results",
];

export function OnboardingShellV2() {
  const router = useRouter();
  const {
    currentStep,
    useCase,
    providerId,
    setStep,
    setUseCase,
    setProvider,
    setFirstChatId,
  } = useOnboardingStore();

  const handleUseCaseComplete = (selectedUseCase: string) => {
    setUseCase(selectedUseCase);
    setStep(1);
  };

  const handleProviderComplete = (selectedProviderId: string) => {
    setProvider(selectedProviderId);
    setStep(2);
  };

  const handleFirstTaskComplete = (chatId: string) => {
    setFirstChatId(chatId);
    setStep(3);
  };

  const handleEnhancementComplete = async () => {
    await markOnboardingCompleted(providerId ?? undefined);
    router.push("/");
  };

  const handleStepClick = (stepIndex: number) => {
    setStep(stepIndex);
  };

  // Build steps with current status
  const steps: Step[] = STEP_LABELS.map((label, index) => ({
    id: `step-${index}`,
    label,
    status:
      index < currentStep
        ? "completed"
        : index === currentStep
        ? "current"
        : "pending",
  }));

  return (
    <OnboardingLayout
      steps={steps}
      currentStep={currentStep}
      onStepClick={handleStepClick}
    >
      <AnimatePresence mode="wait">
        {currentStep === 0 && (
          <UseCaseStep key="use-case" onComplete={handleUseCaseComplete} />
        )}

        {currentStep === 1 && (
          <ProviderStepV2 key="provider" onComplete={handleProviderComplete} />
        )}

        {currentStep === 2 && useCase && providerId && (
          <FirstTaskStep
            key="first-task"
            useCase={useCase}
            providerId={providerId}
            onComplete={handleFirstTaskComplete}
          />
        )}

        {currentStep === 3 && (
          <EnhancementStep
            key="enhancement"
            onComplete={handleEnhancementComplete}
          />
        )}
      </AnimatePresence>
    </OnboardingLayout>
  );
}
