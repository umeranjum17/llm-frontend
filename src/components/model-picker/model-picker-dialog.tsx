"use client";

import { useEffect, useMemo, useState } from "react";
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
import { Search, Star, Check, ChevronRight, ChevronDown, RefreshCcw, TrendingUp, Code, Zap, DollarSign, Brain, BookOpen, Eye, Wrench, Sparkles } from "lucide-react";
import { type Model, getModelById } from "@/lib/constants/models";
import { cn } from "@/lib/utils";
import { Virtuoso } from "react-virtuoso";
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
import { getRuleEngine } from "@/lib/models/rule-engine";
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
  // Use API provider (openrouter, anthropic, etc.) not model vendor
  const [selectedApiProvider, setSelectedApiProvider] = useState<string>(currentProviderId || "auto");
  const [sortBy, setSortBy] = useState<string>("default");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [manualModelId, setManualModelId] = useState<string>(currentModelId);

  const { models, isLoading: modelsLoading, fetchedAt, loadModels } = useModelsStore();
  const keys = useApiKeysStore((s) => s.keys);
  const ruleEngine = getRuleEngine();
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
              ["openrouter", "openai", "anthropic", "groq", "together", "perplexity", "anyscale", "ollama", "lmstudio"].includes(p) ||
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
            ["openrouter", "openai", "anthropic", "groq", "together", "perplexity", "anyscale", "ollama", "lmstudio"].includes(k.provider) ||
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

  // Get unique (model vendor) providers for filtering
  const providers = useMemo(
    () => Array.from(new Set(models.map((m) => m.provider))).sort(),
    [models]
  );

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
      threshold: 0.4, // More forgiving (0 = exact, 1 = match anything)
      distance: 100, // How far to search for match
      ignoreLocation: true, // Don't require the match to be at the start
      includeScore: true,
      minMatchCharLength: 2,
      useExtendedSearch: false,
      findAllMatches: true,
    });
  }, [models, open]);

  // Filter models by search, category, and provider
  const filteredModels = useMemo(() => {
    if (!open) return [];

    const q = searchQuery.trim();

    // Map UI categories to model categories
    const categoryMapping: Record<string, string[]> = {
      "coding": ["coding"],
      "research": ["balanced", "reasoning"],
      "deep-thinking": ["reasoning"],
      "fast": ["fast"],
      "vision": ["vision"],
      "budget": ["cheap", "fast"],
    };

    // Get search matches using fuzzy search
    let searchMatches: Model[];
    if (!q) {
      // No search query - show all models
      searchMatches = models;
    } else if (fuse) {
      // Use fuzzy search
      const results = fuse.search(q);
      searchMatches = results.map((r) => r.item);
    } else {
      // Fallback to basic search
      const lowerQ = q.toLowerCase();
      searchMatches = models.filter((model) => {
        const haystack = `${model.name} ${model.id} ${model.provider} ${model.description || ""}`.toLowerCase();
        return haystack.includes(lowerQ);
      });
    }

    // Now apply category and provider filters
    return searchMatches.filter((model) => {
      // Handle category mapping
      let matchesCategory = selectedCategory === "all";
      if (!matchesCategory) {
        const mappedCategories = categoryMapping[selectedCategory] || [selectedCategory];
        matchesCategory = mappedCategories.some(cat => model.category.includes(cat));
        // For deep-thinking, also match models with reasoning support
        if (selectedCategory === "deep-thinking" && model.supportsReasoning) {
          matchesCategory = true;
        }
      }

      if (!matchesCategory) return false;

      // Filter by selected API provider
      if (selectedApiProvider !== "auto") {
        if (!llmProviderIds.includes(selectedApiProvider)) return false;
        return isModelIdCompatibleWithProviderId(selectedApiProvider, model.id);
      }

      // Auto mode: show models compatible with any configured provider
      return bestProviderByModelId.get(model.id) != null;
    });
  }, [
    bestProviderByModelId,
    fuse,
    llmProviderIds,
    models,
    open,
    searchQuery,
    selectedCategory,
    selectedApiProvider,
  ]);

  const sortedModels = useMemo(() => {
    if (!open) return [];

    // When user is actively searching, preserve the fuzzy search relevance order
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

    // When searching, preserve fuzzy relevance order (Fuse.js already sorted by score)
    if (hasSearchQuery) {
      return filteredModels;
    }

    // Default: use ranking score only when not searching
    return rankingService.rankModels(filteredModels, {
      useCase: selectedCategory !== "all" ? selectedCategory : undefined,
    });
  }, [filteredModels, open, rankingService, searchQuery, selectedCategory, sortBy]);

  const availableModelsForRecs = useMemo(() => {
    if (!open) return [];

    if (currentProviderId) {
      if (!llmProviderIds.includes(currentProviderId)) return [];
      return models.filter((model) => isModelIdCompatibleWithProviderId(currentProviderId, model.id));
    }

    return models.filter((model) => bestProviderByModelId.get(model.id) != null);
  }, [bestProviderByModelId, currentProviderId, llmProviderIds, models, open]);

  // Get use case recommendations (only from available models)
  const codingModels = useMemo(
    () => ruleEngine.getRecommendedModelsForUseCase("coding", availableModelsForRecs).slice(0, 5),
    [availableModelsForRecs, ruleEngine]
  );
  const researchModels = useMemo(
    () => ruleEngine.getRecommendedModelsForUseCase("research", availableModelsForRecs).slice(0, 5),
    [availableModelsForRecs, ruleEngine]
  );
  const deepThinkingModels = useMemo(
    () => availableModelsForRecs
      .filter(m => m.supportsReasoning || m.category.includes("reasoning"))
      .slice(0, 5),
    [availableModelsForRecs]
  );
  const fastModels = useMemo(
    () => ruleEngine.getRecommendedModelsForUseCase("fast", availableModelsForRecs).slice(0, 5),
    [availableModelsForRecs, ruleEngine]
  );
  const valueModels = useMemo(
    () => ruleEngine.getRecommendedModelsForUseCase("cost-effective", availableModelsForRecs).slice(0, 5),
    [availableModelsForRecs, ruleEngine]
  );

  // Convert favorite/recent IDs to full model objects
  const favoriteModelObjects = useMemo(() => {
    const list = (favoriteModels || [])
      .map((fav) => modelById.get(fav.id) || getModelById(fav.id))
      .filter((m): m is Model => m !== undefined);

    // Filter out models that aren't usable with the currently configured provider set.
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

  const categories = [
    { id: "all", label: "All" },
    { id: "coding", label: "Code" },
    { id: "research", label: "Research" },
    { id: "deep-thinking", label: "Reasoning" },
    { id: "fast", label: "Fast" },
    { id: "vision", label: "Vision" },
    { id: "budget", label: "Cheap" },
  ];

  const handleSelectModel = async (modelId: string) => {
    if (currentProviderId && !llmProviderIds.includes(currentProviderId)) {
      toast.error(`Missing API key for ${providerLabel(currentProviderId)}.`);
      return;
    }

    const autoProviderId = bestProviderByModelId.get(modelId) ?? null;
    if (!currentProviderId && !autoProviderId) {
      toast.error("No compatible provider configured for this model. Add an OpenRouter key to use it.");
      return;
    }

    await updateModelLastUsed(modelId);
    onSelectModel(modelId);
    onOpenChange(false);
  };

  const handleToggleFavorite = async (
    modelId: string,
    category: string,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    const isFavorited = await toggleModelFavorite(modelId, category);
    toast.success(isFavorited ? "Added to favorites" : "Removed from favorites");
  };

  const isFavorite = (modelId: string) => {
    return favoriteModels?.some((fav) => fav.id === modelId) || false;
  };

  type ListItem =
    | { kind: "message"; message: string }
    | { kind: "heading"; title: string; icon?: "star" | "code" | "research" | "deep-thinking" | "fast" | "value" }
    | { kind: "model"; model: Model; forceFavorite?: boolean };

  const listItems: ListItem[] = useMemo(() => {
    if (!open) return [];

    const items: ListItem[] = [];
    const showSections = selectedCategory === "all" && selectedApiProvider === "auto" && searchQuery.trim() === "";

    if (currentProviderId && !llmProviderIds.includes(currentProviderId)) {
      items.push({
        kind: "message",
        message: `Missing API key for ${providerLabel(currentProviderId)}. Select Auto or add the key in Settings.`,
      });
    }

    if (favoriteModelObjects.length > 0 && selectedCategory === "all" && selectedApiProvider === "auto") {
      items.push({ kind: "heading", title: "Favorites", icon: "star" });
      for (const model of favoriteModelObjects) {
        items.push({ kind: "model", model, forceFavorite: true });
      }
    }

    if (recentModelObjects.length > 0 && selectedCategory === "all" && selectedApiProvider === "auto") {
      items.push({ kind: "heading", title: "Recently Used" });
      for (const model of recentModelObjects) {
        items.push({ kind: "model", model });
      }
    }

    // Add local models section if available
    if (localModels.length > 0 && (selectedApiProvider === "auto" || selectedApiProvider === "ollama" || selectedApiProvider === "lmstudio")) {
      items.push({ kind: "heading", title: "Local Models", icon: "star" });
      localModels.forEach(localModel => {
        // Create a model-like object for local models
        const model: Model = {
          id: localModel.id,
          name: localModel.name,
          provider: localModel.provider,
          description: `Local model running on ${localModel.provider === "ollama" ? "Ollama" : "LM Studio"}`,
          contextLength: 0, // Unknown
          inputCost: 0,
          outputCost: 0,
          category: ["local"],
          supportsVision: false,
          supportsReasoning: false,
        };
        items.push({ kind: "model", model });
      });
    }

    if (showSections) {
      if (codingModels.length > 0) {
        items.push({ kind: "heading", title: "Best for Coding", icon: "code" });
        for (const model of codingModels) items.push({ kind: "model", model });
      }
      if (researchModels.length > 0) {
        items.push({ kind: "heading", title: "Best for Research", icon: "research" });
        for (const model of researchModels) items.push({ kind: "model", model });
      }
      if (deepThinkingModels.length > 0) {
        items.push({ kind: "heading", title: "Best for Deep Thinking", icon: "deep-thinking" });
        for (const model of deepThinkingModels) items.push({ kind: "model", model });
      }
      if (fastModels.length > 0) {
        items.push({ kind: "heading", title: "Best for Speed", icon: "fast" });
        for (const model of fastModels) items.push({ kind: "model", model });
      }
      if (valueModels.length > 0) {
        items.push({ kind: "heading", title: "Best Value", icon: "value" });
        for (const model of valueModels) items.push({ kind: "model", model });
      }
    }



    items.push({
      kind: "heading",
      title:
        selectedCategory !== "all" || selectedApiProvider !== "auto" || searchQuery.trim()
          ? "Filtered Models"
          : "All Models",
    });

    if (sortedModels.length === 0) {
      items.push({ kind: "message", message: "No models found" });
      return items;
    }

    for (const model of sortedModels) items.push({ kind: "model", model });
    return items;
  }, [
    codingModels,
    currentProviderId,
    favoriteModelObjects,
    fastModels,
    llmProviderIds,
    open,
    researchModels,
    deepThinkingModels,
    recentModelObjects,
    searchQuery,
    selectedCategory,
    selectedApiProvider,
    sortedModels,
    valueModels,
    localModels,
  ]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[90vh] sm:h-[95vh] max-h-[95vh] flex flex-col p-0 gap-0 overflow-hidden bg-background/95 backdrop-blur-xl border-border/50 shadow-2xl">
        {/* Header Section */}
        <div className="flex-none p-6 pb-4 border-b bg-muted/10 z-10 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="text-xl font-bold tracking-tight">Select Model</DialogTitle>
              <DialogDescription className="text-muted-foreground mt-1">
                Choose the best AI model for your task
              </DialogDescription>
            </div>
            <ParameterPresets />
          </div>

          <div className="flex flex-col gap-4">
            {/* Search Bar */}
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              </div>
              <Input
                placeholder="Search models by name, provider, or capabilities..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-11 bg-background/50 border-muted-foreground/20 focus:bg-background transition-all rounded-xl"
              />
            </div>

            {/* Filters Row */}
            <div className="flex items-center justify-between gap-4 overflow-x-auto no-scrollbar pb-1">
              <div className="flex items-center gap-2">
                <div className="flex bg-muted/50 p-1 rounded-lg border border-border/50">
                  {categories.map((category) => (
                    <button
                      key={category.id}
                      onClick={() => setSelectedCategory(category.id)}
                      className={cn(
                        "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                        selectedCategory === category.id
                          ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                          : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                      )}
                    >
                      {category.label}
                    </button>
                  ))}
                </div>

                <div className="h-6 w-px bg-border/60 mx-1" />

                <Select value={selectedApiProvider} onValueChange={setSelectedApiProvider}>
                  <SelectTrigger className="h-9 w-[160px] text-xs bg-muted/30 border-dashed border-border/60 rounded-lg">
                    <div className="flex items-center gap-2 truncate">
                      <span className="text-muted-foreground">Via:</span>
                      <span className="font-medium truncate">
                        {selectedApiProvider === "auto"
                          ? "Auto"
                          : llmProviderOptions.find(p => p.id === selectedApiProvider)?.name || selectedApiProvider}
                      </span>
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto (Best Available)</SelectItem>
                    {llmProviderOptions.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="h-9 w-[130px] text-xs bg-muted/30 border-dashed border-border/60 rounded-lg">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <TrendingUp className="h-3.5 w-3.5" />
                      <span className="font-medium text-foreground">{sortBy === "default" ? "Best Match" : sortBy === "cost" ? "Lowest Cost" : sortBy === "context" ? "Max Context" : "Name"}</span>
                    </div>
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
                  size="icon"
                  className="h-9 w-9 rounded-lg text-muted-foreground hover:text-foreground"
                  onClick={() => loadModels({ refresh: true })}
                  disabled={modelsLoading}
                  title="Refresh models"
                >
                  <RefreshCcw className={cn("h-4 w-4", modelsLoading && "animate-spin")} />
                </Button>
              </div>
            </div>

            {fetchedAt && (
              <div className="flex items-center gap-2 px-1">
                <div className="h-1.5 w-1.5 rounded-full bg-green-500/50 animate-pulse" />
                <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                  Catalog updated {new Date(fetchedAt).toLocaleTimeString()}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 min-h-0 bg-muted/5 relative">
          <Virtuoso
            data={listItems}
            className="flex-1 h-full"
            computeItemKey={(index, item) => item.kind === "model" ? item.model.id : `${item.kind}-${index}`}
            increaseViewportBy={{ top: 200, bottom: 200 }}
            overscan={50}
            itemContent={(index, item) => {
              if (item.kind === "heading") {
                const icon = (() => {
                  if (item.icon === "star") return <Star className="h-3.5 w-3.5 fill-yellow-500 text-yellow-500" />;
                  if (item.icon === "code") return <Code className="h-3.5 w-3.5 text-blue-500" />;
                  if (item.icon === "research") return <BookOpen className="h-3.5 w-3.5 text-teal-500" />;
                  if (item.icon === "deep-thinking") return <Brain className="h-3.5 w-3.5 text-purple-500" />;
                  if (item.icon === "fast") return <Zap className="h-3.5 w-3.5 text-orange-500" />;
                  if (item.icon === "value") return <DollarSign className="h-3.5 w-3.5 text-green-500" />;
                  return null;
                })();

                return (
                  <div className={cn("px-6 pb-3 flex items-center gap-2", index === 0 ? "pt-6" : "pt-8")}>
                    {icon}
                    <h3 className="text-sm font-semibold text-foreground tracking-tight">
                      {item.title}
                    </h3>
                    <div className="h-px bg-border/50 flex-1 ml-2" />
                  </div>
                );
              }

              if (item.kind === "message") {
                return (
                  <div className="px-6 py-8 text-center">
                    <p className="text-sm text-muted-foreground bg-background/50 border border-border/50 rounded-xl py-8 px-4 inline-block mx-auto max-w-sm">
                      {item.message}
                    </p>
                  </div>
                );
              }

              // Card Item
              const model = item.model;
              // Compute which API providers can serve this model
              const availableProviders = llmProviderIds.filter(pid =>
                isModelIdCompatibleWithProviderId(pid, model.id)
              );
              return (
                <div className="px-5 py-1.5">
                  <ModelCard
                    key={model.id}
                    model={model}
                    isSelected={model.id === currentModelId}
                    isFavorite={item.forceFavorite ? true : isFavorite(model.id)}
                    availableProviders={availableProviders}
                    onSelect={() => handleSelectModel(model.id)}
                    onToggleFavorite={(e) =>
                      handleToggleFavorite(model.id, model.category[0], e)
                    }
                  />
                </div>
              );
            }}
          />
        </div>

        {/* Footer / Advanced Settings */}
        <div className="flex-none border-t bg-background/50 backdrop-blur-sm p-2">
          <div className="w-full">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center justify-between w-full px-4 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-all"
            >
              <span className="flex items-center gap-2">
                {showAdvanced ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                Advanced Parameters & System Prompt
              </span>
              {showAdvanced && (
                <span className="text-[10px] uppercase tracking-wider opacity-70">Close Settings</span>
              )}
            </button>

            {showAdvanced && (
              <div className="px-4 pb-4 pt-2 space-y-6 animate-in slide-in-from-bottom-2 duration-200 h-[300px] overflow-y-auto custom-scrollbar">
                {onSelectProviderId && (
                  <div className="space-y-2">
                    <Label className="text-xs">Provider Routing</Label>
                    <Select
                      value={currentProviderId || "auto"}
                      onValueChange={(value) =>
                        onSelectProviderId(value === "auto" ? undefined : value)
                      }
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Auto" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Auto (Recommended)</SelectItem>
                        {llmProviderOptions.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground">
                      Auto prefers direct providers when available, otherwise falls back to OpenRouter.
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="text-xs">Manual Model ID</Label>
                  <Input
                    className="h-9 font-mono text-xs"
                    placeholder="e.g., gpt-4o / claude-3-5-sonnet-20241022 / llama3.1"
                    value={manualModelId}
                    onChange={(e) => setManualModelId(e.target.value)}
                    onBlur={() => {
                      const trimmed = manualModelId.trim();
                      if (trimmed && trimmed !== currentModelId) onSelectModel(trimmed);
                    }}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <Label className="text-xs">Temperature</Label>
                        <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{currentSettings.temperature}</span>
                      </div>
                      <Slider
                        value={[currentSettings.temperature]}
                        max={2}
                        step={0.1}
                        onValueChange={([val]) => updateSettings({ temperature: val })}
                        className="py-1"
                      />
                    </div>

                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <Label className="text-xs">Top P</Label>
                        <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{currentSettings.topP}</span>
                      </div>
                      <Slider
                        value={[currentSettings.topP]}
                        max={1}
                        step={0.05}
                        onValueChange={([val]) => updateSettings({ topP: val })}
                        className="py-1"
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <Label className="text-xs">Max Tokens</Label>
                        <span className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{currentSettings.maxTokens}</span>
                      </div>
                      <Slider
                        value={[currentSettings.maxTokens]}
                        min={256}
                        max={32000}
                        step={256}
                        onValueChange={([val]) => updateSettings({ maxTokens: val })}
                        className="py-1"
                      />
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
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface ModelCardProps {
  model: Model;
  isSelected: boolean;
  isFavorite: boolean;
  availableProviders: string[];
  onSelect: () => void;
  onToggleFavorite: (e: React.MouseEvent) => void;
}

function ModelCard({
  model,
  isSelected,
  isFavorite,
  availableProviders,
  onSelect,
  onToggleFavorite,
}: ModelCardProps) {
  const totalCost = model.inputCost + model.outputCost;
  const costDisplay =
    totalCost === 0
      ? "Free"
      : totalCost < 0.1
        ? `$${totalCost.toFixed(3)}/1M`
        : `$${totalCost.toFixed(2)}/1M`;

  // Simplify provider labels for display
  const providerBadges = availableProviders.slice(0, 3).map(p => {
    if (p === 'openrouter') return 'OR';
    if (p === 'anthropic') return 'Direct';
    if (p === 'openai') return 'Direct';
    if (p === 'google') return 'Direct';
    return p.split('/')[0]?.slice(0, 4) || p;
  });

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        "group relative w-full text-left rounded-xl border transition-all duration-200 outline-none hover:border-primary/50",
        isSelected
          ? "border-primary bg-primary/5 shadow-md ring-1 ring-primary/20"
          : "bg-card hover:bg-muted/50 hover:shadow-sm"
      )}
    >
      {/* Selection Indicator Stripe */}
      <div
        className={cn(
          "absolute left-0 top-0 bottom-0 w-1 rounded-l-xl transition-colors",
          isSelected ? "bg-primary" : "bg-transparent group-hover:bg-primary/30"
        )}
      />

      {/* Capabilities Badges */}
      {(() => {
        const capabilities = getModelCapabilities(model.id);
        return (capabilities.supportsVision || capabilities.supportsTools || capabilities.supportsReasoning) && (
          <div className="absolute top-2 right-2 flex items-center gap-1">
            {capabilities.supportsVision && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5" title="Vision">
                <Eye className="h-3 w-3" />
              </Badge>
            )}
            {capabilities.supportsTools && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5" title="Tools">
                <Wrench className="h-3 w-3" />
              </Badge>
            )}
            {capabilities.supportsReasoning && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5" title="Reasoning">
                <Sparkles className="h-3 w-3" />
              </Badge>
            )}
          </div>
        );
      })()}

      <div className="p-4 pl-5 sm:p-5 sm:pl-6 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <h3 className={cn("font-semibold text-base sm:text-lg tracking-tight", isSelected && "text-primary")}>
                {model.name}
              </h3>
              {model.category.includes("new") && (
                <Badge variant="secondary" className="bg-blue-500/10 text-blue-600 dark:text-blue-400 h-5 text-[10px] px-1.5 border-blue-200 dark:border-blue-900;">
                  NEW
                </Badge>
              )}
            </div>

            <div className="flex flex-wrap gap-y-1 gap-x-2 text-xs text-muted-foreground items-center">
              <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-medium bg-background/50">
                {model.provider}
              </Badge>
              {providerBadges.length > 0 && (
                <span className="text-[10px] text-muted-foreground/60">via</span>
              )}
              {providerBadges.map((badge, i) => (
                <Badge
                  key={i}
                  variant="secondary"
                  className="text-[9px] h-4 px-1 font-normal bg-muted/50"
                >
                  {badge}
                </Badge>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={onToggleFavorite}
            className={cn(
              "p-1.5 rounded-lg transition-all",
              isFavorite
                ? "text-yellow-500 bg-yellow-500/10 hover:bg-yellow-500/20"
                : "text-muted-foreground/30 hover:text-yellow-500 hover:bg-yellow-500/10"
            )}
          >
            <Star className={cn("h-4 w-4", isFavorite && "fill-current")} />
          </button>
        </div>

        {model.description && (
          <p className="text-sm text-muted-foreground/80 leading-relaxed line-clamp-2">
            {model.description}
          </p>
        )}

        <div className="pt-3 mt-1 border-t flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 sm:gap-6 text-xs text-muted-foreground font-medium">
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground/50 uppercase tracking-wider text-[10px]">Context</span>
              <span>{model.contextLength >= 1000 ? `${Math.round(model.contextLength / 1000)}k` : model.contextLength}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground/50 uppercase tracking-wider text-[10px]">Cost</span>
              <span className={cn(totalCost === 0 && "text-green-600 dark:text-green-400")}>{costDisplay}</span>
            </div>
          </div>

          <div className="flex gap-1.5">
            {model.supportsVision && (
              <div className="flex items-center gap-1 text-[10px] font-medium text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/30 px-2 py-0.5 rounded-full border border-sky-100 dark:border-sky-900">
                <Zap className="h-3 w-3" />
                <span>Vision</span>
              </div>
            )}
            {model.supportsReasoning && (
              <div className="flex items-center gap-1 text-[10px] font-medium text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/30 px-2 py-0.5 rounded-full border border-purple-100 dark:border-purple-900">
                <TrendingUp className="h-3 w-3" />
                <span>Reasoning</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
