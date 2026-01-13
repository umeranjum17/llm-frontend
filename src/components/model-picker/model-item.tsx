"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Star,
  Check,
  Eye,
  Wrench,
  Sparkles,
  Zap,
  Brain,
} from "lucide-react";
import { type Model } from "@/lib/constants/models";
import { getModelCapabilities } from "@/lib/constants/model-capabilities";
import { providerLabel } from "@/lib/ai/provider-routing";

export type ModelItemVariant = "card" | "list" | "compact" | "dropdown";

export interface ModelItemProps {
  model: Model;
  variant?: ModelItemVariant;
  isSelected?: boolean;
  isFavorite?: boolean;
  showFavoriteButton?: boolean;
  showCapabilities?: boolean;
  showCost?: boolean;
  showContext?: boolean;
  showDescription?: boolean;
  showProviderBadge?: boolean;
  availableProviders?: string[];
  onClick?: () => void;
  onToggleFavorite?: (e: React.MouseEvent) => void;
  shortcut?: string | number;
  className?: string;
}

// Helper function for formatting a single cost value
export function formatSingleCost(cost: number): string {
  if (cost < 0.001) return "$0";
  if (cost < 1) return `$${cost.toFixed(2)}`;
  return `$${cost.toFixed(1)}`;
}

// Helper function for consistent cost formatting (legacy - total)
export function formatModelCost(inputCost: number, outputCost: number): string {
  const totalCost = inputCost + outputCost;
  // Treat very small values as free (< $0.001 per 1M tokens)
  if (totalCost < 0.001) return "Free";
  if (totalCost < 1) return `$${totalCost.toFixed(2)}/1M`;
  return `$${totalCost.toFixed(1)}/1M`;
}

// Helper function for displaying input/output costs separately
export function formatInputOutputCost(inputCost: number, outputCost: number): { input: string; output: string; isFree: boolean } {
  const totalCost = inputCost + outputCost;
  if (totalCost < 0.001) {
    return { input: "$0", output: "$0", isFree: true };
  }
  return {
    input: formatSingleCost(inputCost),
    output: formatSingleCost(outputCost),
    isFree: false,
  };
}

// Helper function for consistent context display
export function formatContextLength(contextLength: number): string {
  if (contextLength >= 1000000) return `${(contextLength / 1000000).toFixed(1)}M`;
  if (contextLength >= 1000) return `${Math.round(contextLength / 1000)}k`;
  return contextLength.toString();
}

// Helper function for consistent provider badge labels
export function getProviderBadgeLabel(providerId: string): string {
  if (providerId === "openrouter") return "OR";
  if (providerId === "anthropic") return "Direct";
  if (providerId === "openai") return "Direct";
  if (providerId === "google") return "Direct";
  if (providerId === "groq") return "Groq";
  if (providerId === "together") return "Together";
  if (providerId === "perplexity") return "Pplx";
  if (providerId.startsWith("custom-openai:")) return "Custom";
  return providerId.split("/")[0]?.slice(0, 4) || providerId;
}

// Capability badges component
function CapabilityBadges({
  modelId,
  size = "sm",
  showLabels = false,
}: {
  modelId: string;
  size?: "sm" | "md";
  showLabels?: boolean;
}) {
  const capabilities = getModelCapabilities(modelId);
  const iconSize = size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";
  const badgeClass = size === "sm" ? "text-[9px] px-1 py-0 h-4" : "text-[10px] px-1.5 py-0 h-5";

  if (!capabilities.supportsVision && !capabilities.supportsTools && !capabilities.supportsReasoning) {
    return null;
  }

  return (
    <div className="flex items-center gap-1">
      {capabilities.supportsVision && (
        <Badge
          variant="outline"
          className={cn(
            badgeClass,
            "border-sky-200 dark:border-sky-800 text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/30"
          )}
          title="Vision"
        >
          <Eye className={iconSize} />
          {showLabels && <span className="ml-1">Vision</span>}
        </Badge>
      )}
      {capabilities.supportsReasoning && (
        <Badge
          variant="outline"
          className={cn(
            badgeClass,
            "border-purple-200 dark:border-purple-800 text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/30"
          )}
          title="Reasoning"
        >
          <Brain className={iconSize} />
          {showLabels && <span className="ml-1">Reasoning</span>}
        </Badge>
      )}
      {capabilities.supportsTools && (
        <Badge
          variant="outline"
          className={cn(
            badgeClass,
            "border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30"
          )}
          title="Tools"
        >
          <Wrench className={iconSize} />
          {showLabels && <span className="ml-1">Tools</span>}
        </Badge>
      )}
    </div>
  );
}

// Provider routing badges
function ProviderBadges({
  providers,
  size = "sm",
}: {
  providers: string[];
  size?: "sm" | "md";
}) {
  if (providers.length === 0) return null;

  const badgeClass = size === "sm" ? "text-[9px] h-4 px-1" : "text-[10px] h-5 px-1.5";

  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] text-muted-foreground/60">via</span>
      {providers.slice(0, 3).map((p, i) => (
        <Badge
          key={i}
          variant="secondary"
          className={cn(badgeClass, "font-normal bg-muted/50")}
        >
          {getProviderBadgeLabel(p)}
        </Badge>
      ))}
    </div>
  );
}

export function ModelItem({
  model,
  variant = "list",
  isSelected = false,
  isFavorite = false,
  showFavoriteButton = false,
  showCapabilities = true,
  showCost = true,
  showContext = true,
  showDescription = false,
  showProviderBadge = true,
  availableProviders = [],
  onClick,
  onToggleFavorite,
  shortcut,
  className,
}: ModelItemProps) {
  const costDisplay = formatModelCost(model.inputCost, model.outputCost);
  const { input: inputCostDisplay, output: outputCostDisplay, isFree } = formatInputOutputCost(model.inputCost, model.outputCost);
  const contextDisplay = formatContextLength(model.contextLength);
  const totalCost = model.inputCost + model.outputCost;

  // Card variant - full featured card display
  if (variant === "card") {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick?.();
          }
        }}
        className={cn(
          "group relative w-full text-left rounded-xl border transition-all duration-200 outline-none hover:border-primary/50",
          isSelected
            ? "border-primary bg-primary/5 shadow-md ring-1 ring-primary/20"
            : "bg-card hover:bg-muted/50 hover:shadow-sm",
          className
        )}
      >
        {/* Selection Indicator Stripe */}
        <div
          className={cn(
            "absolute left-0 top-0 bottom-0 w-1 rounded-l-xl transition-colors",
            isSelected ? "bg-primary" : "bg-transparent group-hover:bg-primary/30"
          )}
        />

        {/* Capabilities and favorite button in top-right corner */}
        <div className="absolute top-3 right-3 flex items-center gap-2">
          {showCapabilities && (
            <CapabilityBadges modelId={model.id} size="md" />
          )}
          {showFavoriteButton && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite?.(e);
              }}
              className={cn(
                "p-1.5 rounded-lg transition-all",
                isFavorite
                  ? "text-yellow-500 bg-yellow-500/10 hover:bg-yellow-500/20"
                  : "text-muted-foreground/30 hover:text-yellow-500 hover:bg-yellow-500/10"
              )}
            >
              <Star className={cn("h-4 w-4", isFavorite && "fill-current")} />
            </button>
          )}
        </div>

        <div className="p-4 pl-5 sm:p-5 sm:pl-6 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <h3
                  className={cn(
                    "font-semibold text-base sm:text-lg tracking-tight",
                    isSelected && "text-primary"
                  )}
                >
                  {model.name}
                </h3>
                {model.category.includes("new") && (
                  <Badge
                    variant="secondary"
                    className="bg-blue-500/10 text-blue-600 dark:text-blue-400 h-5 text-[10px] px-1.5 border-blue-200 dark:border-blue-900"
                  >
                    NEW
                  </Badge>
                )}
              </div>

              <div className="flex flex-wrap gap-y-1 gap-x-2 text-xs text-muted-foreground items-center">
                {showProviderBadge && (
                  <Badge
                    variant="outline"
                    className="text-[10px] h-5 px-1.5 font-medium bg-background/50"
                  >
                    {model.provider}
                  </Badge>
                )}
                {availableProviders.length > 0 && (
                  <ProviderBadges providers={availableProviders} size="sm" />
                )}
              </div>
            </div>

          </div>

          {showDescription && model.description && (
            <p className="text-sm text-muted-foreground/80 leading-relaxed line-clamp-2">
              {model.description}
            </p>
          )}

          {(showContext || showCost) && (
            <div className="pt-3 mt-1 border-t flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 sm:gap-6 text-xs text-muted-foreground font-medium">
                {showContext && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground/50 uppercase tracking-wider text-[10px]">
                      Context
                    </span>
                    <span>{contextDisplay}</span>
                  </div>
                )}
                {showCost && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground/50 uppercase tracking-wider text-[10px]">
                      Cost
                    </span>
                    {isFree ? (
                      <span className="text-green-600 dark:text-green-400">Free</span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <span className="text-muted-foreground/60">In:</span>
                        <span>{inputCostDisplay}</span>
                        <span className="text-muted-foreground/40 mx-0.5">/</span>
                        <span className="text-muted-foreground/60">Out:</span>
                        <span>{outputCostDisplay}</span>
                        <span className="text-muted-foreground/50 text-[9px]">/1M</span>
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // List variant - for command palette and lists
  if (variant === "list") {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick?.();
          }
        }}
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all cursor-pointer",
          isSelected
            ? "bg-primary/10 text-primary"
            : "hover:bg-muted/70",
          className
        )}
      >
        {shortcut !== undefined && (
          <span className="w-5 h-5 rounded bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground shrink-0">
            {shortcut}
          </span>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn("font-medium truncate", isSelected && "text-primary")}>
              {model.name}
            </span>
            {showCapabilities && <CapabilityBadges modelId={model.id} size="sm" />}
          </div>
          {showDescription && model.description && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {model.description}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {showProviderBadge && (
            <span className="text-xs text-muted-foreground">{model.provider}</span>
          )}
          {showCost && (
            isFree ? (
              <span className="text-xs text-green-600 dark:text-green-400">Free</span>
            ) : (
              <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                <span className="opacity-60">In:</span>{inputCostDisplay}
                <span className="opacity-40">/</span>
                <span className="opacity-60">Out:</span>{outputCostDisplay}
              </span>
            )
          )}
          {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
        </div>
      </div>
    );
  }

  // Compact variant - for quick switch menus
  if (variant === "compact") {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick?.();
          }
        }}
        className={cn(
          "flex items-center gap-2 px-2 py-1.5 rounded-md transition-all cursor-pointer",
          isSelected ? "bg-primary/10" : "hover:bg-muted/50",
          className
        )}
      >
        {shortcut !== undefined && (
          <span className="w-5 h-5 rounded bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground shrink-0">
            {shortcut}
          </span>
        )}
        <span className={cn("flex-1 truncate text-sm", isSelected && "text-primary font-medium")}>
          {model.name}
        </span>
        <span className="text-xs text-muted-foreground shrink-0">{model.provider}</span>
        {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
      </div>
    );
  }

  // Dropdown variant - for select dropdowns with rich content
  if (variant === "dropdown") {
    return (
      <div className={cn("flex items-center gap-3 py-1", className)}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{model.name}</span>
            {showCapabilities && <CapabilityBadges modelId={model.id} size="sm" />}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
          {showProviderBadge && <span>{model.provider}</span>}
          {showCost && (
            isFree ? (
              <span className="text-green-600 dark:text-green-400">Free</span>
            ) : (
              <span className="flex items-center gap-0.5">
                <span className="opacity-60">In:</span>{inputCostDisplay}
                <span className="opacity-40">/</span>
                <span className="opacity-60">Out:</span>{outputCostDisplay}
              </span>
            )
          )}
        </div>
      </div>
    );
  }

  return null;
}

// Export capability badges for use in other components
export { CapabilityBadges, ProviderBadges };
