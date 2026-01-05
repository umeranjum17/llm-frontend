"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Star } from "lucide-react";
import type { Prompt } from "@/lib/db/schema";
import { getAllPrompts, updatePrompt, incrementPromptUsage } from "@/lib/db/queries";
import { PromptEditorDialog } from "@/components/prompts/prompt-editor-dialog";
import { extractVariableNames } from "@/lib/utils/prompt-variables";
import { cn } from "@/lib/utils";

const CATEGORIES = ["all", "coding", "writing", "analysis", "creative", "learning"] as const;
type Category = (typeof CATEGORIES)[number];

interface PromptLibraryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (prompt: Prompt) => void;
}

function matches(prompt: Prompt, q: string) {
  const query = q.toLowerCase();
  return (
    prompt.title.toLowerCase().includes(query) ||
    (prompt.description || "").toLowerCase().includes(query) ||
    prompt.content.toLowerCase().includes(query) ||
    (prompt.tags || []).some((t) => t.toLowerCase().includes(query))
  );
}

export function PromptLibraryDialog({ open, onOpenChange, onSelect }: PromptLibraryDialogProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category>("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null);

  const prompts = useLiveQuery(() => getAllPrompts(), []);

  const filtered = useMemo(() => {
    const list = prompts || [];
    const q = query.trim();
    return list
      .filter((p) => (category === "all" ? true : (p.category || "other") === category))
      .filter((p) => (q ? matches(p, q) : true))
      .sort((a, b) => (b.isFavorite ? 1 : 0) - (a.isFavorite ? 1 : 0));
  }, [prompts, query, category]);

  const handleSelect = async (prompt: Prompt) => {
    incrementPromptUsage(prompt.id).catch(() => {});
    onSelect(prompt);
    onOpenChange(false);
  };

  const toggleFavorite = async (prompt: Prompt) => {
    await updatePrompt(prompt.id, { isFavorite: !prompt.isFavorite });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Prompt Library</DialogTitle>
          </DialogHeader>

          <div className="flex items-center justify-between gap-3">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search prompts..."
            />
            <Button
              onClick={() => {
                setEditingPrompt(null);
                setEditorOpen(true);
              }}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              New
            </Button>
          </div>

          <Tabs value={category} onValueChange={(v) => setCategory(v as Category)}>
            <TabsList className="w-full justify-start flex-wrap">
              {CATEGORIES.map((c) => (
                <TabsTrigger key={c} value={c} className="capitalize">
                  {c}
                </TabsTrigger>
              ))}
            </TabsList>

            {CATEGORIES.map((c) => (
              <TabsContent key={c} value={c} className="mt-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filtered.map((p) => {
                    const vars = extractVariableNames(p.content);
                    return (
                      <div
                        key={p.id}
                        className="rounded-lg border p-3 hover:bg-accent transition-colors"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <button
                            type="button"
                            className="min-w-0 text-left"
                            onClick={() => handleSelect(p)}
                          >
                            <div className="font-medium truncate">{p.title}</div>
                            {p.description ? (
                              <div className="mt-1 text-xs text-muted-foreground line-clamp-2">
                                {p.description}
                              </div>
                            ) : null}
                          </button>
                          <div className="shrink-0 flex items-center gap-2">
                            {p.isBuiltIn ? <Badge variant="secondary">Built-in</Badge> : null}
                            <button
                              type="button"
                              onClick={() => toggleFavorite(p)}
                              className={cn(
                                "rounded p-1 hover:bg-background",
                                p.isFavorite ? "text-yellow-500" : "text-muted-foreground"
                              )}
                              title={p.isFavorite ? "Unfavorite" : "Favorite"}
                            >
                              <Star className={cn("h-4 w-4", p.isFavorite && "fill-current")} />
                            </button>
                          </div>
                        </div>

                        <div className="mt-2 flex flex-wrap gap-2">
                          {p.category ? <Badge variant="outline">{p.category}</Badge> : null}
                          {vars.length > 0 ? (
                            <Badge variant="outline">{vars.length} vars</Badge>
                          ) : null}
                          {(p.tags || []).slice(0, 3).map((t) => (
                            <Badge key={t} variant="outline">
                              {t}
                            </Badge>
                          ))}
                        </div>

                        {!p.isBuiltIn ? (
                          <div className="mt-3 flex justify-end">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditingPrompt(p);
                                setEditorOpen(true);
                              }}
                            >
                              Edit
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                {filtered.length === 0 ? (
                  <div className="text-sm text-muted-foreground text-center py-10">
                    No prompts found.
                  </div>
                ) : null}
              </TabsContent>
            ))}
          </Tabs>
        </DialogContent>
      </Dialog>

      <PromptEditorDialog open={editorOpen} onOpenChange={setEditorOpen} prompt={editingPrompt} />
    </>
  );
}

