"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSkillEditorForm } from "@/hooks/use-skill-editor-form";
import type { Skill } from "@/lib/db/schema";
import {
  SKILL_COLORS,
  SKILL_CATEGORY_CONFIG,
  SKILL_CATEGORIES,
  SKILL_ICONS,
  SKILL_COLOR_OPTIONS,
} from "@/lib/constants/skills";

export function BasicsStep() {
  const { name, category, icon, color, activeLabel, errors, setField, touchField } =
    useSkillEditorForm();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-2">Basic Information</h2>
        <p className="text-sm text-muted-foreground">
          Set up the core details for your skill
        </p>
      </div>

      {/* Name and Category */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">
            Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setField("name", e.target.value)}
            onBlur={() => touchField("name")}
            placeholder="e.g., Code Review"
            className={errors.name ? "border-destructive" : ""}
          />
          {errors.name && (
            <p className="text-xs text-destructive">{errors.name}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="category">Category</Label>
          <Select
            value={category}
            onValueChange={(v) => setField("category", v as Skill["category"])}
          >
            <SelectTrigger id="category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SKILL_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {SKILL_CATEGORY_CONFIG[c]?.label || c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Appearance */}
      <div className="space-y-4 rounded-lg border p-4">
        <h4 className="font-medium text-sm">Appearance</h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="icon">Icon</Label>
            <Select value={icon} onValueChange={(v) => setField("icon", v)}>
              <SelectTrigger id="icon">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SKILL_ICONS.map((i) => (
                  <SelectItem key={i} value={i}>
                    {i}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="color">Color</Label>
            <Select value={color} onValueChange={(v) => setField("color", v)}>
              <SelectTrigger id="color">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SKILL_COLOR_OPTIONS.map((c) => (
                  <SelectItem key={c} value={c}>
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-3 h-3 rounded-full ${
                          SKILL_COLORS[c]?.split(" ")[0] || "bg-blue-500"
                        }`}
                      />
                      {c}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="activeLabel">Active Label</Label>
            <Input
              id="activeLabel"
              value={activeLabel}
              onChange={(e) => setField("activeLabel", e.target.value)}
              placeholder="e.g., Reviewing code..."
            />
          </div>
        </div>
      </div>
    </div>
  );
}
