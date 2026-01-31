import { create } from "zustand";
import type { Skill } from "@/lib/db/schema";

export interface SkillEditorFormState {
  // Step tracking
  currentStep: 0 | 1 | 2;
  completedSteps: Set<number>;

  // Form data
  name: string;
  category: Skill["category"];
  icon: string;
  color: string;
  activeLabel: string;

  triggerPhrases: string[];
  exclusionQueries: string[];
  autoTrigger: boolean;
  requireApproval: boolean;

  systemPrompt: string;
  userTemplate: string;

  // Validation state
  errors: Record<string, string | null>;
  touchedFields: Set<string>;

  // Edit mode
  isEditMode: boolean;
  originalSkill: Skill | null;

  // Embedding status
  embeddingStatus: "missing" | "stale" | "model_mismatch" | "ok";
  isGeneratingEmbedding: boolean;

  // Actions
  setField: (field: string, value: any) => void;
  setStep: (step: number) => void;
  markStepCompleted: (step: number) => void;
  validateStep: (step: number) => boolean;
  validateAll: () => boolean;
  setError: (field: string, error: string | null) => void;
  touchField: (field: string) => void;
  reset: () => void;
  loadSkill: (skill: Skill) => void;
  loadPrefillData: (data: Partial<Skill>) => void;
  setEmbeddingStatus: (status: SkillEditorFormState["embeddingStatus"]) => void;
  setGeneratingEmbedding: (generating: boolean) => void;
}

const initialState = {
  currentStep: 0 as const,
  completedSteps: new Set<number>(),

  name: "",
  category: "coding" as Skill["category"],
  icon: "Sparkles",
  color: "blue",
  activeLabel: "",

  triggerPhrases: [],
  exclusionQueries: [],
  autoTrigger: true,
  requireApproval: false,

  systemPrompt: "",
  userTemplate: "",

  errors: {},
  touchedFields: new Set<string>(),

  isEditMode: false,
  originalSkill: null,

  embeddingStatus: "ok" as const,
  isGeneratingEmbedding: false,
};

export const useSkillEditorForm = create<SkillEditorFormState>((set, get) => ({
  ...initialState,

  setField: (field, value) => {
    set((state) => ({
      [field]: value,
      touchedFields: new Set(state.touchedFields).add(field),
    }));
  },

  setStep: (step) => {
    const current = get().currentStep;
    // Validate current step before moving forward
    if (step > current && !get().validateStep(current)) {
      return;
    }
    set({ currentStep: step as 0 | 1 | 2 });
  },

  markStepCompleted: (step) => {
    set((state) => ({
      completedSteps: new Set(state.completedSteps).add(step),
    }));
  },

  validateStep: (step) => {
    const state = get();
    const errors: Record<string, string | null> = {};
    let isValid = true;

    if (step === 0) {
      // Basics step
      if (!state.name.trim() || state.name.trim().length < 3) {
        errors.name = "Name must be at least 3 characters";
        isValid = false;
      }
      const validCategories = ["creation", "visualization", "coding", "analysis", "writing", "productivity", "research", "business", "search"];
      if (!validCategories.includes(state.category)) {
        errors.category = "Invalid category";
        isValid = false;
      }
    } else if (step === 1) {
      // Triggers step
      const validPhrases = state.triggerPhrases.filter(p => p.trim().length > 0);
      if (state.autoTrigger && validPhrases.length === 0) {
        errors.triggerPhrases = "At least one non-empty trigger phrase is required";
        isValid = false;
      }
    } else if (step === 2) {
      // Prompt step
      if (!state.systemPrompt.trim() || state.systemPrompt.trim().length < 20) {
        errors.systemPrompt = "System prompt must be at least 20 characters";
        isValid = false;
      }
    }

    set({ errors });
    return isValid;
  },

  validateAll: () => {
    const state = get();
    const allValid = [0, 1, 2].every((step) => state.validateStep(step));
    return allValid;
  },

  setError: (field, error) => {
    set((state) => ({
      errors: { ...state.errors, [field]: error },
    }));
  },

  touchField: (field) => {
    set((state) => ({
      touchedFields: new Set(state.touchedFields).add(field),
    }));
  },

  reset: () => {
    set(initialState);
  },

  loadSkill: (skill) => {
    set({
      isEditMode: true,
      originalSkill: skill,
      name: skill.name,
      category: skill.category,
      icon: skill.ui.icon,
      color: skill.ui.color,
      activeLabel: skill.ui.activeLabel,
      triggerPhrases: skill.autoApplyQueries || [],
      exclusionQueries: skill.exclusionQueries || [],
      autoTrigger: skill.trigger.type === "auto",
      requireApproval: skill.requireApproval || false,
      systemPrompt: skill.systemPrompt,
      userTemplate: skill.userTemplate || "",
    });
  },

  loadPrefillData: (data) => {
    const updates: Partial<SkillEditorFormState> = {};

    if (data.name) updates.name = data.name;
    if (data.category) updates.category = data.category;
    if (data.systemPrompt) updates.systemPrompt = data.systemPrompt;
    if (data.userTemplate) updates.userTemplate = data.userTemplate;
    if (data.autoApplyQueries) updates.triggerPhrases = data.autoApplyQueries;
    if (data.exclusionQueries) updates.exclusionQueries = data.exclusionQueries;
    if (data.trigger) updates.autoTrigger = data.trigger.type === "auto";
    if (data.requireApproval !== undefined) updates.requireApproval = data.requireApproval;
    if (data.ui) {
      if (data.ui.icon) updates.icon = data.ui.icon;
      if (data.ui.color) updates.color = data.ui.color;
      if (data.ui.activeLabel) updates.activeLabel = data.ui.activeLabel;
    }

    set(updates);
  },

  setEmbeddingStatus: (status) => {
    set({ embeddingStatus: status });
  },

  setGeneratingEmbedding: (generating) => {
    set({ isGeneratingEmbedding: generating });
  },
}));
