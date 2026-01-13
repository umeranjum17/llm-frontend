"use client";

import { useState, useMemo } from "react";
import { Check, ChevronsUpDown, Eye, Brain, Wrench, Sparkles } from "lucide-react";
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
import { type Model } from "@/lib/constants/models";
import { getModelCapabilities } from "@/lib/constants/model-capabilities";
import { formatModelCost } from "./model-item";

// Provider icons/colors for visual identification
const PROVIDER_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  openai: { icon: "◯", color: "text-green-500", label: "OpenAI" },
  anthropic: { icon: "◆", color: "text-orange-500", label: "Anthropic" },
  google: { icon: "▲", color: "text-blue-500", label: "Google" },
  meta: { icon: "◎", color: "text-blue-400", label: "Meta" },
  mistral: { icon: "◇", color: "text-purple-500", label: "Mistral" },
  cohere: { icon: "◈", color: "text-pink-500", label: "Cohere" },
  perplexity: { icon: "◉", color: "text-cyan-500", label: "Perplexity" },
  deepseek: { icon: "◐", color: "text-indigo-500", label: "DeepSeek" },
  qwen: { icon: "◑", color: "text-violet-500", label: "Qwen" },
  nvidia: { icon: "▣", color: "text-lime-500", label: "NVIDIA" },
  microsoft: { icon: "◧", color: "text-sky-500", label: "Microsoft" },
  xai: { icon: "✕", color: "text-gray-400", label: "xAI" },
  arcee: { icon: "◬", color: "text-amber-500", label: "Arcee" },
  xiaomi: { icon: "◭", color: "text-orange-400", label: "Xiaomi" },
  default: { icon: "●", color: "text-muted-foreground", label: "Other" },
};

function getProviderFromModelId(modelId: string): string {
  const lower = modelId.toLowerCase();
  if (lower.includes("gpt") || lower.includes("openai") || lower.includes("o1") || lower.includes("dall-e")) return "openai";
  if (lower.includes("claude") || lower.includes("anthropic")) return "anthropic";
  if (lower.includes("gemini") || lower.includes("google") || lower.includes("palm")) return "google";
  if (lower.includes("llama") || lower.includes("meta")) return "meta";
  if (lower.includes("mistral") || lower.includes("mixtral") || lower.includes("codestral")) return "mistral";
  if (lower.includes("cohere") || lower.includes("command")) return "cohere";
  if (lower.includes("perplexity") || lower.includes("sonar")) return "perplexity";
  if (lower.includes("deepseek")) return "deepseek";
  if (lower.includes("qwen")) return "qwen";
  if (lower.includes("nvidia") || lower.includes("nemotron")) return "nvidia";
  if (lower.includes("phi") || lower.includes("microsoft")) return "microsoft";
  if (lower.includes("grok") || lower.includes("xai")) return "xai";
  if (lower.includes("arcee")) return "arcee";
  if (lower.includes("xiaomi") || lower.includes("mimo")) return "xiaomi";
  return "default";
}

interface ModelComboboxProps {
  models: Model[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function ModelCombobox({
  models,
  value,
  onValueChange,
  placeholder = "Select model...",
  disabled = false,
  className,
}: ModelComboboxProps) {
  const [open, setOpen] = useState(false);

  const selectedModel = useMemo(
    () => models.find((m) => m.id === value),
    [models, value]
  );

  // Group models by provider for better organization
  const groupedModels = useMemo(() => {
    const groups: Record<string, Model[]> = {};

    for (const model of models) {
      const provider = getProviderFromModelId(model.id);
      if (!groups[provider]) groups[provider] = [];
      groups[provider].push(model);
    }

    // Sort groups by provider name, with popular ones first
    const providerOrder = ["openai", "anthropic", "google", "meta", "mistral", "deepseek"];
    const sortedEntries = Object.entries(groups).sort(([a], [b]) => {
      const aIndex = providerOrder.indexOf(a);
      const bIndex = providerOrder.indexOf(b);
      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      return a.localeCompare(b);
    });

    return sortedEntries;
  }, [models]);

  const selectedProvider = selectedModel ? getProviderFromModelId(selectedModel.id) : null;
  const selectedProviderConfig = selectedProvider ? PROVIDER_CONFIG[selectedProvider] || PROVIDER_CONFIG.default : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between h-10", className)}
        >
          {selectedModel ? (
            <div className="flex items-center gap-2 truncate">
              <span className={cn("text-sm font-bold", selectedProviderConfig?.color)}>
                {selectedProviderConfig?.icon}
              </span>
              <span className="truncate">{selectedModel.name}</span>
              <ModelCapabilityIcons modelId={selectedModel.id} />
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
            <CommandEmpty>No model found.</CommandEmpty>
            {groupedModels.map(([provider, providerModels]) => {
              const config = PROVIDER_CONFIG[provider] || PROVIDER_CONFIG.default;
              return (
                <CommandGroup key={provider} heading={
                  <div className="flex items-center gap-2">
                    <span className={cn("text-sm font-bold", config.color)}>{config.icon}</span>
                    <span>{config.label}</span>
                  </div>
                }>
                  {providerModels.slice(0, 10).map((model) => {
                    const caps = getModelCapabilities(model.id);
                    const costDisplay = formatModelCost(model.inputCost, model.outputCost);
                    const isFree = costDisplay === "Free";

                    return (
                      <CommandItem
                        key={model.id}
                        value={`${model.name} ${model.id} ${config.label}`}
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
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-sm">{model.name}</span>
                            <ModelCapabilityIcons modelId={model.id} />
                          </div>
                        </div>
                        <span className={cn(
                          "text-[10px] shrink-0",
                          isFree ? "text-green-500" : "text-muted-foreground"
                        )}>
                          {costDisplay}
                        </span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function ModelCapabilityIcons({ modelId }: { modelId: string }) {
  const caps = getModelCapabilities(modelId);

  return (
    <div className="flex items-center gap-0.5 shrink-0">
      {caps.supportsVision && <Eye className="h-3 w-3 text-sky-500" />}
      {caps.supportsReasoning && <Brain className="h-3 w-3 text-purple-500" />}
      {caps.supportsTools && <Wrench className="h-3 w-3 text-amber-500" />}
      {caps.isImageGeneration && <Sparkles className="h-3 w-3 text-pink-500" />}
    </div>
  );
}
