"use client";

import { useEffect, useState } from "react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Star, Check, ChevronRight, ChevronDown, RefreshCcw } from "lucide-react";
import { type Model, getModelById } from "@/lib/constants/models";
import { cn } from "@/lib/utils";
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
import { providerLabel } from "@/lib/ai/provider-routing";

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
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [manualModelId, setManualModelId] = useState<string>(currentModelId);

  const { models, isLoading: modelsLoading, fetchedAt, loadModels } = useModelsStore();
  const keys = useApiKeysStore((s) => s.keys);
  useEffect(() => setManualModelId(currentModelId), [currentModelId, open]);

  const {
    currentSettings,
    updateSettings,
    setSystemPrompt
  } = useModelSettingsStore();

  // Load favorites and recent models from Dexie
  const favoriteModels = useLiveQuery(() => getFavoriteModels(), []);
  const recentModels = useLiveQuery(() => getRecentModels(5), []);

  // Filter models by search and category
  const filteredModels = models.filter((model) => {
    const matchesSearch =
      model.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      model.provider.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      selectedCategory === "all" || model.category.includes(selectedCategory);
    return matchesSearch && matchesCategory;
  });

  // Convert favorite/recent IDs to full model objects
  const favoriteModelObjects =
    favoriteModels
      ?.map((fav) => getModelById(fav.id))
      .filter((m): m is Model => m !== undefined) || [];

  const recentModelObjects =
    recentModels
      ?.map((rec) => getModelById(rec.id))
      .filter((m): m is Model => m !== undefined) || [];

  const categories = [
    { id: "all", label: "All Models" },
    { id: "fast", label: "Fast" },
    { id: "balanced", label: "Balanced" },
    { id: "reasoning", label: "Reasoning" },
    { id: "coding", label: "Coding" },
    { id: "vision", label: "Vision" },
  ];

  const handleSelectModel = async (modelId: string) => {
    await updateModelLastUsed(modelId);
    onSelectModel(modelId);
    onOpenChange(false);
  };

  const llmProviderOptions = Array.from(
    new Map(
      keys
        .filter((k) =>
          ["openrouter", "openai", "anthropic", "groq", "together", "perplexity", "anyscale", "ollama", "lmstudio"].includes(k.provider) ||
          k.provider.startsWith("custom-openai:")
        )
        .map((k) => [k.provider, { id: k.provider, name: k.label || providerLabel(k.provider) }] as const)
    ).values()
  );

  const handleToggleFavorite = async (
    modelId: string,
    category: string,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    await toggleModelFavorite(modelId, category);
  };

  const isFavorite = (modelId: string) => {
    return favoriteModels?.some((fav) => fav.id === modelId) || false;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <div className="p-6 pb-2">
          <DialogHeader className="mb-4">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle>Model Configuration</DialogTitle>
                <DialogDescription>
                  Select a model and tune its parameters
                </DialogDescription>
              </div>
              <ParameterPresets />
            </div>
          </DialogHeader>

          {/* Search & Categories */}
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search models..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2 flex-wrap pb-2">
              {categories.map((category) => (
                <Button
                  key={category.id}
                  variant={
                    selectedCategory === category.id ? "default" : "outline"
                  }
                  size="sm"
                  onClick={() => setSelectedCategory(category.id)}
                  className="rounded-full text-xs h-7"
                >
                  {category.label}
                </Button>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="rounded-full text-xs h-7 gap-2"
                onClick={() => loadModels({ refresh: true })}
                disabled={modelsLoading}
                title="Refresh catalog (OpenRouter)"
              >
                <RefreshCcw className={cn("h-3.5 w-3.5", modelsLoading && "animate-spin")} />
                Refresh
              </Button>
            </div>
            {fetchedAt ? (
              <div className="text-[10px] text-muted-foreground">
                Models updated {new Date(fetchedAt).toLocaleString()}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden border-t">
          {/* Main Model List (Left/Top) */}
          <ScrollArea className="flex-1 p-6 pt-2">
            <div className="space-y-6">
              {/* Favorites Section */}
              {favoriteModelObjects.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold mb-2 flex items-center gap-1.5 text-muted-foreground uppercase tracking-wider">
                    <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                    Favorites
                  </h3>
                  <div className="grid gap-2">
                    {favoriteModelObjects.map((model) => (
                      <ModelCard
                        key={model.id}
                        model={model}
                        isSelected={model.id === currentModelId}
                        isFavorite={true}
                        onSelect={() => handleSelectModel(model.id)}
                        onToggleFavorite={(e) =>
                          handleToggleFavorite(model.id, model.category[0], e)
                        }
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Models Section */}
              {recentModelObjects.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wider">Recently Used</h3>
                  <div className="grid gap-2">
                    {recentModelObjects.map((model) => (
                      <ModelCard
                        key={model.id}
                        model={model}
                        isSelected={model.id === currentModelId}
                        isFavorite={isFavorite(model.id)}
                        onSelect={() => handleSelectModel(model.id)}
                        onToggleFavorite={(e) =>
                          handleToggleFavorite(model.id, model.category[0], e)
                        }
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* All Models */}
              <div>
                <h3 className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wider">All Models</h3>
                <div className="grid gap-2">
                  {filteredModels.map((model) => (
                    <ModelCard
                      key={model.id}
                      model={model}
                      isSelected={model.id === currentModelId}
                      isFavorite={isFavorite(model.id)}
                      onSelect={() => handleSelectModel(model.id)}
                      onToggleFavorite={(e) =>
                        handleToggleFavorite(model.id, model.category[0], e)
                      }
                    />
                  ))}
                  {filteredModels.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      No models found
                    </div>
                  )}
                </div>
              </div>
            </div>
          </ScrollArea>

          {/* Right Panel: Advanced Settings (Collapsible on mobile, fixed on desktop if large enough, but using toggle for now for simplicity) */}
        </div>

        {/* Footer / Advanced Settings Toggle Area */}
        <div className="border-t bg-muted/20">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center w-full px-6 py-3 text-sm font-medium hover:bg-muted/50 transition-colors"
          >
            {showAdvanced ? (
              <ChevronDown className="h-4 w-4 mr-2" />
            ) : (
              <ChevronRight className="h-4 w-4 mr-2" />
            )}
            Advanced Parameters & System Prompt
          </button>

          {showAdvanced && (
            <div className="px-6 pb-6 pt-2 space-y-6 animate-in slide-in-from-top-2 duration-200">
              {onSelectProviderId && (
                <div className="space-y-2">
                  <Label>Provider</Label>
                  <Select
                    value={currentProviderId || "auto"}
                    onValueChange={(value) =>
                      onSelectProviderId(value === "auto" ? undefined : value)
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Auto" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto</SelectItem>
                      {llmProviderOptions.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Auto prefers direct providers when available, otherwise falls back to OpenRouter.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label>Manual Model ID</Label>
                <Input
                  placeholder="e.g., gpt-4o / claude-3-5-sonnet-20241022 / llama3.1"
                  value={manualModelId}
                  onChange={(e) => setManualModelId(e.target.value)}
                  onBlur={() => {
                    const trimmed = manualModelId.trim();
                    if (trimmed && trimmed !== currentModelId) onSelectModel(trimmed);
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Useful for OpenAI-compatible providers and local endpoints not listed in the model catalog.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-8">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <Label>Temperature</Label>
                      <span className="text-xs text-muted-foreground">{currentSettings.temperature}</span>
                    </div>
                    <Slider
                      value={[currentSettings.temperature]}
                      max={2}
                      step={0.1}
                      onValueChange={([val]) => updateSettings({ temperature: val })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Higher values make output more random, lower values more deterministic.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <Label>Top P</Label>
                      <span className="text-xs text-muted-foreground">{currentSettings.topP}</span>
                    </div>
                    <Slider
                      value={[currentSettings.topP]}
                      max={1}
                      step={0.05}
                      onValueChange={([val]) => updateSettings({ topP: val })}
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <Label>Max Tokens</Label>
                      <span className="text-xs text-muted-foreground">{currentSettings.maxTokens}</span>
                    </div>
                    <Slider
                      value={[currentSettings.maxTokens]}
                      min={256}
                      max={32000}
                      step={256}
                      onValueChange={([val]) => updateSettings({ maxTokens: val })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>System Prompt</Label>
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
      </DialogContent>
    </Dialog>
  );
}

interface ModelCardProps {
  model: Model;
  isSelected: boolean;
  isFavorite: boolean;
  onSelect: () => void;
  onToggleFavorite: (e: React.MouseEvent) => void;
}

function ModelCard({
  model,
  isSelected,
  isFavorite,
  onSelect,
  onToggleFavorite,
}: ModelCardProps) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full text-left p-3 rounded-lg border transition-all hover:bg-accent group relative",
        isSelected && "border-primary bg-primary/5 shadow-sm"
      )}
    >
      <div className="flex items-start justify-between gap-3 pr-8">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-medium text-sm truncate">{model.name}</h3>
            {isSelected && <Check className="h-3.5 w-3.5 text-primary" />}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{model.provider}</span>
            <span>•</span>
            <span>{model.contextLength.toLocaleString()} ctx</span>
          </div>
        </div>

        <div className="text-right shrink-0">
          <div className="flex gap-1">
            {model.category.slice(0, 2).map((cat) => (
              <Badge key={cat} variant="secondary" className="text-[10px] px-1.5 h-5">
                {cat}
              </Badge>
            ))}
          </div>
        </div>
      </div>

      <div
        className={cn(
          "absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity",
          isFavorite && "opacity-100"
        )}
      >
        <button
          onClick={onToggleFavorite}
          className="p-1 hover:bg-background/80 rounded-md transition-colors"
        >
          <Star
            className={cn(
              "h-4 w-4 transition-colors",
              isFavorite
                ? "fill-yellow-500 text-yellow-500"
                : "text-muted-foreground/50 hover:text-yellow-500"
            )}
          />
        </button>
      </div>
    </button>
  );
}
