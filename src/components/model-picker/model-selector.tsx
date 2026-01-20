"use client";

/**
 * Unified Model Selector Component
 *
 * Use this component everywhere you need model selection.
 * It provides consistent UI and provider-aware filtering.
 *
 * Usage:
 * ```tsx
 * <ModelSelector
 *   value={modelId}
 *   onValueChange={setModelId}
 *   providerId="openai" // optional - filter to specific provider
 *   showProviderFilter // optional - show provider filter buttons
 * />
 * ```
 */

import { useState, useMemo } from "react";
import { Check, ChevronsUpDown, Eye, Brain, Wrench, Sparkles, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { type Model } from "@/lib/constants/models";
import { getModelCapabilities, isImageGenerationModel } from "@/lib/constants/model-capabilities";
import { useAvailableModels, useCheapModels } from "@/hooks/use-available-models";
import { formatModelCost } from "./model-item";

// Provider icons for visual identification
const PROVIDER_ICONS: Record<string, { icon: string; color: string }> = {
  openai: { icon: "◯", color: "text-green-500" },
  anthropic: { icon: "◆", color: "text-orange-500" },
  google: { icon: "▲", color: "text-blue-500" },
  meta: { icon: "◎", color: "text-blue-400" },
  mistral: { icon: "◇", color: "text-purple-500" },
  deepseek: { icon: "◐", color: "text-indigo-500" },
  xai: { icon: "✕", color: "text-gray-400" },
  default: { icon: "●", color: "text-muted-foreground" },
};

function getProviderIcon(modelId: string) {
  const lower = modelId.toLowerCase();
  if (lower.includes("gpt") || lower.includes("openai") || lower.includes("o1") || lower.includes("o3") || lower.includes("o4")) return PROVIDER_ICONS.openai;
  if (lower.includes("claude") || lower.includes("anthropic")) return PROVIDER_ICONS.anthropic;
  if (lower.includes("gemini") || lower.includes("google")) return PROVIDER_ICONS.google;
  if (lower.includes("llama") || lower.includes("meta")) return PROVIDER_ICONS.meta;
  if (lower.includes("mistral") || lower.includes("codestral")) return PROVIDER_ICONS.mistral;
  if (lower.includes("deepseek")) return PROVIDER_ICONS.deepseek;
  if (lower.includes("grok") || lower.includes("xai")) return PROVIDER_ICONS.xai;
  return PROVIDER_ICONS.default;
}

export interface ModelSelectorProps {
  /** Current selected model ID */
  value: string;
  /** Callback when model changes */
  onValueChange: (modelId: string) => void;
  /** Filter models to specific provider */
  providerId?: string;
  /** Show provider filter buttons */
  showProviderFilter?: boolean;
  /** Only show cheap models (for background tasks) */
  cheapOnly?: boolean;
  /** Filter by category */
  category?: "all" | "chat" | "image" | "vision" | "reasoning" | "coding";
  /** Placeholder text */
  placeholder?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Custom class name */
  className?: string;
  /** Compact mode - smaller size */
  compact?: boolean;
  /** Allow "Use Default" option */
  allowDefault?: boolean;
}

export function ModelSelector({
  value,
  onValueChange,
  providerId,
  showProviderFilter = false,
  cheapOnly = false,
  category: initialCategory = "all",
  placeholder = "Select a model...",
  disabled = false,
  className,
  compact = false,
  allowDefault = false,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState(initialCategory);
  const [selectedProvider, setSelectedProvider] = useState<string>(providerId || "auto");

  // Get models based on options - always call both hooks to satisfy React rules
  const cheapModelsResult = useCheapModels();
  const availableModelsResult = useAvailableModels({
    providerId: selectedProvider !== "auto" ? selectedProvider : providerId,
    category,
  });

  const { models: allModels, providers, hasOpenRouter } = cheapOnly
    ? cheapModelsResult
    : availableModelsResult;

  // Find selected model
  const selectedModel = useMemo(
    () => allModels.find((m) => m.id === value),
    [allModels, value]
  );

  // Group models by provider
  const groupedModels = useMemo(() => {
    const groups: Record<string, Model[]> = {};
    for (const model of allModels) {
      const provider = model.provider;
      if (!groups[provider]) groups[provider] = [];
      groups[provider].push(model);
    }

    // Sort groups: OpenAI, Anthropic, Google, then others
    const order = ["OpenAI", "Anthropic", "Google", "DeepSeek", "Mistral", "Meta"];
    return Object.entries(groups).sort(([a], [b]) => {
      const aIndex = order.indexOf(a);
      const bIndex = order.indexOf(b);
      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      return a.localeCompare(b);
    });
  }, [allModels]);

  const providerIcon = selectedModel ? getProviderIcon(selectedModel.id) : null;

  return (
    <div className={cn("space-y-2", className)}>
      {/* Provider Filter */}
      {showProviderFilter && providers.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          <Button
            variant={selectedProvider === "auto" ? "default" : "outline"}
            size="sm"
            className="h-6 text-[10px] px-2"
            onClick={() => setSelectedProvider("auto")}
          >
            All
          </Button>
          {providers.slice(0, 6).map((p) => (
            <Button
              key={p.id}
              variant={selectedProvider === p.id ? "default" : "outline"}
              size="sm"
              className="h-6 text-[10px] px-2"
              onClick={() => setSelectedProvider(p.id)}
            >
              {p.name}
            </Button>
          ))}
        </div>
      )}

      {/* Category Filter */}
      {!cheapOnly && (
        <div className="flex flex-wrap gap-1">
          {[
            { key: "all", label: "All" },
            { key: "chat", label: "Chat" },
            { key: "cheap", label: "Cheap", icon: DollarSign },
            { key: "reasoning", label: "Reason", icon: Brain },
            { key: "vision", label: "Vision", icon: Eye },
          ].map(({ key, label, icon: Icon }) => (
            <Button
              key={key}
              variant={category === key ? "default" : "ghost"}
              size="sm"
              className={cn("h-6 text-[10px] px-2", compact && "h-5 text-[9px]")}
              onClick={() => setCategory(key as typeof category)}
            >
              {Icon && <Icon className="h-2.5 w-2.5 mr-0.5" />}
              {label}
            </Button>
          ))}
        </div>
      )}

      {/* Model Picker */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              "w-full justify-between",
              compact ? "h-8 text-xs" : "h-10",
            )}
          >
            {value === "__default__" && allowDefault ? (
              <span className="text-muted-foreground">Use chat default</span>
            ) : selectedModel ? (
              <div className="flex items-center gap-2 truncate">
                <span className={cn("font-bold", providerIcon?.color)}>
                  {providerIcon?.icon}
                </span>
                <span className="truncate">{selectedModel.name}</span>
                <ModelBadges model={selectedModel} compact={compact} />
              </div>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0" align="start">
          <Command>
            <CommandInput placeholder="Search models..." />
            <CommandList className="max-h-[300px]">
              <CommandEmpty>No models found.</CommandEmpty>

              {/* Default option */}
              {allowDefault && (
                <CommandGroup heading="Options">
                  <CommandItem
                    value="__default__ use default"
                    onSelect={() => {
                      onValueChange("__default__");
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "h-4 w-4 mr-2",
                        value === "__default__" ? "opacity-100" : "opacity-0"
                      )}
                    />
                    <span>Use chat&apos;s default model</span>
                  </CommandItem>
                </CommandGroup>
              )}

              {/* Model groups */}
              {groupedModels.map(([provider, models]) => (
                <CommandGroup key={provider} heading={provider}>
                  {models.slice(0, 15).map((model) => {
                    const icon = getProviderIcon(model.id);
                    const cost = formatModelCost(model.inputCost, model.outputCost);
                    const isFree = cost === "Free";

                    return (
                      <CommandItem
                        key={model.id}
                        value={`${model.name} ${model.id} ${provider}`}
                        onSelect={() => {
                          onValueChange(model.id);
                          setOpen(false);
                        }}
                        className="flex items-center gap-2"
                      >
                        <Check
                          className={cn(
                            "h-4 w-4 shrink-0",
                            value === model.id ? "opacity-100" : "opacity-0"
                          )}
                        />
                        <span className={cn("font-bold", icon.color)}>{icon.icon}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-sm">{model.name}</span>
                            <ModelBadges model={model} compact />
                          </div>
                        </div>
                        <span className={cn(
                          "text-[10px] shrink-0",
                          isFree ? "text-green-500 font-medium" : "text-muted-foreground"
                        )}>
                          {cost}
                        </span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function ModelBadges({ model, compact = false }: { model: Model; compact?: boolean }) {
  const caps = getModelCapabilities(model.id);
  const isImage = isImageGenerationModel(model.id);

  return (
    <div className="flex items-center gap-0.5 shrink-0">
      {isImage && <Sparkles className={cn("text-pink-500", compact ? "h-2.5 w-2.5" : "h-3 w-3")} />}
      {caps.supportsVision && !isImage && <Eye className={cn("text-sky-500", compact ? "h-2.5 w-2.5" : "h-3 w-3")} />}
      {caps.supportsReasoning && <Brain className={cn("text-purple-500", compact ? "h-2.5 w-2.5" : "h-3 w-3")} />}
      {caps.supportsTools && <Wrench className={cn("text-amber-500", compact ? "h-2.5 w-2.5" : "h-3 w-3")} />}
    </div>
  );
}

/**
 * Simplified cheap model selector for background tasks.
 * Shows provider filter by default so users can select their preferred provider.
 */
export function CheapModelSelector(props: Omit<ModelSelectorProps, "cheapOnly"> & { showProviderFilter?: boolean }) {
  return <ModelSelector {...props} cheapOnly showProviderFilter={props.showProviderFilter ?? true} />;
}
