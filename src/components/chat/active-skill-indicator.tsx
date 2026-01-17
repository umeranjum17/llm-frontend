"use client";

import {
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
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SKILL_COLORS } from "@/lib/constants/skills";

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

interface ActiveSkillIndicatorProps {
  icon: string;
  color: string;
  activeLabel: string;
  isAnimated?: boolean;
  className?: string;
}

/**
 * Shows the active skill during message generation with animation
 * Used in message header during streaming
 */
export function ActiveSkillIndicator({
  icon,
  color,
  activeLabel,
  isAnimated = true,
  className,
}: ActiveSkillIndicatorProps) {
  const IconComponent = ICON_MAP[icon] || Sparkles;
  const colorClasses = SKILL_COLORS[color] || SKILL_COLORS.blue;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border",
        colorClasses,
        isAnimated && "animate-pulse",
        className
      )}
    >
      {isAnimated ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <IconComponent className="h-3 w-3" />
      )}
      <span>{activeLabel}</span>
    </div>
  );
}

interface SkillBadgeProps {
  name: string;
  icon: string;
  color: string;
  className?: string;
}

/**
 * Static skill badge shown on completed messages
 * Indicates which skill was used to generate the message
 */
export function SkillBadge({ name, icon, color, className }: SkillBadgeProps) {
  const IconComponent = ICON_MAP[icon] || Sparkles;
  const colorClasses = SKILL_COLORS[color] || SKILL_COLORS.blue;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border",
        colorClasses,
        className
      )}
      title={`Generated with ${name} skill`}
    >
      <IconComponent className="h-2.5 w-2.5" />
      <span>{name}</span>
    </div>
  );
}
