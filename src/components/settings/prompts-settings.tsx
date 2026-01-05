"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Trash2, Pencil, Plus, Star } from "lucide-react";
import type { Prompt } from "@/lib/db/schema";
import { deletePrompt, getAllPrompts, updatePrompt } from "@/lib/db/queries";
import { PromptEditorDialog } from "@/components/prompts/prompt-editor-dialog";
import { toast } from "sonner";

export function PromptsSettings() {
  const [query, setQuery] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState<Prompt | null>(null);

  const prompts = useLiveQuery(() => getAllPrompts(), []);

  const filtered = useMemo(() => {
    const list = prompts || [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        (p.description || "").toLowerCase().includes(q) ||
        p.content.toLowerCase().includes(q)
    );
  }, [prompts, query]);

  const handleDelete = async (prompt: Prompt) => {
    if (prompt.isBuiltIn) {
      toast.error("Built-in prompts cannot be deleted");
      return;
    }
    if (!confirm(`Delete prompt "${prompt.title}"?`)) return;
    await deletePrompt(prompt.id);
    toast.success("Prompt deleted");
  };

  const toggleFavorite = async (prompt: Prompt) => {
    await updatePrompt(prompt.id, { isFavorite: !prompt.isFavorite });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-medium">Prompt Library</h3>
          <p className="text-sm text-muted-foreground">
            Manage built-in and custom prompt templates.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingPrompt(null);
            setEditorOpen(true);
          }}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          New Prompt
        </Button>
      </div>

      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search prompts..."
      />

      <div className="space-y-2">
        {filtered?.map((prompt) => (
          <div
            key={prompt.id}
            className="flex items-center justify-between gap-4 rounded-lg border p-3"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="font-medium truncate">{prompt.title}</div>
                {prompt.isBuiltIn ? <Badge variant="secondary">Built-in</Badge> : null}
                {prompt.category ? <Badge variant="outline">{prompt.category}</Badge> : null}
              </div>
              {prompt.description ? (
                <div className="mt-1 text-xs text-muted-foreground line-clamp-2">
                  {prompt.description}
                </div>
              ) : null}
            </div>

            <div className="shrink-0 flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => toggleFavorite(prompt)}
                title={prompt.isFavorite ? "Unfavorite" : "Favorite"}
              >
                <Star className={prompt.isFavorite ? "h-4 w-4 fill-current text-yellow-500" : "h-4 w-4"} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setEditingPrompt(prompt);
                  setEditorOpen(true);
                }}
                disabled={prompt.isBuiltIn}
                title={prompt.isBuiltIn ? "Built-in prompts cannot be edited" : "Edit prompt"}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleDelete(prompt)}
                disabled={prompt.isBuiltIn}
                title={prompt.isBuiltIn ? "Built-in prompts cannot be deleted" : "Delete prompt"}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
        {filtered && filtered.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8">
            No prompts found.
          </div>
        ) : null}
      </div>

      <PromptEditorDialog open={editorOpen} onOpenChange={setEditorOpen} prompt={editingPrompt} />
    </div>
  );
}

