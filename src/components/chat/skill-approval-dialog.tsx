"use client";

import { useMemo } from "react";
import { useStreamingStore } from "@/stores/streaming-store";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SKILL_COLORS } from "@/lib/constants/skills";
import * as LucideIcons from "lucide-react";
import { Check, X } from "lucide-react";

// Get a Lucide icon component by name
function getIconComponent(iconName: string): React.ComponentType<{ className?: string }> {
  const icons = LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>;
  return icons[iconName] || LucideIcons.Sparkles;
}

export function SkillApprovalDialog() {
  const { approveSkill, rejectSkill } = useStreamingStore();

  // Defensive: handle state structure mismatch from cached files
  // Use nullish coalescing outside selector to avoid creating new objects on each render
  const chatStreams = useStreamingStore((state) => state.chatStreams) ?? {};

  // Find which chat has a pending skill approval
  const pendingApprovalInfo = useMemo(() => {
    try {
      for (const [chatId, stream] of Object.entries(chatStreams)) {
        if (stream?.pendingSkillApproval) {
          return { chatId, pendingSkillApproval: stream.pendingSkillApproval };
        }
      }
    } catch {
      return null;
    }
    return null;
  }, [chatStreams]);

  if (!pendingApprovalInfo) return null;

  const { chatId, pendingSkillApproval } = pendingApprovalInfo;

  const { skill } = pendingSkillApproval;
  const IconComponent = getIconComponent(skill.icon);
  const colorClasses = SKILL_COLORS[skill.color] || SKILL_COLORS.blue;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-lg border bg-card p-6 shadow-lg animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className={cn("p-2 rounded-lg", colorClasses)}>
            <IconComponent className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-lg">Use {skill.name}?</h3>
            <p className="text-sm text-muted-foreground">
              This skill was detected for your message
            </p>
          </div>
        </div>

        {/* Description */}
        <div className="mb-6 p-3 rounded-md bg-muted/50">
          <p className="text-sm text-muted-foreground">
            The <span className="font-medium text-foreground">{skill.name}</span> skill
            will enhance this response with specialized instructions and behavior.
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <Button
            variant="outline"
            onClick={() => rejectSkill(chatId)}
            className="gap-2"
          >
            <X className="h-4 w-4" />
            No, proceed without
          </Button>
          <Button
            onClick={() => approveSkill(chatId)}
            className="gap-2"
          >
            <Check className="h-4 w-4" />
            Yes, use skill
          </Button>
        </div>
      </div>
    </div>
  );
}
