"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Search, Star, ChevronRight, ChevronDown, RefreshCcw,
  Code, Zap, DollarSign, Brain, BookOpen, Palette,
  Eye, Sparkles, Crown, Gauge, Image as ImageIcon,
  ArrowRight, Check, Clock, MessageSquare, Wrench
} from "lucide-react";
import { type Model, getModelById, USE_CASE_RECOMMENDATIONS, MODEL_CATALOG } from "@/lib/constants/models";
import { cn } from "@/lib/utils";
import { Virtuoso } from "react-virtuoso";
import { ModelItem, formatModelCost, CapabilityBadges } from "./model-item";
import {
  getFavoriteModels,
  getRecentModels,
  toggleModelFavorite,
  updateModelLastUsed,
} from "@/lib/db/queries";
import { useModelSettingsStore } from "@/stores/model-settings-store";
import { ParameterPresets } from "@/components/settings/parameter-presets";
import { useModelsStore } from "@/stores/models-store";
import { useApiKeysStore } from "@/stores/api-keys-store";
import { isModelIdCompatibleWithProviderId, pickBestProviderId, providerLabel } from "@/lib/ai/provider-routing";
import { getRankingService } from "@/lib/models/ranking/ranking-service";
import { getModelCapabilities } from "@/lib/constants/model-capabilities";
import { toast } from "sonner";
import Fuse from "fuse.js";
import { localDetector } from "@/lib/providers/local-detector";


interface ModelPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentModelId: string;
  onSelectModel: (modelId: string) => void;
  currentProviderId?: string;
  onSelectProviderId?: (providerId: string | undefined) => void;
}

// Tier badge component
function TierBadge({ tier }: { tier?: string }) {
  if (!tier) return null;

  const config = {
    flagship: { label: "Flagship", className: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
    balanced: { label: "Balanced", className: "bg-blue-500/10 text-blue-500 border-blue-500/20" },
    fast: { label: "Fast", className: "bg-orange-500/10 text-orange-500 border-orange-500/20" },
    budget: { label: "Budget", className: "bg-green-500/10 text-green-500 border-green-500/20" },
  }[tier];

  if (!config) return null;

  return (
    <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full border font-medium", config.className)}>
      {config.label}
    </span>
  );
}

// Quick pick card component
function QuickPickCard({
  model,
  intent,
  icon: Icon,
  color,
  isSelected,
  onClick,
  routingProvider,
}: {
  model: Model;
  intent: string;
  icon: React.ElementType;
  color: string;
  isSelected: boolean;
  onClick: () => void;
  routingProvider?: string;
}) {
  const costDisplay = formatModelCost(model.inputCost, model.outputCost);
  // Show routing provider if different from model vendor
  const showRouting = routingProvider && routingProvider.toLowerCase() !== model.provider.toLowerCase();

  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex flex-col items-start p-3 rounded-xl border-2 transition-all text-left w-full group",
        "hover:scale-[1.02] hover:shadow-lg",
        isSelected
          ? "border-primary bg-primary/5 shadow-md"
          : "border-border/50 hover:border-border bg-card/50 hover:bg-card"
      )}
    >
      {isSelected && (
        <div className="absolute top-2 right-2">
          <Check className="h-4 w-4 text-primary" />
        </div>
      )}

      <div className={cn("p-1.5 rounded-lg mb-2", color)}>
        <Icon className="h-4 w-4" />
      </div>

      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
        {intent}
      </span>

      <span className="font-semibold text-sm truncate w-full">
        {model.name}
      </span>

      <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground">
        <span className={model.inputCost === 0 ? "text-green-500 font-medium" : ""}>
          {costDisplay}
        </span>
        {model.tier && <TierBadge tier={model.tier} />}
        {showRouting && (
          <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
            via {routingProvider}
          </span>
        )}
      </div>
    </button>
  );
}

export function ModelPickerDialog({
  open,
  onOpenChange,
  currentModelId,
  onSelectModel,
  currentProviderId,
  onSelectProviderId,
}: ModelPickerDialogProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedApiProvider, setSelectedApiProvider] = useState<string>(currentProviderId || "auto");
  const [sortBy, setSortBy] = useState<string>("default");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [manualModelId, setManualModelId] = useState<string>(currentModelId);
  const [showAllModels, setShowAllModels] = useState(false);

  const { models, isLoading: modelsLoading, fetchedAt, loadModels } = useModelsStore();
  const keys = useApiKeysStore((s) => s.keys);
  const rankingService = getRankingService();
  const [localModels, setLocalModels] = useState<Array<{ id: string; name: string; provider: string; baseUrl: string }>>([]);

  // Fetch local models
  useEffect(() => {
    if (!open) return;

    const fetchLocalModels = async () => {
      const ollamaStatus = localDetector.getStatus("ollama");
      const lmstudioStatus = localDetector.getStatus("lmstudio");

      const local: Array<{ id: string; name: string; provider: string; baseUrl: string }> = [];

      if (ollamaStatus?.connected && ollamaStatus.availableModels) {
        ollamaStatus.availableModels.forEach(modelName => {
          local.push({
            id: `ollama/${modelName}`,
            name: modelName,
            provider: "ollama",
            baseUrl: ollamaStatus.baseUrl,
          });
        });
      }

      if (lmstudioStatus?.connected && lmstudioStatus.availableModels) {
        lmstudioStatus.availableModels.forEach(modelId => {
          local.push({
            id: `lmstudio/${modelId}`,
            name: modelId,
            provider: "lmstudio",
            baseUrl: lmstudioStatus.baseUrl,
          });
        });
      }

      setLocalModels(local);
    };

    fetchLocalModels();
    const interval = setInterval(fetchLocalModels, 5000);
    return () => clearInterval(interval);
  }, [open]);

  useEffect(() => setManualModelId(currentModelId), [currentModelId, open]);

  const {
    currentSettings,
    updateSettings,
    setSystemPrompt
  } = useModelSettingsStore();

  // Load favorites and recent models from Dexie
  const favoriteModels = useLiveQuery(() => getFavoriteModels(), []);
  const recentModels = useLiveQuery(() => getRecentModels(5), []);

  const llmProviderIds = useMemo(
    () =>
      Array.from(
        new Set(
          keys
            .map((k) => k.provider)
            .filter((p) =>
              ["openrouter", "openai", "anthropic", "google", "deepseek", "mistral", "xai", "groq", "together", "perplexity", "anyscale", "ollama", "lmstudio"].includes(p) ||
              p.startsWith("custom-openai:")
            )
        )
      ),
    [keys]
  );

  const llmProviderOptions = useMemo(() => {
    return Array.from(
      new Map(
        keys
          .filter((k) =>
            ["openrouter", "openai", "anthropic", "google", "deepseek", "mistral", "xai", "groq", "together", "perplexity", "anyscale", "ollama", "lmstudio"].includes(k.provider) ||
            k.provider.startsWith("custom-openai:")
          )
          .map((k) => [k.provider, { id: k.provider, name: k.label || providerLabel(k.provider) }] as const)
      ).values()
    );
  }, [keys]);

  const modelById = useMemo(() => new Map(models.map((m) => [m.id, m] as const)), [models]);

  const bestProviderByModelId = useMemo(() => {
    const map = new Map<string, string | null>();
    if (!open) return map;
    for (const model of models) {
      map.set(
        model.id,
        pickBestProviderId({ modelId: model.id, availableProviderIds: llmProviderIds })
      );
    }
    return map;
  }, [open, models, llmProviderIds]);

  // Check if OpenRouter is available
  const hasOpenRouter = llmProviderIds.includes("openrouter");
  const canUseAnyModel = hasOpenRouter || currentProviderId === "openrouter";

  // Create Fuse.js instance for fuzzy search
  const fuse = useMemo(() => {
    if (!open || models.length === 0) return null;
    return new Fuse(models, {
      keys: [
        { name: "name", weight: 0.5 },
        { name: "id", weight: 0.3 },
        { name: "provider", weight: 0.15 },
        { name: "description", weight: 0.05 },
      ],
      threshold: 0.4,
      distance: 100,
      ignoreLocation: true,
      includeScore: true,
      minMatchCharLength: 2,
      useExtendedSearch: false,
      findAllMatches: true,
    });
  }, [models, open]);

  // Helper to get the best model for a use case (respects selected provider)
  const getBestModelForUseCase = useCallback((useCase: string): Model | null => {
    const rec = USE_CASE_RECOMMENDATIONS[useCase];
    if (!rec) return null;

    for (const id of rec.models) {
      const model = models.find(m => m.id === id) || MODEL_CATALOG.find(m => m.id === id);
      if (!model) continue;

      // If specific provider is selected, check compatibility
      if (selectedApiProvider !== "auto") {
        if (isModelIdCompatibleWithProviderId(selectedApiProvider, id)) {
          return model;
        }
        continue;
      }

      // Auto mode: check if any provider can handle it
      if (bestProviderByModelId.get(id)) return model;

      // If OpenRouter is available, use catalog
      if (canUseAnyModel) return model;
    }
    return null;
  }, [models, bestProviderByModelId, canUseAnyModel, selectedApiProvider]);

  // Quick pick models for each intent (respects selected provider)
  const quickPicks = useMemo(() => {
    if (!open) return [];

    const picks: Array<{ model: Model; intent: string; icon: React.ElementType; color: string }> = [];

    const coding = getBestModelForUseCase("coding");
    if (coding) picks.push({ model: coding, intent: "Code", icon: Code, color: "bg-blue-500/10 text-blue-500" });

    const reasoning = getBestModelForUseCase("reasoning");
    if (reasoning) picks.push({ model: reasoning, intent: "Reason", icon: Brain, color: "bg-purple-500/10 text-purple-500" });

    // Tools/Agents quick pick - for MCP, Composio, function calling
    const toolCalling = getBestModelForUseCase("tool-calling");
    if (toolCalling) picks.push({ model: toolCalling, intent: "Tools", icon: Wrench, color: "bg-violet-500/10 text-violet-500" });

    const budget = getBestModelForUseCase("budget");
    if (budget) picks.push({ model: budget, intent: "Budget", icon: DollarSign, color: "bg-green-500/10 text-green-500" });

    return picks;
  }, [open, getBestModelForUseCase]);

  // Filter models
  const filteredModels = useMemo(() => {
    if (!open) return [];

    const q = searchQuery.trim();
    const categoryMapping: Record<string, string[]> = {
      "coding": ["coding"],
      "research": ["balanced", "reasoning"],
      "reasoning": ["reasoning"],
      "fast": ["fast"],
      "vision": ["vision"],
      "budget": ["cheap", "fast"],
      "image-gen": ["image-generation"],
      // Note: "tools" category uses toolCallingTier, not model.category
    };

    let searchMatches: Model[];
    if (!q) {
      searchMatches = models;
    } else if (fuse) {
      const results = fuse.search(q);
      searchMatches = results.map((r) => r.item);
    } else {
      const lowerQ = q.toLowerCase();
      searchMatches = models.filter((model) => {
        const haystack = `${model.name} ${model.id} ${model.provider} ${model.description || ""}`.toLowerCase();
        return haystack.includes(lowerQ);
      });
    }

    return searchMatches.filter((model) => {
      let matchesCategory = selectedCategory === "all";
      if (!matchesCategory) {
        // Special handling for Tools/Agents category - filter by toolCallingTier
        if (selectedCategory === "tools") {
          const caps = getModelCapabilities(model.id);
          // Only show models with advanced or elite tool calling tier
          matchesCategory = caps.toolCallingTier === "elite" || caps.toolCallingTier === "advanced";
        } else {
          const mappedCategories = categoryMapping[selectedCategory] || [selectedCategory];
          matchesCategory = mappedCategories.some(cat => model.category.includes(cat));
          if (selectedCategory === "reasoning" && model.supportsReasoning) {
            matchesCategory = true;
          }
          if (selectedCategory === "image-gen" && !matchesCategory) {
            const caps = getModelCapabilities(model.id);
            matchesCategory = caps.isImageGeneration;
          }
        }
      }

      if (!matchesCategory) return false;

      if (selectedApiProvider !== "auto") {
        if (!llmProviderIds.includes(selectedApiProvider)) return false;
        return isModelIdCompatibleWithProviderId(selectedApiProvider, model.id);
      }

      return bestProviderByModelId.get(model.id) != null;
    });
  }, [bestProviderByModelId, fuse, llmProviderIds, models, open, searchQuery, selectedCategory, selectedApiProvider]);

  const sortedModels = useMemo(() => {
    if (!open) return [];
    const hasSearchQuery = searchQuery.trim() !== "";

    if (sortBy === "cost") {
      return [...filteredModels].sort((a, b) => (a.inputCost + a.outputCost) - (b.inputCost + b.outputCost));
    }
    if (sortBy === "context") {
      return [...filteredModels].sort((a, b) => (b.contextLength || 0) - (a.contextLength || 0));
    }
    if (sortBy === "name") {
      return [...filteredModels].sort((a, b) => a.name.localeCompare(b.name));
    }
    if (hasSearchQuery) {
      return filteredModels;
    }

    // For tools category, apply tier-aware ranking (elite > advanced)
    if (selectedCategory === "tools") {
      const tierOrder: Record<string, number> = { elite: 0, advanced: 1, basic: 2, none: 3 };
      return [...filteredModels].sort((a, b) => {
        const aTier = getModelCapabilities(a.id).toolCallingTier;
        const bTier = getModelCapabilities(b.id).toolCallingTier;
        const tierDiff = (tierOrder[aTier] ?? 3) - (tierOrder[bTier] ?? 3);
        if (tierDiff !== 0) return tierDiff;
        // Secondary sort by name within same tier
        return a.name.localeCompare(b.name);
      });
    }

    return rankingService.rankModels(filteredModels, {
      useCase: selectedCategory !== "all" ? selectedCategory : undefined,
    });
  }, [filteredModels, open, rankingService, searchQuery, selectedCategory, sortBy]);

  // Recent + favorite models
  const favoriteModelObjects = useMemo(() => {
    const list = (favoriteModels || [])
      .map((fav) => modelById.get(fav.id) || getModelById(fav.id))
      .filter((m): m is Model => m !== undefined);

    if (currentProviderId) {
      if (!llmProviderIds.includes(currentProviderId)) return [];
      return list.filter((m) => isModelIdCompatibleWithProviderId(currentProviderId, m.id));
    }
    return list.filter((m) => bestProviderByModelId.get(m.id) != null);
  }, [bestProviderByModelId, currentProviderId, favoriteModels, llmProviderIds, modelById]);

  const recentModelObjects = useMemo(() => {
    const list = (recentModels || [])
      .map((rec) => modelById.get(rec.id) || getModelById(rec.id))
      .filter((m): m is Model => m !== undefined);

    if (currentProviderId) {
      if (!llmProviderIds.includes(currentProviderId)) return [];
      return list.filter((m) => isModelIdCompatibleWithProviderId(currentProviderId, m.id));
    }
    return list.filter((m) => bestProviderByModelId.get(m.id) != null);
  }, [bestProviderByModelId, currentProviderId, llmProviderIds, modelById, recentModels]);

  const handleSelectModel = async (modelId: string) => {
    if (currentProviderId && !llmProviderIds.includes(currentProviderId)) {
      toast.error(`Missing API key for ${providerLabel(currentProviderId)}.`);
      return;
    }

    const autoProviderId = bestProviderByModelId.get(modelId) ?? null;
    if (!currentProviderId && !autoProviderId && !canUseAnyModel) {
      toast.error("No compatible provider configured for this model. Add an OpenRouter key to use it.");
      return;
    }

    await updateModelLastUsed(modelId);
    onSelectModel(modelId);
    onOpenChange(false);
  };

  const handleToggleFavorite = async (modelId: string, category: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const isFavorited = await toggleModelFavorite(modelId, category);
    toast.success(isFavorited ? "Added to favorites" : "Removed from favorites");
  };

  const isFavorite = (modelId: string) => {
    return favoriteModels?.some((fav) => fav.id === modelId) || false;
  };

  // Check if we're in search/filter mode
  const isSearching = searchQuery.trim() !== "" || selectedCategory !== "all" || selectedApiProvider !== "auto";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[90vh] max-h-[800px] flex flex-col p-0 gap-0 overflow-hidden bg-background border-border/50 shadow-2xl">
        {/* Header */}
        <div className="flex-none px-6 pt-6 pb-4 border-b bg-gradient-to-b from-muted/20 to-transparent">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div>
              <DialogTitle className="text-xl font-bold tracking-tight">Choose a Model</DialogTitle>
              <DialogDescription className="text-muted-foreground mt-1 text-sm">
                Pick the best AI for your task
              </DialogDescription>
            </div>
            <ParameterPresets />
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search models... (e.g., GPT-5, Claude, Gemini)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-11 bg-background border-border/60 focus:border-primary rounded-xl"
            />
          </div>

          {/* Provider Selector - Top Level */}
          {llmProviderOptions.length > 0 && (
            <div className="flex items-center gap-2 mt-4 overflow-x-auto no-scrollbar">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider shrink-0">Via:</span>
              <button
                onClick={() => {
                  setSelectedApiProvider("auto");
                  if (onSelectProviderId) onSelectProviderId(undefined);
                }}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap border",
                  selectedApiProvider === "auto"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted/50 hover:bg-muted border-border/50 hover:border-border text-muted-foreground"
                )}
              >
                Auto
              </button>
              {llmProviderOptions.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setSelectedApiProvider(p.id);
                    if (onSelectProviderId) onSelectProviderId(p.id);
                  }}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap border",
                    selectedApiProvider === p.id
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted/50 hover:bg-muted border-border/50 hover:border-border text-muted-foreground"
                  )}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Quick Picks - Show when not searching */}
          {!isSearching && quickPicks.length > 0 && (
            <div className="px-6 py-5 border-b bg-muted/5">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-4 w-4 text-amber-500" />
                <h3 className="text-sm font-semibold">Quick Pick</h3>
                <span className="text-xs text-muted-foreground">Recommended for your task</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {quickPicks.map(({ model, intent, icon, color }) => (
                  <QuickPickCard
                    key={model.id}
                    model={model}
                    intent={intent}
                    icon={icon}
                    color={color}
                    isSelected={model.id === currentModelId}
                    onClick={() => handleSelectModel(model.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Favorites & Recent */}
          {!isSearching && (favoriteModelObjects.length > 0 || recentModelObjects.length > 0) && (
            <div className="px-6 py-4 border-b">
              {favoriteModelObjects.length > 0 && (
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Star className="h-3.5 w-3.5 fill-yellow-500 text-yellow-500" />
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Favorites</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {favoriteModelObjects.slice(0, 6).map(model => (
                      <button
                        key={model.id}
                        onClick={() => handleSelectModel(model.id)}
                        className={cn(
                          "px-3 py-1.5 rounded-lg border text-sm font-medium transition-all",
                          model.id === currentModelId
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-card hover:bg-muted border-border/60 hover:border-border"
                        )}
                      >
                        {model.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {recentModelObjects.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recent</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {recentModelObjects.slice(0, 5).map(model => (
                      <button
                        key={model.id}
                        onClick={() => handleSelectModel(model.id)}
                        className={cn(
                          "px-3 py-1.5 rounded-lg border text-sm font-medium transition-all",
                          model.id === currentModelId
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-card/50 hover:bg-muted border-border/40 hover:border-border"
                        )}
                      >
                        {model.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Filters Bar */}
          <div className="px-6 py-3 border-b bg-muted/10 sticky top-0 z-10 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                {[
                  { id: "all", label: "All", icon: null },
                  { id: "coding", label: "Code", icon: Code },
                  { id: "reasoning", label: "Reasoning", icon: Brain },
                  { id: "tools", label: "Tools", icon: Wrench },
                  { id: "fast", label: "Fast", icon: Zap },
                  { id: "budget", label: "Budget", icon: DollarSign },
                  { id: "vision", label: "Vision", icon: Eye },
                  { id: "image-gen", label: "Images", icon: ImageIcon },
                ].map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setSelectedCategory(id)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap",
                      selectedCategory === id
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    )}
                  >
                    {Icon && <Icon className="h-3 w-3" />}
                    {label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="h-8 w-28 text-xs bg-background border-border/60">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Best Match</SelectItem>
                    <SelectItem value="name">Name</SelectItem>
                    <SelectItem value="cost">Lowest Cost</SelectItem>
                    <SelectItem value="context">Max Context</SelectItem>
                  </SelectContent>
                </Select>

                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2"
                  onClick={async () => {
                    const result = await loadModels({ refresh: true });
                    if (result.success) {
                      toast.success(`Refreshed ${result.count} models`);
                    } else {
                      toast.error("Failed to refresh", { description: result.error });
                    }
                  }}
                  disabled={modelsLoading}
                >
                  <RefreshCcw className={cn("h-4 w-4", modelsLoading && "animate-spin")} />
                </Button>
              </div>
            </div>
          </div>

          {/* Model List */}
          <div className="px-6 py-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {isSearching ? `${sortedModels.length} Results` : "All Models"}
              </h3>
              {fetchedAt && (
                <span className="text-[10px] text-muted-foreground">
                  Updated {new Date(fetchedAt).toLocaleTimeString()}
                </span>
              )}
            </div>

            {sortedModels.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>No models found</p>
                <p className="text-sm mt-1">Try adjusting your search or filters</p>
              </div>
            ) : (
              <div className="space-y-2">
                {sortedModels.slice(0, showAllModels ? undefined : 20).map(model => {
                  const caps = getModelCapabilities(model.id);
                  const costDisplay = formatModelCost(model.inputCost, model.outputCost);
                  const isSelected = model.id === currentModelId;
                  const isFav = isFavorite(model.id);

                  return (
                    <button
                      key={model.id}
                      onClick={() => handleSelectModel(model.id)}
                      className={cn(
                        "w-full text-left p-4 rounded-xl border transition-all",
                        "hover:shadow-md hover:border-border",
                        isSelected
                          ? "bg-primary/5 border-primary shadow-sm"
                          : "bg-card/50 border-border/40 hover:bg-card"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-sm">{model.name}</span>
                            {model.tier && <TierBadge tier={model.tier} />}
                            {isSelected && <Check className="h-4 w-4 text-primary" />}
                          </div>

                          <p className="text-xs text-muted-foreground line-clamp-1 mb-2">
                            {model.description || `${model.provider} model`}
                          </p>

                          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                            <span className={model.inputCost === 0 ? "text-green-500 font-medium" : ""}>
                              {costDisplay}
                            </span>

                            {model.contextLength > 0 && (
                              <span>{(model.contextLength / 1000).toFixed(0)}K ctx</span>
                            )}

                            <CapabilityBadges modelId={model.id} size="sm" />

                            <span className="text-muted-foreground/60">{model.provider}</span>

                            {/* Show routing provider if different from model vendor */}
                            {(() => {
                              const routingProvider = bestProviderByModelId.get(model.id);
                              if (!routingProvider) return null;
                              const routingLabel = providerLabel(routingProvider);
                              // Don't show if it matches the model vendor
                              if (routingLabel.toLowerCase() === model.provider.toLowerCase()) return null;
                              return (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                                  via {routingLabel}
                                </span>
                              );
                            })()}
                          </div>
                        </div>

                        <button
                          onClick={(e) => handleToggleFavorite(model.id, model.category[0] || "general", e)}
                          className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                        >
                          <Star className={cn(
                            "h-4 w-4 transition-colors",
                            isFav ? "fill-yellow-500 text-yellow-500" : "text-muted-foreground/40 hover:text-muted-foreground"
                          )} />
                        </button>
                      </div>
                    </button>
                  );
                })}

                {sortedModels.length > 20 && !showAllModels && (
                  <button
                    onClick={() => setShowAllModels(true)}
                    className="w-full py-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Show all {sortedModels.length} models
                    <ArrowRight className="inline h-4 w-4 ml-1" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex-none border-t bg-muted/10 p-2">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center justify-between w-full px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-all"
          >
            <span className="flex items-center gap-2">
              {showAdvanced ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              Advanced Settings
            </span>
          </button>

          {showAdvanced && (
            <div className="px-4 pb-4 pt-2 space-y-6 animate-in slide-in-from-bottom-2 duration-200 max-h-[300px] overflow-y-auto">
              {onSelectProviderId && (
                <div className="space-y-2">
                  <Label className="text-xs">Provider Routing</Label>
                  <Select
                    value={currentProviderId || "auto"}
                    onValueChange={(value) => onSelectProviderId(value === "auto" ? undefined : value)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Auto" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto (Recommended)</SelectItem>
                      {llmProviderOptions.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-xs">Manual Model ID</Label>
                <Input
                  className="h-9 font-mono text-xs"
                  placeholder="e.g., gpt-5.2 / claude-opus-4.5"
                  value={manualModelId}
                  onChange={(e) => setManualModelId(e.target.value)}
                  onBlur={() => {
                    const trimmed = manualModelId.trim();
                    if (trimmed && trimmed !== currentModelId) onSelectModel(trimmed);
                  }}
                />
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs">Temperature</Label>
                    <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">{currentSettings.temperature}</span>
                  </div>
                  <Slider
                    value={[currentSettings.temperature]}
                    max={2}
                    step={0.1}
                    onValueChange={([val]) => updateSettings({ temperature: val })}
                  />
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs">Max Tokens</Label>
                    <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">{currentSettings.maxTokens}</span>
                  </div>
                  <Slider
                    value={[currentSettings.maxTokens]}
                    min={256}
                    max={32000}
                    step={256}
                    onValueChange={([val]) => updateSettings({ maxTokens: val })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">System Prompt</Label>
                <Textarea
                  placeholder="You are a helpful assistant..."
                  value={currentSettings.systemPrompt || ''}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  className="h-[80px] text-xs resize-none"
                />
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
