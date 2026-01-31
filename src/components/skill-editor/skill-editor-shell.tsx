"use client";

import { useEffect, useState, useRef } from "react";
import { useSkillEditorForm } from "@/hooks/use-skill-editor-form";
import { SkillEditorLayout } from "./skill-editor-layout";
import { SkillEditorHeader } from "./skill-editor-header";
import { SkillEditorFooter } from "./skill-editor-footer";
import { BasicsStep } from "./steps/basics-step";
import { TriggersStep } from "./steps/triggers-step";
import { PromptReviewStep } from "./steps/prompt-review-step";
import { addSkill, updateSkill, isSkillNameTaken } from "@/lib/db/queries";
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
  const hasInitialized = useRef(false);

  const currentStep = useSkillEditorForm((s) => s.currentStep);
  const setStep = useSkillEditorForm((s) => s.setStep);
  const validateStep = useSkillEditorForm((s) => s.validateStep);
  const validateAll = useSkillEditorForm((s) => s.validateAll);
  const name = useSkillEditorForm((s) => s.name);
  const category = useSkillEditorForm((s) => s.category);
  const icon = useSkillEditorForm((s) => s.icon);
  const color = useSkillEditorForm((s) => s.color);
  const activeLabel = useSkillEditorForm((s) => s.activeLabel);
  const triggerPhrases = useSkillEditorForm((s) => s.triggerPhrases);
  const exclusionQueries = useSkillEditorForm((s) => s.exclusionQueries);
  const autoTrigger = useSkillEditorForm((s) => s.autoTrigger);
  const requireApproval = useSkillEditorForm((s) => s.requireApproval);
  const systemPrompt = useSkillEditorForm((s) => s.systemPrompt);
  const userTemplate = useSkillEditorForm((s) => s.userTemplate);

  const { getKeyForProvider } = useApiKeysStore();
  const { embeddingsProvider, embeddingsModelId } = useSettingsStore();

  // Load existing skill or prefill data on mount (once only)
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    // Get store actions directly to avoid stale closures
    const { reset, loadSkill, loadPrefillData } = useSkillEditorForm.getState();

    // Reset form first
    reset();

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
        } finally {
          // Always clear after attempting to read
          sessionStorage.removeItem(SKILL_PREFILL_KEY);
        }
      }
    }
  }, [mode, existingSkill]);

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
    // Task 4: Prevent concurrent saves
    if (saving) return;

    if (!validateAll()) {
      toast.error("Please fix all errors before saving");
      return;
    }

    setSaving(true);

    try {
      // Task 1: Sanitize trigger phrases and exclusion queries
      const cleanedTriggerPhrases = triggerPhrases
        .map(p => p.trim())
        .filter(p => p.length > 0);
      const cleanedExclusionQueries = exclusionQueries
        .map(q => q.trim())
        .filter(q => q.length > 0);
      const uniqueTriggerPhrases = [...new Set(cleanedTriggerPhrases)];
      const uniqueExclusionQueries = [...new Set(cleanedExclusionQueries)];

      // Task 2: Prevent duplicate skill names
      const isEditMode = mode === "edit" && !!existingSkill;
      const isDuplicate = await isSkillNameTaken(name, isEditMode ? existingSkill?.id : undefined);
      if (isDuplicate) {
        toast.error(`A skill named "${name.trim()}" already exists.`);
        setSaving(false);
        return;
      }

      const description = uniqueTriggerPhrases
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
        // Task 8: Clear stale embeddings before regenerating
        await updateSkill(existingSkill.id, {
          autoApplyEmbeddings: undefined,
          exclusionEmbeddings: undefined,
        });

        await updateSkill(existingSkill.id, {
          name: name.trim(),
          description,
          category,
          systemPrompt,
          userTemplate: userTemplate.trim() || undefined,
          variables: variables.length > 0 ? variables : undefined,
          trigger,
          requireApproval,
          autoApplyQueries: uniqueTriggerPhrases.length > 0 ? uniqueTriggerPhrases : undefined,
          exclusionQueries: uniqueExclusionQueries.length > 0 ? uniqueExclusionQueries : undefined,
          ui,
        });

        // Regenerate embeddings if trigger phrases changed
        if (embeddingsProvider && embeddingsModelId && uniqueTriggerPhrases.length > 0) {
          const apiKeyObj = getKeyForProvider(embeddingsProvider);
          if (apiKeyObj?.key) {
            try {
              const { setSkillAutoApplyQueries, setSkillExclusionQueries } = await import(
                "@/lib/db/queries"
              );
              const { generateSkillEmbedding } = await import(
                "@/lib/skills/skill-embeddings"
              );

              const totalSteps = 2 + (uniqueExclusionQueries.length > 0 ? 1 : 0);
              let currentStepNum = 0;

              // Generate trigger phrase embeddings
              currentStepNum++;
              setEmbeddingProgress(
                `Updating trigger embeddings (${currentStepNum}/${totalSteps})...`
              );
              const triggerResult = await setSkillAutoApplyQueries(
                existingSkill.id,
                uniqueTriggerPhrases,
                apiKeyObj.key,
                embeddingsProvider,
                embeddingsModelId
              );
              // Task 3: Validate embedding generation results
              if (triggerResult && !triggerResult.success) {
                toast.warning(`Skill saved, but ${triggerResult.failedCount ?? "some"} trigger embeddings failed to generate.`);
              }

              // Generate exclusion embeddings if any
              if (uniqueExclusionQueries.length > 0) {
                currentStepNum++;
                setEmbeddingProgress(
                  `Updating exclusion embeddings (${currentStepNum}/${totalSteps})...`
                );
                const exclusionResult = await setSkillExclusionQueries(
                  existingSkill.id,
                  uniqueExclusionQueries,
                  apiKeyObj.key,
                  embeddingsProvider,
                  embeddingsModelId
                );
                // Task 3: Validate embedding generation results
                if (exclusionResult && !exclusionResult.success) {
                  toast.warning(`${exclusionResult.failedCount ?? "Some"} exclusion embeddings failed to generate.`);
                }
              }

              // Generate description embedding
              currentStepNum++;
              setEmbeddingProgress(`Finalizing (${currentStepNum}/${totalSteps})...`);
              await generateSkillEmbedding(
                { ...existingSkill, name: name.trim(), description },
                apiKeyObj.key,
                embeddingsProvider,
                embeddingsModelId
              );

              setEmbeddingProgress(null);
              toast.success("Skill and embeddings updated successfully");
            } catch (error) {
              setEmbeddingProgress(null);
              console.error("Failed to update embeddings:", error);
              toast.warning(
                "Skill saved, but embeddings failed. You can regenerate them from Settings."
              );
            }
          } else {
            toast.success("Skill updated (no API key for embeddings)");
          }
        } else {
          toast.success("Skill updated");
        }
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
          autoApplyQueries: uniqueTriggerPhrases.length > 0 ? uniqueTriggerPhrases : undefined,
          exclusionQueries: uniqueExclusionQueries.length > 0 ? uniqueExclusionQueries : undefined,
          ui,
          isBuiltIn: false,
          isEnabled: true,
          isFavorite: false,
        });

        // Auto-generate embeddings if API key is configured
        if (newSkill && embeddingsProvider && embeddingsModelId && uniqueTriggerPhrases.length > 0) {
          const apiKeyObj = getKeyForProvider(embeddingsProvider);
          if (apiKeyObj?.key) {
            try {
              const { setSkillAutoApplyQueries, setSkillExclusionQueries } = await import(
                "@/lib/db/queries"
              );
              const { generateSkillEmbedding } = await import(
                "@/lib/skills/skill-embeddings"
              );

              const totalSteps = 2 + (uniqueExclusionQueries.length > 0 ? 1 : 0);
              let currentStepNum = 0;

              // Generate trigger phrase embeddings
              currentStepNum++;
              setEmbeddingProgress(
                `Generating trigger embeddings (${currentStepNum}/${totalSteps})...`
              );
              const triggerResult = await setSkillAutoApplyQueries(
                newSkill.id,
                uniqueTriggerPhrases,
                apiKeyObj.key,
                embeddingsProvider,
                embeddingsModelId
              );
              // Task 3: Validate embedding generation results
              if (triggerResult && !triggerResult.success) {
                toast.warning(`Skill saved, but ${triggerResult.failedCount ?? "some"} trigger embeddings failed to generate.`);
              }

              // Generate exclusion embeddings if any
              if (uniqueExclusionQueries.length > 0) {
                currentStepNum++;
                setEmbeddingProgress(
                  `Generating exclusion embeddings (${currentStepNum}/${totalSteps})...`
                );
                const exclusionResult = await setSkillExclusionQueries(
                  newSkill.id,
                  uniqueExclusionQueries,
                  apiKeyObj.key,
                  embeddingsProvider,
                  embeddingsModelId
                );
                // Task 3: Validate embedding generation results
                if (exclusionResult && !exclusionResult.success) {
                  toast.warning(`${exclusionResult.failedCount ?? "Some"} exclusion embeddings failed to generate.`);
                }
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
              toast.success("Skill created with embeddings");
            } catch (error) {
              setEmbeddingProgress(null);
              console.error("Failed to generate embeddings:", error);
              toast.warning(
                "Skill saved, but embeddings failed. You can regenerate them from Settings."
              );
            }
          } else {
            toast.success("Skill created (configure API key for auto-matching)");
          }
        } else if (newSkill && uniqueTriggerPhrases.length > 0) {
          toast.success("Skill created (configure embeddings in Settings for auto-matching)");
        } else {
          toast.success("Skill created");
        }
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
          onStepClick={(step) => setStep(step)}
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
          onSave={handleSaveClick}
          canProceed={validateStep(currentStep)}
          canSave={canSave}
          saving={saving || !!embeddingProgress}
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

      {/* Desktop: Show all sections at once */}
      <div className="hidden md:block space-y-8">
        {steps.map((step, index) => (
          <section key={step.title} id={`step-${index}`}>
            {step.component}
          </section>
        ))}
      </div>

      {/* Mobile: Show current step only */}
      <div className="md:hidden">
        {steps[currentStep].component}
      </div>
    </SkillEditorLayout>
  );
}
