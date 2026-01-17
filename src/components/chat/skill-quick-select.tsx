"use client";

import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Zap,
  Star,
  BarChart3,
  FileText,
  GitBranch,
  Image,
  Code,
  Bug,
  Scale,
  Layers,
  Sparkles,
  Search,
  PenLine,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getAllSkills, incrementSkillUsage } from "@/lib/db/queries";
import type { Skill } from "@/lib/db/schema";
import { SKILL_COLORS, SKILL_CATEGORY_CONFIG } from "@/lib/constants/skills";

interface SkillQuickSelectProps {
  onSelect: (skill: Skill) => void;
  selectedSkill?: Skill | null;
}

// Map icon names to Lucide icons
const ICON_MAP: Record<string, React.ElementType> = {
  FileText,
  BarChart3,
  GitBranch,
  Image,
  Code,
  Bug,
  Scale,
  Layers,
  Sparkles,
  Search,
  PenLine,
  Wand2,
};

function getSkillIcon(iconName: string) {
  const IconComponent = ICON_MAP[iconName] || Sparkles;
  return <IconComponent className="h-3.5 w-3.5" />;
}

function getCategoryIcon(category: string) {
  const config = SKILL_CATEGORY_CONFIG[category];
  if (!config) return <Sparkles className="h-3.5 w-3.5" />;
  const IconComponent = ICON_MAP[config.icon] || Sparkles;
  return <IconComponent className="h-3.5 w-3.5" />;
}

export function SkillQuickSelect({ onSelect, selectedSkill }: SkillQuickSelectProps) {
  const skills = useLiveQuery(() => getAllSkills(), []);

  const { favorites, grouped, enabledCount } = useMemo(() => {
    if (!skills) return { favorites: [], grouped: {}, enabledCount: 0 };

    const enabledSkills = skills.filter((s) => s.isEnabled);
    const favs = enabledSkills.filter((s) => s.isFavorite);
    const byCategory: Record<string, Skill[]> = {};

    for (const skill of enabledSkills) {
      const cat = skill.category || "other";
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(skill);
    }

    return { favorites: favs, grouped: byCategory, enabledCount: enabledSkills.length };
  }, [skills]);

  if (!skills || enabledCount === 0) {
    return null;
  }

  const handleSelect = async (skill: Skill) => {
    await incrementSkillUsage(skill.id).catch(() => {});
    onSelect(skill);
  };

  const categoryOrder = ["creation", "visualization", "coding", "analysis", "writing", "other"];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "h-10 w-10 shrink-0",
            selectedSkill && "ring-2 ring-primary ring-offset-2 ring-offset-background"
          )}
          title={selectedSkill ? `Skill: ${selectedSkill.name}` : "Select a skill"}
        >
          {selectedSkill ? (
            <div className={cn("rounded p-1", SKILL_COLORS[selectedSkill.ui.color])}>
              {getSkillIcon(selectedSkill.ui.icon)}
            </div>
          ) : (
            <Wand2 className="h-5 w-5 text-muted-foreground" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Skills</span>
          <span className="text-xs font-normal text-muted-foreground">
            {enabledCount} available
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <div className="max-h-[400px] overflow-y-auto py-1">
          {/* Clear Selection */}
          {selectedSkill && (
            <>
              <button
                type="button"
                onClick={() => onSelect(null as any)}
                className="w-full flex items-center gap-2 px-2 py-2 hover:bg-accent rounded-sm transition-colors text-left text-muted-foreground"
              >
                <span className="text-sm">Clear skill selection</span>
              </button>
              <DropdownMenuSeparator />
            </>
          )}

          {/* Favorites Section */}
          {favorites.length > 0 && (
            <>
              <DropdownMenuGroup>
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                  Favorites
                </div>
                {favorites.map((skill) => (
                  <SkillItem
                    key={skill.id}
                    skill={skill}
                    onSelect={() => handleSelect(skill)}
                    isSelected={selectedSkill?.id === skill.id}
                  />
                ))}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
            </>
          )}

          {/* Grouped by Category */}
          {categoryOrder.map((category) => {
            const categorySkills = grouped[category];
            if (!categorySkills || categorySkills.length === 0) return null;

            const config = SKILL_CATEGORY_CONFIG[category] || {
              label: category.charAt(0).toUpperCase() + category.slice(1),
              icon: "Sparkles",
            };

            return (
              <DropdownMenuGroup key={category}>
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  {getCategoryIcon(category)}
                  {config.label}
                </div>
                {categorySkills.map((skill) => (
                  <SkillItem
                    key={skill.id}
                    skill={skill}
                    onSelect={() => handleSelect(skill)}
                    isSelected={selectedSkill?.id === skill.id}
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

function SkillItem({
  skill,
  onSelect,
  isSelected,
}: {
  skill: Skill;
  onSelect: () => void;
  isSelected: boolean;
}) {
  const colorClasses = SKILL_COLORS[skill.ui.color] || SKILL_COLORS.blue;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "w-full flex items-center gap-2 px-2 py-2 hover:bg-accent rounded-sm transition-colors text-left",
        isSelected && "bg-accent"
      )}
    >
      <div className={cn("rounded p-1.5 shrink-0", colorClasses)}>
        {getSkillIcon(skill.ui.icon)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium truncate">{skill.name}</span>
          {skill.isFavorite && (
            <Star className="h-3 w-3 fill-yellow-500 text-yellow-500 shrink-0" />
          )}
          {skill.trigger.type === "auto" && (
            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 shrink-0">
              Auto
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
          {skill.description.split(",")[0]}
        </p>
      </div>
    </button>
  );
}
