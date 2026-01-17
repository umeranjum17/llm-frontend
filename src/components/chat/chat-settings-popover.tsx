"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { SlidersHorizontal, Bot, Brain, DollarSign, Swords, Tag, FileText, Download, FileCode, Copy, ChevronRight } from "lucide-react";
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
import { getChatForExport, downloadChat, copyChatToClipboard, type ExportFormat } from "@/lib/db/export-chat";
import { toast } from "sonner";
import { useChatSummary } from "@/hooks/use-chat-summary";
import { useSettingsStore } from "@/stores/settings-store";

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

  const defaultReasoningLevel = (settings?.defaultReasoningLevel as ReasoningLevel) || "medium";
  const updateDefaultReasoningLevel = useSettingsStore((state) => state.updateDefaultReasoningLevel);

  const { generateSummary, isGenerating } = useChatSummary();
  const [showExportMenu, setShowExportMenu] = useState(false);

  const handleExport = async (format: ExportFormat) => {
    try {
      const exportData = await getChatForExport(chatId);
      if (!exportData) {
        toast.error("Failed to export chat");
        return;
      }
      downloadChat(exportData, format);
      toast.success(`Chat exported as ${format === "markdown" ? "Markdown" : "JSON"}`);
    } catch (error) {
      toast.error("Failed to export chat");
    }
    setShowExportMenu(false);
  };

  const handleCopyChat = async (format: ExportFormat) => {
    try {
      const exportData = await getChatForExport(chatId);
      if (!exportData) {
        toast.error("Failed to copy chat");
        return;
      }
      await copyChatToClipboard(exportData, format);
      toast.success(`Chat copied as ${format === "markdown" ? "Markdown" : "JSON"}`);
    } catch (error) {
      toast.error("Failed to copy chat");
    }
    setShowExportMenu(false);
  };

  const toggleMemory = async () => {
    const newStatus = !memoryEnabled;
    await updateSettings({ memoryEnabled: newStatus });
    toast.success(newStatus ? "Memory enabled" : "Memory disabled");
  };

  const setReasoningLevel = async (level: ReasoningLevel) => {
    await updateChat(chatId, { reasoningLevel: level });
  };

  const handleSetAsDefault = async () => {
    await updateDefaultReasoningLevel(reasoningLevel);
    toast.success(`${REASONING_LEVELS.find(l => l.value === reasoningLevel)?.label} set as default`);
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
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Reasoning</span>
            </div>
            {reasoningLevel !== defaultReasoningLevel && (
              <button
                onClick={handleSetAsDefault}
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Set as default
              </button>
            )}
          </div>
          <div className="flex gap-1 ml-6">
            {REASONING_LEVELS.map((level) => (
              <button
                key={level.value}
                onClick={() => setReasoningLevel(level.value)}
                className={cn(
                  "px-2 py-0.5 text-xs rounded transition-colors relative",
                  reasoningLevel === level.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted hover:bg-muted/80 text-muted-foreground"
                )}
              >
                {level.label}
                {level.value === defaultReasoningLevel && (
                  <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
                )}
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

        {/* Export */}
        <div className="relative">
          <button
            onClick={() => setShowExportMenu(!showExportMenu)}
            className="w-full flex items-center justify-between px-2 py-1.5 text-sm hover:bg-accent rounded-sm transition-colors"
          >
            <div className="flex items-center gap-2">
              <Download className="h-4 w-4 text-muted-foreground" />
              <span>Export Chat</span>
            </div>
            <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform", showExportMenu && "rotate-90")} />
          </button>

          {showExportMenu && (
            <div className="mt-1 ml-6 space-y-1">
              <button
                onClick={() => handleExport("markdown")}
                className="w-full flex items-center gap-2 px-2 py-1 text-xs hover:bg-accent rounded-sm transition-colors"
              >
                <FileText className="h-3 w-3" />
                <span>Download as Markdown</span>
              </button>
              <button
                onClick={() => handleExport("json")}
                className="w-full flex items-center gap-2 px-2 py-1 text-xs hover:bg-accent rounded-sm transition-colors"
              >
                <FileCode className="h-3 w-3" />
                <span>Download as JSON</span>
              </button>
              <button
                onClick={() => handleCopyChat("markdown")}
                className="w-full flex items-center gap-2 px-2 py-1 text-xs hover:bg-accent rounded-sm transition-colors"
              >
                <Copy className="h-3 w-3" />
                <span>Copy as Markdown</span>
              </button>
            </div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
