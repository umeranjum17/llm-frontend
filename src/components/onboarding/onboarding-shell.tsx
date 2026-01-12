"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { useApiKeysStore } from "@/stores/api-keys-store";
import { markOnboardingCompleted } from "@/lib/db/queries";

// Step components
import { ProviderStep } from "./steps/provider-step";
import { MemoryStep } from "./steps/memory-step";
import { McpStep } from "./steps/mcp-step";
import { SummaryStep } from "./steps/summary-step";

type OnboardingStep = "provider" | "memory" | "mcp" | "summary";

const STEPS: OnboardingStep[] = ["provider", "memory", "mcp", "summary"];

export function OnboardingShell() {
  const router = useRouter();
  const { keys, isLoaded: keysLoaded } = useApiKeysStore();
  const [currentStep, setCurrentStep] = useState<OnboardingStep>("provider");
  const [configuredFeatures, setConfiguredFeatures] = useState({
    provider: "",
    memory: false,
    mcp: false,
  });

  // If user already has API keys, skip to memory step
  useEffect(() => {
    if (keysLoaded && keys.length > 0) {
      setConfiguredFeatures(prev => ({ ...prev, provider: keys[0].provider }));
      setCurrentStep("memory");
    }
  }, [keysLoaded, keys]);

  const handleProviderComplete = (providerId: string) => {
    setConfiguredFeatures(prev => ({ ...prev, provider: providerId }));
    setCurrentStep("memory");
  };

  const handleMemoryComplete = () => {
    setConfiguredFeatures(prev => ({ ...prev, memory: true }));
    setCurrentStep("mcp");
  };

  const handleMemorySkip = () => {
    setCurrentStep("mcp");
  };

  const handleMcpComplete = () => {
    setConfiguredFeatures(prev => ({ ...prev, mcp: true }));
    setCurrentStep("summary");
  };

  const handleMcpSkip = () => {
    setCurrentStep("summary");
  };

  const handleComplete = async () => {
    await markOnboardingCompleted();
    router.push("/");
  };

  const goToStep = (step: OnboardingStep) => {
    setCurrentStep(step);
  };

  const currentStepIndex = STEPS.indexOf(currentStep);
  const progress = ((currentStepIndex + 1) / STEPS.length) * 100;

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-background via-background to-muted/20">
      {/* Progress Bar */}
      {currentStep !== "summary" && (
        <div className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b">
          <div className="container max-w-2xl mx-auto px-4 py-3">
            <div className="flex items-center justify-between text-sm text-muted-foreground mb-2">
              <span>Step {currentStepIndex + 1} of {STEPS.length}</span>
              <span>{Math.round(progress)}% complete</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <motion.div
                className="h-full bg-primary"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Step Content */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <AnimatePresence mode="wait">
          {currentStep === "provider" && (
            <ProviderStep
              key="provider"
              onComplete={handleProviderComplete}
            />
          )}

          {currentStep === "memory" && (
            <MemoryStep
              key="memory"
              onComplete={handleMemoryComplete}
              onBack={() => goToStep("provider")}
              onSkip={handleMemorySkip}
            />
          )}

          {currentStep === "mcp" && (
            <McpStep
              key="mcp"
              onComplete={handleMcpComplete}
              onBack={() => goToStep("memory")}
              onSkip={handleMcpSkip}
            />
          )}

          {currentStep === "summary" && (
            <SummaryStep
              key="summary"
              onComplete={handleComplete}
              configuredFeatures={configuredFeatures}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
