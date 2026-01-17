"use client";

import { segmentTextWithMentions, type ParsedMention } from "@/lib/mentions/mention-parser";
import { cn } from "@/lib/utils";
import { Bot, FileText, MessageSquare, Tag } from "lucide-react";

interface MentionBadgeProps {
  mention: ParsedMention;
}

const MENTION_ICONS: Record<ParsedMention["type"], React.ElementType> = {
  agent: Bot,
  file: FileText,
  chat: MessageSquare,
  tag: Tag,
};

const MENTION_COLORS: Record<ParsedMention["type"], string> = {
  agent: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
  file: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  chat: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20",
  tag: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
};

function MentionBadge({ mention }: MentionBadgeProps) {
  const Icon = MENTION_ICONS[mention.type];
  const colorClass = MENTION_COLORS[mention.type];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-medium border",
        colorClass
      )}
      title={`${mention.type}: ${mention.id}`}
    >
      <Icon className="h-3 w-3" />
      <span>{mention.label}</span>
    </span>
  );
}

interface MentionRendererProps {
  text: string;
  className?: string;
}

/**
 * Renders text with mentions displayed as styled badges.
 * Converts raw mention strings like "@agent:id[Name]" into visual badges.
 */
export function MentionRenderer({ text, className }: MentionRendererProps) {
  const segments = segmentTextWithMentions(text);

  return (
    <span className={cn("whitespace-pre-wrap", className)}>
      {segments.map((segment, index) => {
        if (segment.type === "text") {
          return <span key={index}>{segment.content}</span>;
        }

        if (segment.type === "mention" && segment.mention) {
          return <MentionBadge key={index} mention={segment.mention} />;
        }

        return null;
      })}
    </span>
  );
}
