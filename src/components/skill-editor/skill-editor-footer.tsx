"use client";

import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface SkillEditorFooterProps {
  currentStep: number;
  totalSteps: number;
  onBack: () => void;
  onNext: () => void;
  onFinish: () => void;
  canProceed?: boolean;
  className?: string;
}

export function SkillEditorFooter({
  currentStep,
  totalSteps,
  onBack,
  onNext,
  onFinish,
  canProceed = true,
  className,
}: SkillEditorFooterProps) {
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === totalSteps - 1;

  return (
    <div
      className={cn(
        "sticky bottom-0 left-0 right-0 z-50 border-t bg-background/80 backdrop-blur-lg",
        "md:hidden", // Only visible on mobile
        className
      )}
    >
      <div className="container max-w-2xl mx-auto p-4 flex gap-3">
        {!isFirstStep && (
          <Button
            variant="outline"
            onClick={onBack}
            className="flex-1 h-11 gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        )}
        <Button
          onClick={isLastStep ? onFinish : onNext}
          disabled={!canProceed}
          className={cn("h-11 gap-2", isFirstStep ? "flex-1" : "flex-1")}
        >
          {isLastStep ? "Review" : "Next"}
          {!isLastStep && <ArrowRight className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
