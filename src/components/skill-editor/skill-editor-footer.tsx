"use client";

import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Save } from "lucide-react";
import { cn } from "@/lib/utils";

interface SkillEditorFooterProps {
  currentStep: number;
  totalSteps: number;
  onBack: () => void;
  onNext: () => void;
  onSave: () => void;
  canProceed?: boolean;
  canSave?: boolean;
  saving?: boolean;
  className?: string;
}

export function SkillEditorFooter({
  currentStep,
  totalSteps,
  onBack,
  onNext,
  onSave,
  canProceed = true,
  canSave = true,
  saving = false,
  className,
}: SkillEditorFooterProps) {
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === totalSteps - 1;

  return (
    <div
      className={cn(
        "sticky left-0 right-0 z-50 border-t bg-background/80 backdrop-blur-lg",
        "bottom-16 md:hidden", // Only show on mobile, above app navbar
        className
      )}
    >
      <div className="container max-w-5xl mx-auto p-4 flex gap-3">
        {!isFirstStep && (
          <Button
            variant="outline"
            onClick={onBack}
            disabled={saving}
            className="flex-1 h-11 gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        )}
        {isLastStep ? (
          <Button
            onClick={onSave}
            disabled={!canSave || saving}
            className="flex-1 h-11 gap-2"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Save Skill"}
          </Button>
        ) : (
          <Button
            onClick={onNext}
            disabled={!canProceed}
            className="flex-1 h-11 gap-2"
          >
            Next
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
