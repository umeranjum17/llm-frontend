"use client";

import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Zap, Star, BarChart3, FileCode, Search, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { getAllPrompts, incrementPromptUsage } from "@/lib/db/queries";
import type { Prompt } from "@/lib/db/schema";

interface PromptQuickSelectProps {
  onSelect: (prompt: Prompt) => void;
}

const CATEGORY_CONFIG: Record<string, { label: string; icon: React.ReactNode }> = {
  visualization: { label: "Visualization", icon: <BarChart3 className="h-3.5 w-3.5" /> },
  coding: { label: "Coding", icon: <FileCode className="h-3.5 w-3.5" /> },
  analysis: { label: "Analysis", icon: <Search className="h-3.5 w-3.5" /> },
  writing: { label: "Writing", icon: <PenLine className="h-3.5 w-3.5" /> },
};

export function PromptQuickSelect({ onSelect }: PromptQuickSelectProps) {
  const prompts = useLiveQuery(() => getAllPrompts(), []);

  const { favorites, grouped } = useMemo(() => {
    if (!prompts) return { favorites: [], grouped: {} };

    const favs = prompts.filter((p) => p.isFavorite);
    const byCategory: Record<string, Prompt[]> = {};

    for (const prompt of prompts) {
      const cat = prompt.category || "other";
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(prompt);
    }

    return { favorites: favs, grouped: byCategory };
  }, [prompts]);

  if (!prompts || prompts.length === 0) {
    return null;
  }

  const handleSelect = async (prompt: Prompt) => {
    await incrementPromptUsage(prompt.id).catch(() => {});
    onSelect(prompt);
  };

  const categoryOrder = ["visualization", "coding", "analysis", "writing", "other"];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 shrink-0"
          title="Quick prompts"
        >
          <Zap className="h-5 w-5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Quick Prompts</span>
          <span className="text-xs font-normal text-muted-foreground">
            {prompts.length} available
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <div className="max-h-[350px] overflow-y-auto py-1">
          {/* Favorites Section */}
          {favorites.length > 0 && (
            <>
              <DropdownMenuGroup>
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                  Favorites
                </div>
                {favorites.map((prompt) => (
                  <PromptItem
                    key={prompt.id}
                    prompt={prompt}
                    onSelect={() => handleSelect(prompt)}
                  />
                ))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
            </>
          )}

          {/* Grouped by Category */}
          {categoryOrder.map((category) => {
            const categoryPrompts = grouped[category];
            if (!categoryPrompts || categoryPrompts.length === 0) return null;

            const config = CATEGORY_CONFIG[category] || {
              label: category.charAt(0).toUpperCase() + category.slice(1),
              icon: <FileCode className="h-3.5 w-3.5" />,
            };

            return (
              <DropdownMenuGroup key={category}>
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  {config.icon}
                  {config.label}
                </div>
                {categoryPrompts.map((prompt) => (
                  <PromptItem
                    key={prompt.id}
                    prompt={prompt}
                    onSelect={() => handleSelect(prompt)}
                  />
                ))}
              </DropdownMenuGroup>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PromptItem({
  prompt,
  onSelect,
}: {
  prompt: Prompt;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full flex items-center gap-2 px-2 py-2 hover:bg-accent rounded-sm transition-colors text-left"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium truncate">{prompt.title}</span>
          {prompt.isFavorite && (
            <Star className="h-3 w-3 fill-yellow-500 text-yellow-500 shrink-0" />
          )}
        </div>
        {prompt.description && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {prompt.description}
          </p>
        )}
      </div>
    </button>
  );
}
