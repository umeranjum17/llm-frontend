"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Skill, SkillTrigger, SkillUI } from "@/lib/db/schema";
import { addSkill, updateSkill } from "@/lib/db/queries";
import { buildVariablesFromTemplate } from "@/lib/utils/prompt-variables";
import { SKILL_COLORS, SKILL_CATEGORY_CONFIG } from "@/lib/constants/skills";
import { toast } from "sonner";

const CATEGORIES = ["creation", "visualization", "coding", "analysis", "writing"] as const;

const ICONS = [
  "FileText",
  "BarChart3",
  "GitBranch",
  "Image",
  "Code",
  "Bug",
  "Scale",
  "Layers",
  "Sparkles",
  "Search",
  "PenLine",
  "Wand2",
] as const;

const COLORS = ["blue", "green", "purple", "pink", "amber", "red", "cyan", "sky"] as const;

interface SkillEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skill?: Skill | null;
}

export function SkillEditorDialog({ open, onOpenChange, skill }: SkillEditorDialogProps) {
  const isEditing = !!skill;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<Skill["category"]>("coding");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [userTemplate, setUserTemplate] = useState("");
  const [icon, setIcon] = useState<string>("Sparkles");
  const [color, setColor] = useState<string>("blue");
  const [activeLabel, setActiveLabel] = useState("");
  const [autoTrigger, setAutoTrigger] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(skill?.name || "");
    setDescription(skill?.description || "");
    setCategory(skill?.category || "coding");
    setSystemPrompt(skill?.systemPrompt || "");
    setUserTemplate(skill?.userTemplate || "");
    setIcon(skill?.ui.icon || "Sparkles");
    setColor(skill?.ui.color || "blue");
    setActiveLabel(skill?.ui.activeLabel || "");
    setAutoTrigger(skill?.trigger.type === "auto" || true);
  }, [open, skill]);

  const variables = useMemo(
    () => buildVariablesFromTemplate(userTemplate, skill?.variables),
    [userTemplate, skill?.variables]
  );

  const handleSave = async () => {
    if (!name.trim()) return toast.error("Name is required");
    if (!description.trim()) return toast.error("Description is required (used for auto-matching)");
    if (!systemPrompt.trim()) return toast.error("System prompt is required");

    setSaving(true);
    try {
      const trigger: SkillTrigger = { type: autoTrigger ? "auto" : "manual" };
      const ui: SkillUI = {
        icon,
        color,
        activeLabel: activeLabel.trim() || `Using ${name.trim()}...`,
      };

      if (skill) {
        await updateSkill(skill.id, {
          name: name.trim(),
          description: description.trim(),
          category,
          systemPrompt,
          userTemplate: userTemplate.trim() || undefined,
          variables: variables.length > 0 ? variables : undefined,
          trigger,
          ui,
        });
        toast.success("Skill updated");
      } else {
        await addSkill({
          name: name.trim(),
          description: description.trim(),
          category,
          systemPrompt,
          userTemplate: userTemplate.trim() || undefined,
          variables: variables.length > 0 ? variables : undefined,
          trigger,
          ui,
          isBuiltIn: false,
          isEnabled: true,
          isFavorite: false,
        });
        toast.success("Skill created");
      }
      onOpenChange(false);
    } catch {
      toast.error("Failed to save skill");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Skill" : "New Skill"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Basic Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Code Review"
              />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as Skill["category"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {SKILL_CATEGORY_CONFIG[c]?.label || c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Description (Important for matching) */}
          <div className="space-y-2">
            <Label>
              Description <span className="text-muted-foreground text-xs">(used for auto-matching)</span>
            </Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Keywords that trigger this skill, e.g.: code review, check for bugs, best practices, security"
              className="min-h-[80px]"
            />
            <p className="text-xs text-muted-foreground">
              Include keywords and phrases that users might say when they want to use this skill.
            </p>
          </div>

          {/* System Prompt */}
          <div className="space-y-2">
            <Label>System Prompt</Label>
            <Textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="min-h-[180px] font-mono text-sm"
              placeholder="Instructions for the AI when this skill is active..."
            />
          </div>

          {/* User Template (Optional) */}
          <div className="space-y-2">
            <Label>
              User Template <span className="text-muted-foreground text-xs">(optional)</span>
            </Label>
            <Textarea
              value={userTemplate}
              onChange={(e) => setUserTemplate(e.target.value)}
              className="min-h-[100px] font-mono text-sm"
              placeholder="Optional template with {{variables}}"
            />
            {variables.length > 0 && (
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
            )}
          </div>

          {/* UI Settings */}
          <div className="space-y-4 rounded-lg border p-4">
            <h4 className="font-medium text-sm">Appearance</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Icon</Label>
                <Select value={icon} onValueChange={setIcon}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ICONS.map((i) => (
                      <SelectItem key={i} value={i}>
                        {i}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Color</Label>
                <Select value={color} onValueChange={setColor}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COLORS.map((c) => (
                      <SelectItem key={c} value={c}>
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${SKILL_COLORS[c]?.split(" ")[0]}`} />
                          {c}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Active Label</Label>
                <Input
                  value={activeLabel}
                  onChange={(e) => setActiveLabel(e.target.value)}
                  placeholder="e.g., Reviewing code..."
                />
              </div>
            </div>
          </div>

          {/* Trigger Settings */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label>Auto-trigger</Label>
              <p className="text-xs text-muted-foreground mt-1">
                Automatically activate this skill based on message content
              </p>
            </div>
            <Switch checked={autoTrigger} onCheckedChange={setAutoTrigger} />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
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
