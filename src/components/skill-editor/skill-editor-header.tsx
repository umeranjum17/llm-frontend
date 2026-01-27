"use client";

import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface SkillEditorHeaderProps {
  currentStep: number;
  totalSteps: number;
  onBack: () => void;
  onSave: () => void;
  saving?: boolean;
  canSave?: boolean;
  isEditMode?: boolean;
}

export function SkillEditorHeader({
  currentStep,
  totalSteps,
  onBack,
  onSave,
  saving = false,
  canSave = true,
  isEditMode = false,
}: SkillEditorHeaderProps) {
  const progress = ((currentStep + 1) / totalSteps) * 100;

  return (
    <header className="sticky top-0 z-50 bg-background border-b">
      {/* Desktop header */}
      <div className="hidden md:flex items-center justify-between px-6 py-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          disabled={saving}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <h1 className="text-lg font-semibold">
          {isEditMode ? "Edit Skill" : "New Skill"}
        </h1>
        <Button onClick={onSave} disabled={!canSave || saving}>
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>

      {/* Mobile header */}
      <div className="md:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            disabled={saving}
            className="h-8 w-8 p-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="text-xs text-muted-foreground">
            Step {currentStep + 1} of {totalSteps}
          </div>
          <Button onClick={onSave} disabled={!canSave || saving} size="sm" className="h-8">
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
        {/* Progress bar */}
        <div className="h-1 w-full bg-muted">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </header>
  );
}
