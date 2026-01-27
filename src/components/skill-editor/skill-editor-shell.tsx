"use client";

import { useEffect, useState } from "react";
import { useSkillEditorForm } from "@/hooks/use-skill-editor-form";
import { SkillEditorLayout } from "./skill-editor-layout";
import { SkillEditorHeader } from "./skill-editor-header";
import { SkillEditorFooter } from "./skill-editor-footer";
import { BasicsStep } from "./steps/basics-step";
import { TriggersStep } from "./steps/triggers-step";
import { PromptReviewStep } from "./steps/prompt-review-step";
import { addSkill, updateSkill } from "@/lib/db/queries";
import { toast } from "sonner";
import type { Skill, SkillTrigger, SkillUI } from "@/lib/db/schema";
import { useApiKeysStore } from "@/stores/api-keys-store";
import { useSettingsStore } from "@/stores/settings-store";
import { buildVariablesFromTemplate } from "@/lib/utils/prompt-variables";

const SKILL_PREFILL_KEY = "skillEditorPrefill";
const MAX_TRIGGER_PHRASES_IN_DESCRIPTION = 5;

interface SkillEditorShellProps {
  mode: "create" | "edit";
  existingSkill?: Skill;
  onCancel: () => void;
  onSave: () => void;
}

export function SkillEditorShell({
  mode,
  existingSkill,
  onCancel,
  onSave,
}: SkillEditorShellProps) {
  const [saving, setSaving] = useState(false);
  const [embeddingProgress, setEmbeddingProgress] = useState<string | null>(null);

  const {
    currentStep,
    setStep,
    validateStep,
    validateAll,
    reset,
    loadSkill,
    loadPrefillData,
    name,
    category,
    icon,
    color,
    activeLabel,
    triggerPhrases,
    exclusionQueries,
    autoTrigger,
    requireApproval,
    systemPrompt,
    userTemplate,
  } = useSkillEditorForm();

  const { getKeyForProvider } = useApiKeysStore();
  const { embeddingsProvider, embeddingsModelId } = useSettingsStore();

  // Load existing skill or prefill data on mount
  useEffect(() => {
    if (mode === "edit" && existingSkill) {
      loadSkill(existingSkill);
    } else {
      // Check for prefill data in sessionStorage
      const stored = sessionStorage.getItem(SKILL_PREFILL_KEY);
      if (stored) {
        try {
          const { data } = JSON.parse(stored);
          loadPrefillData(data);
        } catch (error) {
          console.error("Failed to parse prefill data:", error);
        }
      }
    }

    return () => {
      // Cleanup on unmount
      reset();
    };
  }, [mode, existingSkill, loadSkill, loadPrefillData, reset]);

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setStep(currentStep + 1);
    } else {
      toast.error("Please fix the errors before continuing");
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setStep(currentStep - 1);
    }
  };

  const handleSaveClick = async () => {
    if (!validateAll()) {
      toast.error("Please fix all errors before saving");
      return;
    }

    setSaving(true);

    try {
      const description = triggerPhrases
        .slice(0, MAX_TRIGGER_PHRASES_IN_DESCRIPTION)
        .join(", ");

      const trigger: SkillTrigger = { type: autoTrigger ? "auto" : "manual" };
      const ui: SkillUI = {
        icon,
        color,
        activeLabel: activeLabel.trim() || `Using ${name.trim()}...`,
      };

      const variables = buildVariablesFromTemplate(
        userTemplate,
        existingSkill?.variables
      );

      if (mode === "edit" && existingSkill) {
        await updateSkill(existingSkill.id, {
          name: name.trim(),
          description,
          category,
          systemPrompt,
          userTemplate: userTemplate.trim() || undefined,
          variables: variables.length > 0 ? variables : undefined,
          trigger,
          requireApproval,
          autoApplyQueries: triggerPhrases.length > 0 ? triggerPhrases : undefined,
          exclusionQueries: exclusionQueries.length > 0 ? exclusionQueries : undefined,
          ui,
        });
        toast.success("Skill updated");
      } else {
        const newSkill = await addSkill({
          name: name.trim(),
          description,
          category,
          systemPrompt,
          userTemplate: userTemplate.trim() || undefined,
          variables: variables.length > 0 ? variables : undefined,
          trigger,
          requireApproval,
          autoApplyQueries: triggerPhrases.length > 0 ? triggerPhrases : undefined,
          exclusionQueries: exclusionQueries.length > 0 ? exclusionQueries : undefined,
          ui,
          isBuiltIn: false,
          isEnabled: true,
          isFavorite: false,
        });

        // Auto-generate embeddings if API key is configured
        if (newSkill && embeddingsProvider && embeddingsModelId && triggerPhrases.length > 0) {
          const apiKeyObj = getKeyForProvider(embeddingsProvider);
          if (apiKeyObj?.key) {
            try {
              const { setSkillAutoApplyQueries, setSkillExclusionQueries } = await import(
                "@/lib/db/queries"
              );
              const { generateSkillEmbedding } = await import(
                "@/lib/skills/skill-embeddings"
              );

              const totalSteps = 2 + (exclusionQueries.length > 0 ? 1 : 0);
              let currentStepNum = 0;

              // Generate trigger phrase embeddings
              currentStepNum++;
              setEmbeddingProgress(
                `Generating trigger embeddings (${currentStepNum}/${totalSteps})...`
              );
              await setSkillAutoApplyQueries(
                newSkill.id,
                triggerPhrases,
                apiKeyObj.key,
                embeddingsProvider,
                embeddingsModelId
              );

              // Generate exclusion embeddings if any
              if (exclusionQueries.length > 0) {
                currentStepNum++;
                setEmbeddingProgress(
                  `Generating exclusion embeddings (${currentStepNum}/${totalSteps})...`
                );
                await setSkillExclusionQueries(
                  newSkill.id,
                  exclusionQueries,
                  apiKeyObj.key,
                  embeddingsProvider,
                  embeddingsModelId
                );
              }

              // Generate description embedding
              currentStepNum++;
              setEmbeddingProgress(`Finalizing (${currentStepNum}/${totalSteps})...`);
              await generateSkillEmbedding(
                newSkill,
                apiKeyObj.key,
                embeddingsProvider,
                embeddingsModelId
              );

              setEmbeddingProgress(null);
              toast.success("Skill and embeddings generated successfully");
            } catch (error) {
              setEmbeddingProgress(null);
              console.error("Failed to generate embeddings:", error);
              toast.warning(
                "Skill saved, but embeddings failed. You can regenerate them from Settings."
              );
            }
          }
        }

        toast.success("Skill created");
      }

      // Call onSave callback to navigate away
      onSave();
    } catch (error) {
      console.error("Failed to save skill:", error);
      toast.error("Failed to save skill");
    } finally {
      setSaving(false);
    }
  };

  const steps = [
    { component: <BasicsStep key="basics" />, title: "Basics" },
    { component: <TriggersStep key="triggers" />, title: "Triggers" },
    { component: <PromptReviewStep key="prompt" />, title: "Prompt/Review" },
  ];

  const canSave = !saving && !embeddingProgress && validateAll();

  return (
    <SkillEditorLayout
      header={
        <SkillEditorHeader
          currentStep={currentStep}
          totalSteps={steps.length}
          onBack={onCancel}
          onSave={handleSaveClick}
          saving={saving || !!embeddingProgress}
          canSave={canSave}
          isEditMode={mode === "edit"}
        />
      }
      footer={
        <SkillEditorFooter
          currentStep={currentStep}
          totalSteps={steps.length}
          onBack={handleBack}
          onNext={handleNext}
          onFinish={() => setStep(2)}
          canProceed={validateStep(currentStep)}
        />
      }
    >
      {/* Embedding Progress Indicator */}
      {embeddingProgress && (
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-3">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <span className="text-sm text-blue-700 dark:text-blue-300">
              {embeddingProgress}
            </span>
          </div>
        </div>
      )}

      {/* Current Step Content */}
      {steps[currentStep].component}
    </SkillEditorLayout>
  );
}
