"use client";

import { useState, useMemo, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Copy, Check, Wand2, AlertCircle, Zap, Hand } from "lucide-react";
import { useUIStore } from "@/stores/ui-store";
import { cn } from "@/lib/utils";
import { SKILL_COLORS, SKILL_CATEGORY_CONFIG, SKILL_CATEGORY_KEYS } from "@/lib/constants/skills";
import * as LucideIcons from "lucide-react";
import type { Skill, SkillTrigger, SkillUI } from "@/lib/db/schema";
import { getAllSkills } from "@/lib/db/queries";

interface SkillDefinitionData {
  id?: string; // Optional ID for edit flows
  name: string;
  description: string;
  category: Skill["category"];
  systemPrompt: string;
  userTemplate?: string;
  trigger?: { type: "auto" | "manual" };
  requireApproval?: boolean;
  autoApplyQueries?: string[];
  exclusionQueries?: string[];
  ui?: {
    icon?: string;
    color?: string;
    activeLabel?: string;
  };
}

type ParseResult = {
  success: true;
  data: SkillDefinitionData;
} | {
  success: false;
  error: string;
};

function parseSkillDefinition(code: string): ParseResult {
  try {
    const data = JSON.parse(code);

    // Validate required fields
    const errors: string[] = [];

    if (!data.name || typeof data.name !== "string") {
      errors.push("name is required");
    }
    if (!data.description || typeof data.description !== "string") {
      errors.push("description is required");
    }
    if (!data.systemPrompt || typeof data.systemPrompt !== "string") {
      errors.push("systemPrompt is required");
    }

    const validCategories = SKILL_CATEGORY_KEYS;
    if (!data.category || !validCategories.includes(data.category)) {
      errors.push(`category must be one of: ${validCategories.join(", ")}`);
    }

    if (errors.length > 0) {
      return { success: false, error: `Validation errors: ${errors.join("; ")}` };
    }

    return {
      success: true,
      data: {
        id: data.id,
        name: data.name,
        description: data.description,
        category: data.category,
        systemPrompt: data.systemPrompt,
        userTemplate: data.userTemplate,
        trigger: data.trigger || { type: "auto" },
        requireApproval: data.requireApproval || false,
        autoApplyQueries: data.autoApplyQueries,
        exclusionQueries: data.exclusionQueries,
        ui: data.ui || {},
      },
    };
  } catch (e) {
    return { success: false, error: `Invalid JSON: ${e instanceof Error ? e.message : "Parse error"}` };
  }
}

// Get a Lucide icon component by name
function getIconComponent(iconName: string): React.ComponentType<{ className?: string }> {
  const icons = LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>;
  return icons[iconName] || LucideIcons.Sparkles;
}

interface SkillDefinitionBlockProps {
  code: string;
}

export function SkillDefinitionBlock({ code }: SkillDefinitionBlockProps) {
  const [copied, setCopied] = useState(false);
  const [existingSkillId, setExistingSkillId] = useState<string | null>(null);
  const openSkillEditorWithData = useUIStore((state) => state.openSkillEditorWithData);
  const skills = useLiveQuery(() => getAllSkills(), []);
  const pathname = usePathname();

  const parseResult = useMemo(() => parseSkillDefinition(code), [code]);
  
  // Check if this is an edit flow by matching ID or name
  useEffect(() => {
    if (!parseResult.success || !skills) {
      setExistingSkillId(null);
      return;
    }
    
    const data = parseResult.data;
    if (data.id) {
      const found = skills.find((s: Skill) => s.id === data.id);
      setExistingSkillId(found?.id || null);
    } else if (data.name) {
      // Try name match (case-insensitive)
      const found = skills.find((s: Skill) => s.name.toLowerCase() === data.name.toLowerCase());
      setExistingSkillId(found?.id || null);
    } else {
      setExistingSkillId(null);
    }
  }, [parseResult, skills]);
  
  const isEditFlow = !!existingSkillId;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleConvertToSkill = () => {
    if (!parseResult.success) return;

    const { data } = parseResult;

    // Build the skill partial data
    const skillData: Partial<Skill> = {
      name: data.name,
      description: data.description,
      category: data.category,
      systemPrompt: data.systemPrompt,
      userTemplate: data.userTemplate,
      trigger: data.trigger as SkillTrigger,
      requireApproval: data.requireApproval,
      autoApplyQueries: data.autoApplyQueries,
      exclusionQueries: data.exclusionQueries,
      ui: {
        icon: data.ui?.icon || "Sparkles",
        color: data.ui?.color || "blue",
        activeLabel: data.ui?.activeLabel || `Using ${data.name}...`,
      } as SkillUI,
    };

    // Pass current pathname as returnTo so user returns to chat after save
    openSkillEditorWithData(skillData, existingSkillId, pathname);
  };

  // Error state
  if (!parseResult.success) {
    return (
      <div className="my-3 sm:my-4 rounded-lg border border-destructive/30 bg-destructive/5 overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-destructive/20">
          <AlertCircle className="h-4 w-4 text-destructive" />
          <span className="text-sm font-medium text-destructive">Invalid Skill Definition</span>
        </div>
        <div className="p-3">
          <p className="text-sm text-muted-foreground mb-2">{parseResult.error}</p>
          <pre className="text-xs bg-muted/50 p-2 rounded overflow-x-auto">
            <code>{code}</code>
          </pre>
        </div>
      </div>
    );
  }

  const { data } = parseResult;
  const IconComponent = getIconComponent(data.ui?.icon || "Sparkles");
  const colorClasses = SKILL_COLORS[data.ui?.color || "blue"] || SKILL_COLORS.blue;
  const categoryConfig = SKILL_CATEGORY_CONFIG[data.category] || { label: data.category, icon: "Sparkles" };
  const isAutoTrigger = data.trigger?.type === "auto";

  return (
    <div className="my-3 sm:my-4 rounded-lg border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 border-b bg-muted/30">
        <div className="flex items-center gap-2.5">
          <div className={cn("p-1.5 rounded-md", colorClasses)}>
            <IconComponent className="h-4 w-4" />
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2">
            <span className="font-medium text-sm">{data.name}</span>
            <span className={cn(
              "text-[10px] sm:text-xs px-1.5 py-0.5 rounded-full border w-fit",
              colorClasses
            )}>
              {categoryConfig.label}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          {isAutoTrigger ? (
            <span className="flex items-center gap-1">
              <Zap className="h-3 w-3" />
              <span className="hidden sm:inline">Auto</span>
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <Hand className="h-3 w-3" />
              <span className="hidden sm:inline">Manual</span>
            </span>
          )}
        </div>
      </div>

      {/* Description */}
      <div className="px-3 sm:px-4 py-3">
        <p className="text-sm text-muted-foreground line-clamp-2">
          {data.description}
        </p>
      </div>

      {/* Preview of system prompt (truncated) */}
      {data.systemPrompt && (
        <div className="px-3 sm:px-4 pb-3">
          <div className="text-xs text-muted-foreground mb-1 font-medium">System Prompt Preview:</div>
          <div className="text-xs bg-muted/50 p-2 rounded max-h-20 overflow-hidden relative">
            <pre className="whitespace-pre-wrap font-mono">
              {data.systemPrompt.slice(0, 200)}
              {data.systemPrompt.length > 200 && "..."}
            </pre>
            {data.systemPrompt.length > 200 && (
              <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-muted/90 to-transparent" />
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 px-3 sm:px-4 py-2.5 border-t bg-muted/20">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs"
          onClick={handleCopy}
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 mr-1.5 text-green-500" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5 mr-1.5" />
              Copy JSON
            </>
          )}
        </Button>
        <Button
          size="sm"
          className="h-8 text-xs"
          onClick={handleConvertToSkill}
        >
          <Wand2 className="h-3.5 w-3.5 mr-1.5" />
          {isEditFlow ? "Update Skill" : "Convert to Skill"}
        </Button>
      </div>
    </div>
  );
}
