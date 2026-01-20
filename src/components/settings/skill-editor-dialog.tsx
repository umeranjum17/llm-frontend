"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, X, Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Skill, SkillTrigger, SkillUI } from "@/lib/db/schema";
import { addSkill, updateSkill, getSkillById } from "@/lib/db/queries";
import { buildVariablesFromTemplate } from "@/lib/utils/prompt-variables";
import { SKILL_COLORS, SKILL_CATEGORY_CONFIG } from "@/lib/constants/skills";
import { toast } from "sonner";
import { useUIStore } from "@/stores/ui-store";
import { useApiKeysStore } from "@/stores/api-keys-store";
import { useSettingsStore } from "@/stores/settings-store";
import { generateSkillEmbedding } from "@/lib/skills/skill-embeddings";
import { PREFILL_CLEAR_DELAY_MS, MAX_TRIGGER_PHRASES_IN_DESCRIPTION } from "@/lib/validation/agent-validation";
import { classifyError, ErrorSeverity, formatErrorMessage } from "@/lib/utils/error-handling";

const CATEGORIES = ["creation", "visualization", "coding", "analysis", "writing", "search"] as const;

const ICONS = [
  "FileText",
  "BarChart3",
  "GitBranch",
  "Image",
  "Code",
  "Bug",
  "Scale",
  "Layers",
  "Sparkles",
  "Search",
  "PenLine",
  "Wand2",
] as const;

const COLORS = ["blue", "green", "purple", "pink", "amber", "red", "cyan", "sky", "teal", "orange", "indigo", "emerald"] as const;

interface SkillEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skill?: Skill | null;
}

export function SkillEditorDialog({ open, onOpenChange, skill }: SkillEditorDialogProps) {
  const skillEditorTargetId = useUIStore((state) => state.skillEditorTargetId);
  const isEditing = !!skill || !!skillEditorTargetId;
  const [name, setName] = useState("");
  const [triggerPhrases, setTriggerPhrases] = useState<string[]>([]);
  const [newTriggerPhrase, setNewTriggerPhrase] = useState("");
  const [exclusionKeywords, setExclusionKeywords] = useState<string[]>([]);
  const [newExclusionKeyword, setNewExclusionKeyword] = useState("");
  const [category, setCategory] = useState<Skill["category"]>("coding");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [userTemplate, setUserTemplate] = useState("");
  const [icon, setIcon] = useState<string>("Sparkles");
  const [color, setColor] = useState<string>("blue");
  const [activeLabel, setActiveLabel] = useState("");
  const [autoTrigger, setAutoTrigger] = useState(true);
  const [requireApproval, setRequireApproval] = useState(false);
  const [saving, setSaving] = useState(false);
  const [embeddingProgress, setEmbeddingProgress] = useState<string | null>(null);

  // Get prefilled data from UI store (for "Convert to Skill" feature)
  // Use getState() to avoid stale closure issues with lazy-loaded components
  const clearSkillEditorData = useUIStore((state) => state.clearSkillEditorData);

  useEffect(() => {
    if (!open) return;

    let isMounted = true;

    // Read prefilled data directly from store to avoid stale closures
    const prefilledData = useUIStore.getState().skillEditorPrefilledData;
    const targetId = useUIStore.getState().skillEditorTargetId;

    // If we have a targetId but no skill prop, fetch the existing skill
    const loadExistingSkill = async () => {
      if (targetId && !skill && prefilledData) {
        const existingSkill = await getSkillById(targetId);
        if (!isMounted) return; // Component unmounted, abort

        if (existingSkill) {
          // Merge prefilled data over existing skill (prefill takes precedence)
          const merged = { ...existingSkill, ...prefilledData };
          setName(merged.name || "");
          setTriggerPhrases(merged.autoApplyQueries || []);
          setExclusionKeywords(merged.exclusionQueries || []);
          setCategory(merged.category || "coding");
          setSystemPrompt(merged.systemPrompt || "");
          setUserTemplate(merged.userTemplate || "");
          setIcon(merged.ui?.icon || "Sparkles");
          setColor(merged.ui?.color || "blue");
          setActiveLabel(merged.ui?.activeLabel || "");
          setAutoTrigger(merged.trigger?.type ? merged.trigger.type === "auto" : true);
          setRequireApproval(merged.requireApproval || false);
          return;
        }
      }

      // Priority: existing skill > prefilled data > defaults
      const source = skill || prefilledData;

      setName(source?.name || "");
      // Load trigger phrases - merge from autoApplyQueries and description for backward compatibility
      const existingTriggers = source?.autoApplyQueries || [];
      const descKeywords = source?.description
        ? source.description.split(",").map((k: string) => k.trim()).filter((k: string) => k.length > 0)
        : [];
      // Merge and deduplicate: prefer autoApplyQueries, add description keywords that aren't already there
      const mergedTriggers = [...existingTriggers];
      for (const kw of descKeywords) {
        if (!mergedTriggers.some(t => t.toLowerCase() === kw.toLowerCase())) {
          mergedTriggers.push(kw);
        }
      }
      setTriggerPhrases(mergedTriggers);
      setNewTriggerPhrase("");
      setExclusionKeywords(source?.exclusionQueries || []);
      setNewExclusionKeyword("");
      setCategory(source?.category || "coding");
      setSystemPrompt(source?.systemPrompt || "");
      setUserTemplate(source?.userTemplate || "");
      setIcon(source?.ui?.icon || "Sparkles");
      setColor(source?.ui?.color || "blue");
      setActiveLabel(source?.ui?.activeLabel || "");
      setAutoTrigger(source?.trigger?.type ? source.trigger.type === "auto" : true);
      setRequireApproval(source?.requireApproval || false);
    };

    // Call the async function
    loadExistingSkill().catch(console.error);

    // Clear prefilled data after a short delay to ensure state is applied
    // Use proper cleanup to prevent memory leaks
    if (prefilledData && !skill) {
      const timeoutId = setTimeout(() => {
        if (isMounted) {
          clearSkillEditorData();
        }
      }, PREFILL_CLEAR_DELAY_MS);

      return () => {
        isMounted = false;
        clearTimeout(timeoutId);
      };
    }

    return () => {
      isMounted = false;
    };
  }, [open, skill, clearSkillEditorData]);

  const variables = useMemo(
    () => buildVariablesFromTemplate(userTemplate, skill?.variables),
    [userTemplate, skill?.variables]
  );

  // Get API keys and embedding settings for auto-generating embeddings
  const { getKeyForProvider } = useApiKeysStore();
  const { embeddingsProvider, embeddingsModelId } = useSettingsStore();

  const handleAddTriggerPhrase = () => {
    const phrase = newTriggerPhrase.trim();
    if (!phrase) return;
    if (triggerPhrases.some(t => t.toLowerCase() === phrase.toLowerCase())) {
      toast.error("Trigger phrase already exists");
      return;
    }
    setTriggerPhrases([...triggerPhrases, phrase]);
    setNewTriggerPhrase("");
  };

  const handleRemoveTriggerPhrase = (phrase: string) => {
    setTriggerPhrases(triggerPhrases.filter((p) => p !== phrase));
  };

  const handleAddExclusionKeyword = () => {
    const keyword = newExclusionKeyword.trim();
    if (!keyword) return;
    if (exclusionKeywords.includes(keyword)) {
      toast.error("Exclusion already exists");
      return;
    }
    setExclusionKeywords([...exclusionKeywords, keyword]);
    setNewExclusionKeyword("");
  };

  const handleRemoveExclusionKeyword = (keyword: string) => {
    setExclusionKeywords(exclusionKeywords.filter((k) => k !== keyword));
  };

  const handleSave = async () => {
    if (!name.trim()) return toast.error("Name is required");
    if (autoTrigger && triggerPhrases.length === 0) return toast.error("At least one trigger phrase is required for auto-trigger skills");
    if (!systemPrompt.trim()) return toast.error("System prompt is required");

    // Auto-generate description from trigger phrases (for display and backward compat)
    const description = triggerPhrases.slice(0, MAX_TRIGGER_PHRASES_IN_DESCRIPTION).join(", ");

    setSaving(true);
    try {
      const trigger: SkillTrigger = { type: autoTrigger ? "auto" : "manual" };
      const ui: SkillUI = {
        icon,
        color,
        activeLabel: activeLabel.trim() || `Using ${name.trim()}...`,
      };

      let savedSkill: Skill | null = null;
      const targetId = useUIStore.getState().skillEditorTargetId;
      
      // Check if we're editing an existing skill (via skill prop or targetId)
      const existingSkill = skill || (targetId ? await getSkillById(targetId) : null);
      const triggersChanged = existingSkill ? JSON.stringify(existingSkill.autoApplyQueries || []) !== JSON.stringify(triggerPhrases) : false;

      if (existingSkill) {
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
          exclusionQueries: exclusionKeywords.length > 0 ? exclusionKeywords : undefined,
          ui,
        });
        // For updates, we need to regenerate embedding if triggers changed
        if (triggersChanged) {
          savedSkill = {
            ...existingSkill,
            name: name.trim(),
            description,
            category,
            systemPrompt,
            userTemplate: userTemplate.trim() || undefined,
            variables: variables.length > 0 ? variables : undefined,
            trigger,
            ui,
            autoApplyQueries: triggerPhrases,
          } as Skill;
        }
        toast.success("Skill updated");
      } else {
        savedSkill = await addSkill({
          name: name.trim(),
          description,
          category,
          systemPrompt,
          userTemplate: userTemplate.trim() || undefined,
          variables: variables.length > 0 ? variables : undefined,
          trigger,
          requireApproval,
          autoApplyQueries: triggerPhrases.length > 0 ? triggerPhrases : undefined,
          exclusionQueries: exclusionKeywords.length > 0 ? exclusionKeywords : undefined,
          ui,
          isBuiltIn: false,
          isEnabled: true,
          isFavorite: false,
        });
        toast.success("Skill created");
      }

      // Auto-generate embeddings for trigger phrases if we have API key
      if (savedSkill && embeddingsProvider && embeddingsModelId && triggerPhrases.length > 0) {
        const apiKeyObj = getKeyForProvider(embeddingsProvider);
        if (apiKeyObj?.key) {
          try {
            // Import and use the query embedding function
            const { setSkillAutoApplyQueries, setSkillExclusionQueries } = await import("@/lib/db/queries");

            let triggerSuccess: { success: boolean; error?: unknown; failedCount?: number } = { success: true, failedCount: 0 };
            let exclusionSuccess: { success: boolean; error?: unknown; failedCount?: number } = { success: true, failedCount: 0 };
            let descriptionSuccess = true;

            const totalSteps = 2 + (exclusionKeywords.length > 0 ? 1 : 0);
            let currentStep = 0;

            // Generate trigger phrase embeddings
            try {
              currentStep++;
              setEmbeddingProgress(`Generating trigger embeddings (${currentStep}/${totalSteps})...`);
              triggerSuccess = await setSkillAutoApplyQueries(
                savedSkill.id,
                triggerPhrases,
                apiKeyObj.key,
                embeddingsProvider,
                embeddingsModelId
              );
            } catch (triggerError) {
              const classified = classifyError(triggerError, "Trigger embedding generation");
              console.error("Failed to generate trigger embeddings:", classified);
              toast.error(formatErrorMessage(classified));
              triggerSuccess = { success: false, failedCount: triggerPhrases.length };
            }

            // Generate exclusion embeddings if any
            if (exclusionKeywords.length > 0) {
              try {
                currentStep++;
                setEmbeddingProgress(`Generating exclusion embeddings (${currentStep}/${totalSteps})...`);
                exclusionSuccess = await setSkillExclusionQueries(
                  savedSkill.id,
                  exclusionKeywords,
                  apiKeyObj.key,
                  embeddingsProvider,
                  embeddingsModelId
                );
              } catch (exclusionError) {
                const classified = classifyError(exclusionError, "Exclusion embedding generation");
                console.error("Failed to generate exclusion embeddings:", classified);
                toast.warning(formatErrorMessage(classified));
                exclusionSuccess = { success: false, failedCount: exclusionKeywords.length };
              }
            }

            // Also generate description embedding for backward compat
            try {
              currentStep++;
              setEmbeddingProgress(`Finalizing (${currentStep}/${totalSteps})...`);
              await generateSkillEmbedding(
                savedSkill,
                apiKeyObj.key,
                embeddingsProvider,
                embeddingsModelId
              );
            } catch (descError) {
              const classified = classifyError(descError, "Description embedding generation");
              console.error("Failed to generate description embedding:", classified);
              descriptionSuccess = false;
            }

            setEmbeddingProgress(null);

            // Show appropriate success/warning message
            const totalFailed = (triggerSuccess.failedCount || 0) + (exclusionSuccess.failedCount || 0);
            const totalAttempted = triggerPhrases.length + exclusionKeywords.length;

            if (!triggerSuccess.success && !exclusionSuccess.success && !descriptionSuccess) {
              toast.error(
                "Skill saved, but all embeddings failed to generate. Check your API key in Settings > API Keys."
              );
            } else if (totalFailed > 0) {
              toast.warning(
                `Skill saved. ${totalFailed} of ${totalAttempted} embeddings failed. Auto-trigger may not work correctly.`
              );
            } else {
              toast.success("Skill and embeddings generated successfully");
            }
          } catch (embError) {
            setEmbeddingProgress(null);
            const classified = classifyError(embError, "Embedding generation");
            console.error("Failed to generate embeddings:", classified);
            toast.error(formatErrorMessage(classified));
          }
        } else {
          toast.warning(
            "Skill saved without embeddings. Configure API key in Settings > API Keys to enable auto-trigger."
          );
        }
      }

      onOpenChange(false);
    } catch {
      toast.error("Failed to save skill");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Skill" : "New Skill"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Basic Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Code Review"
              />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as Skill["category"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {SKILL_CATEGORY_CONFIG[c]?.label || c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Trigger Phrases - only show for auto-trigger skills */}
          {autoTrigger && (
            <div className="space-y-2">
              <Label>
                Trigger Phrases <span className="text-muted-foreground text-xs">(queries that activate this skill)</span>
              </Label>

              {triggerPhrases.length > 0 && (
                <div className="flex flex-wrap gap-2 p-2 rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30">
                  {triggerPhrases.map((phrase, index) => (
                    <Badge
                      key={index}
                      variant="secondary"
                      className="gap-1 pr-1 text-sm bg-green-100 dark:bg-green-900/50"
                    >
                      {phrase}
                      <button
                        type="button"
                        onClick={() => handleRemoveTriggerPhrase(phrase)}
                        className="ml-1 rounded-full p-0.5 hover:bg-destructive/20 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <Input
                  value={newTriggerPhrase}
                  onChange={(e) => setNewTriggerPhrase(e.target.value)}
                  placeholder="e.g., Generate an AI image of..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddTriggerPhrase();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleAddTriggerPhrase}
                  disabled={!newTriggerPhrase.trim()}
                  className="border-green-300 hover:bg-green-50 dark:border-green-700"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                Add example queries that should trigger this skill. More examples = better matching.
              </p>
            </div>
          )}

          {/* Exclusion Queries (Negative Examples) - only show for auto-trigger skills */}
          {autoTrigger && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Label>
                  Exclusion Queries <span className="text-muted-foreground text-xs">(negative examples)</span>
                </Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-xs">
                        Exclusion queries reduce the match score by applying a penalty to prevent false positives.
                        Use these to specify queries that should NOT trigger this skill.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              {exclusionKeywords.length > 0 && (
                <div className="flex flex-wrap gap-2 p-2 rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30">
                  {exclusionKeywords.map((keyword, index) => (
                    <Badge
                      key={index}
                      variant="secondary"
                      className="gap-1 pr-1 text-sm bg-red-100 dark:bg-red-900/50"
                    >
                      {keyword}
                      <button
                        type="button"
                        onClick={() => handleRemoveExclusionKeyword(keyword)}
                        className="ml-1 rounded-full p-0.5 hover:bg-destructive/20 hover:text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <Input
                  value={newExclusionKeyword}
                  onChange={(e) => setNewExclusionKeyword(e.target.value)}
                  placeholder="e.g., Build a website..."
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddExclusionKeyword();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleAddExclusionKeyword}
                  disabled={!newExclusionKeyword.trim()}
                  className="border-red-300 hover:bg-red-50 dark:border-red-700"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                Queries that should NOT trigger this skill. These penalize the match score to prevent false positives.
              </p>
            </div>
          )}

          {/* System Prompt */}
          <div className="space-y-2">
            <Label>System Prompt</Label>
            <Textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="min-h-[180px] font-mono text-sm"
              placeholder="Instructions for the AI when this skill is active..."
            />
          </div>

          {/* User Template (Optional) */}
          <div className="space-y-2">
            <Label>
              User Template <span className="text-muted-foreground text-xs">(optional)</span>
            </Label>
            <Textarea
              value={userTemplate}
              onChange={(e) => setUserTemplate(e.target.value)}
              className="min-h-[100px] font-mono text-sm"
              placeholder="Optional template with {{variables}}"
            />
            {variables.length > 0 && (
              <div className="rounded-lg border p-3 text-sm">
                <div className="font-medium mb-2">Detected variables</div>
                <div className="flex flex-wrap gap-2">
                  {variables.map((v) => (
                    <span key={v.name} className="rounded bg-muted px-2 py-0.5 text-xs">
                      {`{{${v.name}}}`}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* UI Settings */}
          <div className="space-y-4 rounded-lg border p-4">
            <h4 className="font-medium text-sm">Appearance</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Icon</Label>
                <Select value={icon} onValueChange={setIcon}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ICONS.map((i) => (
                      <SelectItem key={i} value={i}>
                        {i}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Color</Label>
                <Select value={color} onValueChange={setColor}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COLORS.map((c) => (
                      <SelectItem key={c} value={c}>
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${SKILL_COLORS[c]?.split(" ")[0]}`} />
                          {c}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Active Label</Label>
                <Input
                  value={activeLabel}
                  onChange={(e) => setActiveLabel(e.target.value)}
                  placeholder="e.g., Reviewing code..."
                />
              </div>
            </div>
          </div>

          {/* Trigger Settings */}
          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Auto-trigger</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Automatically activate this skill based on message content
                </p>
              </div>
              <Switch checked={autoTrigger} onCheckedChange={setAutoTrigger} />
            </div>

            <div className="flex items-center justify-between pt-3 border-t">
              <div>
                <Label>Require Approval</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Show draft and ask for confirmation before using tools
                </p>
              </div>
              <Switch checked={requireApproval} onCheckedChange={setRequireApproval} />
            </div>
          </div>

          {/* Embedding Progress Indicator */}
          {embeddingProgress && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-3">
              <div className="flex items-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
                <span className="text-sm text-blue-700 dark:text-blue-300">{embeddingProgress}</span>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving || !!embeddingProgress}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !!embeddingProgress}>
              {saving ? "Saving..." : embeddingProgress ? embeddingProgress : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
