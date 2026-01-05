"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Prompt } from "@/lib/db/schema";
import { addPrompt, updatePrompt } from "@/lib/db/queries";
import { buildVariablesFromTemplate } from "@/lib/utils/prompt-variables";
import { toast } from "sonner";

const CATEGORIES = ["coding", "writing", "analysis", "creative", "learning"] as const;

interface PromptEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prompt?: Prompt | null;
}

export function PromptEditorDialog({ open, onOpenChange, prompt }: PromptEditorDialogProps) {
  const isEditing = !!prompt;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("coding");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(prompt?.title || "");
    setDescription(prompt?.description || "");
    setCategory(prompt?.category || "coding");
    setContent(prompt?.content || "");
    setTags((prompt?.tags || []).join(", "));
  }, [open, prompt]);

  const variables = useMemo(() => buildVariablesFromTemplate(content, prompt?.variables), [content, prompt?.variables]);

  const handleSave = async () => {
    if (!title.trim()) return toast.error("Title is required");
    if (!content.trim()) return toast.error("Content is required");

    setSaving(true);
    try {
      const tagList = tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      if (prompt) {
        if (prompt.isBuiltIn) {
          toast.error("Built-in prompts cannot be edited");
          return;
        }
        await updatePrompt(prompt.id, {
          title: title.trim(),
          description: description.trim() || undefined,
          category,
          content,
          variables,
          tags: tagList,
        });
        toast.success("Prompt updated");
      } else {
        await addPrompt({
          title: title.trim(),
          description: description.trim() || undefined,
          category,
          content,
          variables,
          tags: tagList,
          isFavorite: false,
          isBuiltIn: false,
        });
        toast.success("Prompt created");
      }
      onOpenChange(false);
    } catch {
      toast.error("Failed to save prompt");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Prompt" : "New Prompt"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>Template</Label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-[180px]"
              placeholder="Use {{var}} for variables"
            />
          </div>

          <div className="space-y-2">
            <Label>Tags (comma-separated)</Label>
            <Input value={tags} onChange={(e) => setTags(e.target.value)} />
          </div>

          {variables.length > 0 ? (
            <div className="rounded-lg border p-3 text-sm">
              <div className="font-medium mb-2">Detected variables</div>
              <div className="flex flex-wrap gap-2">
                {variables.map((v) => (
                  <span key={v.name} className="rounded bg-muted px-2 py-0.5 text-xs">
                    {`{{${v.name}}}`}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

