"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { SlidersHorizontal, Bot, Brain, DollarSign, Swords, Tag, Check, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { getAgentById, getAllTags, getSettings, updateSettings, updateChat, getChatById, getMessages } from "@/lib/db/queries";
import { toast } from "sonner";
import { useChatSummary } from "@/hooks/use-chat-summary";

type ReasoningLevel = "low" | "medium" | "high" | "xhigh";

const REASONING_LEVELS: { value: ReasoningLevel; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Med" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "Max" },
];


interface ChatSettingsPopoverProps {
  chatId: string;
  onOpenAgentPicker: () => void;
  onOpenBudgetDialog: () => void;
  isArenaMode: boolean;
  onToggleArena: () => void;
}

export function ChatSettingsPopover({
  chatId,
  onOpenAgentPicker,
  onOpenBudgetDialog,
  isArenaMode,
  onToggleArena,
}: ChatSettingsPopoverProps) {
  const chat = useLiveQuery(() => getChatById(chatId), [chatId]);
  const currentAgent = useLiveQuery(
    () => (chat?.agentId ? getAgentById(chat.agentId) : undefined),
    [chat?.agentId]
  );
  const settings = useLiveQuery(() => getSettings());
  const allTags = useLiveQuery(() => getAllTags(), []);
  const messages = useLiveQuery(() => getMessages(chatId), [chatId]);

  const memoryEnabled = settings?.memoryEnabled !== false;
  const reasoningLevel = chat?.reasoningLevel || "medium";
  const selectedTags = chat?.tags || [];
  const calculatedCost = messages?.reduce((sum, msg) => sum + (msg.cost || 0), 0) || 0;

  const { generateSummary, isGenerating } = useChatSummary();

  const toggleMemory = async () => {
    const newStatus = !memoryEnabled;
    await updateSettings({ memoryEnabled: newStatus });
    toast.success(newStatus ? "Memory enabled" : "Memory disabled");
  };

  const setReasoningLevel = async (level: ReasoningLevel) => {
    await updateChat(chatId, { reasoningLevel: level });
  };

  const toggleTag = async (tagId: string) => {
    const newTags = selectedTags.includes(tagId)
      ? selectedTags.filter((id) => id !== tagId)
      : [...selectedTags, tagId];
    await updateChat(chatId, { tags: newTags });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title="Chat options"
        >
          <SlidersHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Chat Settings</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Agent */}
        <button
          onClick={onOpenAgentPicker}
          className="w-full flex items-center justify-between px-2 py-1.5 text-sm hover:bg-accent rounded-sm transition-colors"
        >
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-muted-foreground" />
            <span>Agent</span>
          </div>
          <span className="text-xs text-muted-foreground">
            {currentAgent ? (currentAgent.avatar ? `${currentAgent.avatar} ` : "") + currentAgent.name : "Default"}
          </span>
        </button>

        {/* Reasoning Level */}
        <div className="px-2 py-1.5">
          <div className="flex items-center gap-2 mb-1.5">
            <Brain className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">Reasoning</span>
          </div>
          <div className="flex gap-1 ml-6">
            {REASONING_LEVELS.map((level) => (
              <button
                key={level.value}
                onClick={() => setReasoningLevel(level.value)}
                className={cn(
                  "px-2 py-0.5 text-xs rounded transition-colors",
                  reasoningLevel === level.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted hover:bg-muted/80 text-muted-foreground"
                )}
              >
                {level.label}
              </button>
            ))}
          </div>
        </div>

        {/* Budget */}
        <button
          onClick={onOpenBudgetDialog}
          className="w-full flex items-center justify-between px-2 py-1.5 text-sm hover:bg-accent rounded-sm transition-colors"
        >
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            <span>Budget</span>
          </div>
          <span className="text-xs text-muted-foreground">
            ${calculatedCost.toFixed(4)}
          </span>
        </button>

        <DropdownMenuSeparator />

        {/* Memory Toggle */}
        <div className="flex items-center justify-between px-2 py-1.5">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">Memory</span>
          </div>
          <Switch checked={memoryEnabled} onCheckedChange={toggleMemory} className="scale-90" />
        </div>

        {/* Arena Mode */}
        <div className="flex items-center justify-between px-2 py-1.5">
          <div className="flex items-center gap-2">
            <Swords className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">Arena</span>
          </div>
          <Switch checked={isArenaMode} onCheckedChange={onToggleArena} className="scale-90" />
        </div>

        {/* Tags Section */}
        {allTags && allTags.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <div className="px-2 py-1.5">
              <div className="flex items-center gap-2 mb-1.5">
                <Tag className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Tags</span>
              </div>
              <div className="flex flex-wrap gap-1 ml-6">
                {allTags.map((tag) => {
                  const isSelected = selectedTags.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      onClick={() => toggleTag(tag.id)}
                      className={cn(
                        "px-2 py-0.5 text-xs rounded-full border transition-colors",
                        isSelected
                          ? "border-transparent"
                          : "border-border bg-transparent hover:bg-muted"
                      )}
                      style={isSelected ? {
                        backgroundColor: `${tag.color}20`,
                        borderColor: tag.color,
                        color: tag.color,
                      } : undefined}
                    >
                      {tag.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        <DropdownMenuSeparator />

        {/* Summarize */}
        <button
          onClick={() => generateSummary(chatId, messages || [])}
          disabled={isGenerating}
          className="w-full flex items-center justify-between px-2 py-1.5 text-sm hover:bg-accent rounded-sm transition-colors disabled:opacity-50"
        >
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span>{isGenerating ? "Summarizing..." : "Summarize Chat"}</span>
          </div>
        </button>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
