"use client";

import { useMemo, useState, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Trash2,
  Pencil,
  Plus,
  Star,
  FileText,
  BarChart3,
  GitBranch,
  Image,
  Code,
  Bug,
  Scale,
  Layers,
  Sparkles,
  Search,
  PenLine,
  Wand2,
  Loader2,
  Zap,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import type { Skill } from "@/lib/db/schema";
import {
  getAllSkills,
  deleteSkill,
  toggleSkillFavorite,
  toggleSkillEnabled,
} from "@/lib/db/queries";
import { SkillEditorDialog } from "@/components/settings/skill-editor-dialog";
import { SKILL_COLORS, SKILL_CATEGORY_CONFIG } from "@/lib/constants/skills";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useApiKeysStore } from "@/stores/api-keys-store";
import { useSettingsStore } from "@/stores/settings-store";
import { regenerateAllEmbeddings } from "@/lib/skills/skill-embeddings";
import { db } from "@/lib/db/schema";

// Embedding models by provider
const EMBEDDING_MODELS: Record<
  string,
  { id: string; name: string; dimensions: number }[]
> = {
  openai: [
    { id: "text-embedding-3-small", name: "text-embedding-3-small", dimensions: 1536 },
    { id: "text-embedding-3-large", name: "text-embedding-3-large", dimensions: 3072 },
  ],
  openrouter: [
    { id: "openai/text-embedding-3-small", name: "text-embedding-3-small", dimensions: 1536 },
    { id: "openai/text-embedding-3-large", name: "text-embedding-3-large", dimensions: 3072 },
  ],
};

// Map icon names to Lucide icons
const ICON_MAP: Record<string, React.ElementType> = {
  FileText,
  BarChart3,
  GitBranch,
  Image,
  Code,
  Bug,
  Scale,
  Layers,
  Sparkles,
  Search,
  PenLine,
  Wand2,
};

function getSkillIcon(iconName: string, className?: string) {
  const IconComponent = ICON_MAP[iconName] || Sparkles;
  return <IconComponent className={className || "h-4 w-4"} />;
}

export function SkillsSettings() {
  const [query, setQuery] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const { getKeyForProvider, keys } = useApiKeysStore();
  const { embeddingsProvider, embeddingsModelId, skillMatchThreshold, updateEmbeddingsConfig, updateSkillMatchThreshold } = useSettingsStore();
  const skills = useLiveQuery(() => getAllSkills(), []);
  const embeddingCount = useLiveQuery(() => db.skillEmbeddings.count(), []);

  // Get available providers based on configured API keys
  const availableProviders = useMemo(() => {
    const providers: { id: string; name: string }[] = [];
    if (keys.some((k) => k.provider === "openai")) {
      providers.push({ id: "openai", name: "OpenAI" });
    }
    if (keys.some((k) => k.provider === "openrouter")) {
      providers.push({ id: "openrouter", name: "OpenRouter" });
    }
    return providers;
  }, [keys]);

  // State for selected provider and model
  const [selectedProvider, setSelectedProvider] = useState<string>("");
  const [selectedModel, setSelectedModel] = useState<string>("");

  // Initialize from saved settings when available
  useEffect(() => {
    if (embeddingsProvider && !selectedProvider) {
      setSelectedProvider(embeddingsProvider);
    } else if (availableProviders.length > 0 && !selectedProvider) {
      setSelectedProvider(availableProviders[0].id);
    }
  }, [embeddingsProvider, availableProviders, selectedProvider]);

  useEffect(() => {
    if (embeddingsModelId && !selectedModel) {
      setSelectedModel(embeddingsModelId);
    } else if (selectedProvider && !selectedModel) {
      const models = EMBEDDING_MODELS[selectedProvider] || [];
      if (models.length > 0) {
        setSelectedModel(models[0].id);
      }
    }
  }, [embeddingsModelId, selectedProvider, selectedModel]);

  // Get models for selected provider
  const availableModels = useMemo(() => {
    return EMBEDDING_MODELS[selectedProvider] || [];
  }, [selectedProvider]);

  // Update model when provider changes
  const handleProviderChange = (providerId: string) => {
    setSelectedProvider(providerId);
    const models = EMBEDDING_MODELS[providerId] || [];
    setSelectedModel(models[0]?.id || "");
  };

  // Determine if we need to regenerate (model changed or no embeddings)
  const hasEmbeddings = embeddingCount !== undefined && embeddingCount > 0;
  const modelChanged = hasEmbeddings && (
    selectedProvider !== embeddingsProvider ||
    selectedModel !== embeddingsModelId
  );
  const needsGeneration = !hasEmbeddings || modelChanged;

  const handleGenerateEmbeddings = async () => {
    const enabledSkills = skills?.filter((s) => s.isEnabled) || [];
    if (enabledSkills.length === 0) {
      toast.error("No enabled skills to generate embeddings for");
      return;
    }

    if (!selectedProvider || !selectedModel) {
      toast.error("Please select a provider and model");
      return;
    }

    const apiKeyObj = getKeyForProvider(selectedProvider);
    if (!apiKeyObj?.key) {
      toast.error(`Please add an API key for ${selectedProvider}`);
      return;
    }

    setIsGenerating(true);

    try {
      const result = await regenerateAllEmbeddings(
        apiKeyObj.key,
        selectedProvider,
        selectedModel,
        true // Force regeneration
      );

      // Save the config
      if (result.generated > 0) {
        await updateEmbeddingsConfig(
          selectedProvider as "openrouter" | "openai",
          selectedModel
        );
      }

      if (result.failed > 0) {
        toast.warning(
          `Generated ${result.generated} embeddings, ${result.failed} failed`
        );
      } else {
        toast.success(`Generated embeddings for ${result.generated} skills`);
      }
    } catch (error) {
      console.error("Failed to generate embeddings:", error);
      toast.error("Failed to generate embeddings");
    } finally {
      setIsGenerating(false);
    }
  };

  const filtered = useMemo(() => {
    const list = skills || [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q)
    );
  }, [skills, query]);

  const handleDelete = async (skill: Skill) => {
    if (skill.isBuiltIn) {
      toast.error("Built-in skills cannot be deleted");
      return;
    }
    if (!confirm(`Delete skill "${skill.name}"?`)) return;
    await deleteSkill(skill.id);
    toast.success("Skill deleted");
  };

  const handleToggleFavorite = async (skill: Skill) => {
    await toggleSkillFavorite(skill.id);
  };

  const handleToggleEnabled = async (skill: Skill) => {
    await toggleSkillEnabled(skill.id);
  };

  // Format model name for display
  const formatModelName = (modelId: string) => {
    return modelId.replace("openai/", "");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-medium">Skills</h3>
          <p className="text-sm text-muted-foreground">
            Skills enhance responses with specialized prompts.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingSkill(null);
            setEditorOpen(true);
          }}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          New Skill
        </Button>
      </div>

      {/* Embedding Model Selection */}
      <div className="rounded-lg border p-4 space-y-4">
        <div>
          <h4 className="font-medium">Embedding Model</h4>
          <p className="text-sm text-muted-foreground">
            Select the model used for skill auto-detection
          </p>
        </div>

        {availableProviders.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Add an OpenAI or OpenRouter API key to enable embeddings.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Provider</Label>
                <Select
                  value={selectedProvider}
                  onValueChange={handleProviderChange}
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableProviders.map((provider) => (
                      <SelectItem key={provider.id} value={provider.id}>
                        {provider.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Model</Label>
                <Select
                  value={selectedModel}
                  onValueChange={setSelectedModel}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableModels.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                onClick={handleGenerateEmbeddings}
                disabled={isGenerating || !skills?.length || !selectedProvider || !selectedModel}
                className="gap-2"
                variant={modelChanged ? "default" : "outline"}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : modelChanged ? (
                  <>
                    <RefreshCw className="h-4 w-4" />
                    Regenerate
                  </>
                ) : hasEmbeddings ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Regenerate
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4" />
                    Generate
                  </>
                )}
              </Button>
            </div>

            {/* Status */}
            <div className="flex items-center gap-2 text-sm">
              {hasEmbeddings ? (
                modelChanged ? (
                  <>
                    <AlertCircle className="h-4 w-4 text-amber-500" />
                    <span className="text-amber-600">
                      Model changed — click Regenerate to update {embeddingCount} skill{embeddingCount !== 1 ? "s" : ""}
                    </span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <span className="text-muted-foreground">
                      {embeddingCount} skill{embeddingCount !== 1 ? "s" : ""} embedded with {formatModelName(embeddingsModelId || "")}
                    </span>
                  </>
                )
              ) : (
                <>
                  <AlertCircle className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    No embeddings generated yet
                  </span>
                </>
              )}
            </div>

            {/* Threshold Slider */}
            <div className="pt-2 border-t space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Match Threshold</Label>
                <span className="text-xs text-muted-foreground font-mono">
                  {Math.round((skillMatchThreshold ?? 0.5) * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="30"
                max="80"
                value={Math.round((skillMatchThreshold ?? 0.5) * 100)}
                onChange={(e) => updateSkillMatchThreshold(parseInt(e.target.value) / 100)}
                className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
              />
              <p className="text-xs text-muted-foreground">
                Lower = more skills trigger, Higher = stricter matching
              </p>
            </div>
          </>
        )}
      </div>

      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search skills..."
      />

      <div className="space-y-2">
        {filtered?.map((skill) => (
          <SkillSettingsItem
            key={skill.id}
            skill={skill}
            onEdit={() => {
              setEditingSkill(skill);
              setEditorOpen(true);
            }}
            onDelete={() => handleDelete(skill)}
            onToggleFavorite={() => handleToggleFavorite(skill)}
            onToggleEnabled={() => handleToggleEnabled(skill)}
          />
        ))}
        {filtered && filtered.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8">
            No skills found.
          </div>
        ) : null}
      </div>

      <SkillEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        skill={editingSkill}
      />
    </div>
  );
}

interface SkillSettingsItemProps {
  skill: Skill;
  onEdit: () => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
  onToggleEnabled: () => void;
}

function SkillSettingsItem({
  skill,
  onEdit,
  onDelete,
  onToggleFavorite,
  onToggleEnabled,
}: SkillSettingsItemProps) {
  const colorClasses = SKILL_COLORS[skill.ui.color] || SKILL_COLORS.blue;
  const categoryConfig = SKILL_CATEGORY_CONFIG[skill.category];

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 rounded-lg border p-3",
        !skill.isEnabled && "opacity-50"
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className={cn("rounded p-2 shrink-0", colorClasses)}>
          {getSkillIcon(skill.ui.icon)}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="font-medium truncate">{skill.name}</div>
            {skill.isBuiltIn && <Badge variant="secondary">Built-in</Badge>}
            {skill.trigger.type === "auto" && (
              <Badge variant="outline" className="text-xs">
                Auto
              </Badge>
            )}
            {categoryConfig && (
              <Badge variant="outline" className="text-xs">
                {categoryConfig.label}
              </Badge>
            )}
          </div>
          <div className="mt-1 text-xs text-muted-foreground line-clamp-1">
            {skill.description.split(",").slice(0, 3).join(", ")}
          </div>
          {skill.usageCount > 0 && (
            <div className="mt-1 text-xs text-muted-foreground">
              Used {skill.usageCount} time{skill.usageCount !== 1 ? "s" : ""}
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 flex items-center gap-2">
        <Switch
          checked={skill.isEnabled}
          onCheckedChange={onToggleEnabled}
          title={skill.isEnabled ? "Disable skill" : "Enable skill"}
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleFavorite}
          title={skill.isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          <Star
            className={
              skill.isFavorite
                ? "h-4 w-4 fill-current text-yellow-500"
                : "h-4 w-4"
            }
          />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onEdit}
          title="Edit skill"
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onDelete}
          disabled={skill.isBuiltIn}
          title={skill.isBuiltIn ? "Built-in skills cannot be deleted" : "Delete skill"}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
