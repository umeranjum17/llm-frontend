"use client";

import { useState, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { SlidersHorizontal, Bot, Brain, DollarSign, Swords, Thermometer, Hash, EyeOff, Layers, BookOpen, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { getAgentById, getSettings, updateSettings, updateChat, getChatById, getMessages, getProjectFiles, getChatFiles } from "@/lib/db/queries";
import type { Message, ProjectFile } from "@/lib/db/schema";
import { reindexProjectFiles } from "@/lib/rag/file-indexer";
import { toast } from "sonner";
import { useSettingsStore } from "@/stores/settings-store";
import { useApiKeysStore } from "@/stores/api-keys-store";
import { useClawStore } from "@/stores/claw-store";
import { useUIStore } from "@/stores/ui-store";

type ReasoningLevel = "low" | "medium" | "high" | "xhigh";
type ExecutionTarget = "lumina" | "lumina_cli";

const REASONING_LEVELS: { value: ReasoningLevel; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Med" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "Max" },
];


interface ChatSettingsPopoverProps {
  chatId: string | undefined;
  onOpenAgentPicker: () => void;
  onOpenBudgetDialog: () => void;
  isMultiModelMode: boolean;
  onToggleMultiModel: () => void;
}

export function ChatSettingsPopover({
  chatId,
  onOpenAgentPicker,
  onOpenBudgetDialog,
  isMultiModelMode,
  onToggleMultiModel,
}: ChatSettingsPopoverProps) {
  const chat = useLiveQuery(() => chatId ? getChatById(chatId) : undefined, [chatId]);
  const currentAgent = useLiveQuery(
    () => (chat?.agentId ? getAgentById(chat.agentId) : undefined),
    [chat?.agentId]
  );
  const settings = useLiveQuery(() => getSettings());
  const messages = useLiveQuery(() => chatId ? getMessages(chatId) : undefined, [chatId]);
  const projectFiles = useLiveQuery(
    () => (chat?.projectId ? getProjectFiles(chat.projectId) : Promise.resolve([])),
    [chat?.projectId]
  );
  const chatFiles = useLiveQuery(
    () => (chatId ? getChatFiles(chatId) : Promise.resolve([])),
    [chatId]
  );
  const mem0ApiKey = useApiKeysStore((state) => state.getKeyForProvider("mem0"));
  const isClawConnected = useClawStore((state) => state.isConnected);
  const draftChatConfig = useUIStore((state) => state.draftChatConfig);
  const setDraftChatConfig = useUIStore((state) => state.setDraftChatConfig);

  const hasMem0ApiKey = !!mem0ApiKey?.key;
  const defaultExecutionTarget = (settings?.defaultExecutionTarget ?? "lumina") as ExecutionTarget;
  const executionTarget = (chat?.executionTarget ?? draftChatConfig?.executionTarget ?? defaultExecutionTarget) as ExecutionTarget;
  const ragEnabled = chat?.ragEnabled ?? false;
  const hasProjectFiles = (projectFiles?.length ?? 0) > 0;
  const incognitoMode = chat?.incognitoMode ?? false;
  const memoryEnabled = settings?.memoryEnabled !== false && hasMem0ApiKey;
  const reasoningLevel = chat?.reasoningLevel || "medium";
  const smartCompaction = chat?.smartCompaction !== false; // Default to true
  const defaultTemperature = settings?.defaultTemperature ?? 1;
  const defaultMaxTokens = settings?.defaultMaxTokens ?? 4096;
  const temperature = chat?.temperature ?? defaultTemperature;
  const maxTokens = chat?.maxTokens ?? defaultMaxTokens;
  const calculatedCost = messages?.reduce((sum: number, msg: Message) => sum + (msg.cost || 0), 0) || 0;

  const defaultReasoningLevel = (settings?.defaultReasoningLevel as ReasoningLevel) || "medium";
  const updateDefaultReasoningLevel = useSettingsStore((state) => state.updateDefaultReasoningLevel);
  const updateDefaultExecutionTarget = useSettingsStore((state) => state.updateDefaultExecutionTarget);
  const updateDefaultTemperature = useSettingsStore((state) => state.updateDefaultTemperature);
  const updateDefaultMaxTokens = useSettingsStore((state) => state.updateDefaultMaxTokens);

  const [localTemperature, setLocalTemperature] = useState(temperature);
  const [localMaxTokens, setLocalMaxTokens] = useState(maxTokens);

  // Sync local state when chat changes or DB values update
  useEffect(() => {
    setLocalTemperature(temperature);
  }, [temperature]);

  useEffect(() => {
    setLocalMaxTokens(maxTokens);
  }, [maxTokens]);

  const handleTemperatureChange = async (value: number[]) => {
    const newTemp = value[0];
    setLocalTemperature(newTemp);
    if (chatId) {
      await updateChat(chatId, { temperature: newTemp });
    }
  };

  const handleMaxTokensChange = async (value: number[]) => {
    const newMax = value[0];
    setLocalMaxTokens(newMax);
    if (chatId) {
      await updateChat(chatId, { maxTokens: newMax });
    }
  };

  const toggleIncognito = async () => {
    const newStatus = !incognitoMode;
    if (chatId) {
      await updateChat(chatId, { incognitoMode: newStatus });
      // No toast - toggle state is visible in UI
    }
  };

  const toggleSmartCompaction = async () => {
    const newStatus = !smartCompaction;
    if (chatId) {
      await updateChat(chatId, { smartCompaction: newStatus });
    }
  };

  const toggleRag = async () => {
    if (!chatId) return;
    const enabling = !ragEnabled;
    await updateChat(chatId, { ragEnabled: enabling });

    // When enabling, ensure existing project files are indexed
    if (enabling && chat?.projectId) {
      const files = await getProjectFiles(chat.projectId);
      const hasUnindexed = files.some((f: ProjectFile) => !f.indexed);
      if (hasUnindexed) {
        reindexProjectFiles(chat.projectId).catch((err) =>
          console.error("[KB] Failed to index existing project files:", err)
        );
      }
    }
  };

  const toggleMemory = async () => {
    const newStatus = !(settings?.memoryEnabled !== false);
    await updateSettings({ memoryEnabled: newStatus });
    // No toast - toggle state is visible in UI
  };

  const setReasoningLevel = async (level: ReasoningLevel) => {
    if (chatId) {
      await updateChat(chatId, { reasoningLevel: level });
    }
  };

  const handleSetAsDefault = async () => {
    await updateDefaultReasoningLevel(reasoningLevel);
    // No toast - action is confirmed by "Set as Default" button press
  };

  const setExecutionTarget = async (target: ExecutionTarget) => {
    if (chatId && target !== executionTarget) {
      await updateChat(chatId, { executionTarget: target });
    } else if (!chatId && draftChatConfig && target !== executionTarget) {
      setDraftChatConfig({ ...draftChatConfig, executionTarget: target });
    }

    if (target !== defaultExecutionTarget) {
      await updateDefaultExecutionTarget(target);
    }

    if (target === "lumina_cli" && !isClawConnected) {
      toast.info("Lumina CLI is selected but not connected yet. Configure it in Settings > Lumina CLI.");
    }
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
      <DropdownMenuContent align="end" className="w-64 max-h-[600px]">
        <DropdownMenuLabel>Chat Settings</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* Execution Target */}
        <div className="px-2 py-1.5">
          <div className="flex items-center gap-2 mb-1.5">
            <Server className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">Target</span>
          </div>
          <div className="ml-6 flex gap-1">
            <button
              onClick={() => void setExecutionTarget("lumina")}
              className={cn(
                "px-2 py-0.5 text-xs rounded transition-colors",
                executionTarget === "lumina"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/80 text-muted-foreground"
              )}
            >
              Lumina
            </button>
            <button
              onClick={() => void setExecutionTarget("lumina_cli")}
              className={cn(
                "px-2 py-0.5 text-xs rounded transition-colors",
                executionTarget === "lumina_cli"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/80 text-muted-foreground"
              )}
            >
              Lumina CLI
            </button>
          </div>
        </div>

        {/* Agent */}
        {executionTarget === "lumina" && (
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
        )}

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

        {/* Incognito - Tap to toggle */}
        <button
          onClick={toggleIncognito}
          className={cn(
            "w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-sm transition-colors",
            incognitoMode
              ? "bg-primary/10 text-primary"
              : "hover:bg-accent text-muted-foreground"
          )}
        >
          <EyeOff className="h-4 w-4" />
          <span>Incognito</span>
          {incognitoMode && <span className="ml-auto text-xs">On</span>}
        </button>

        {/* Smart Compaction Toggle */}
        <button
          onClick={toggleSmartCompaction}
          disabled={incognitoMode}
          className={cn(
            "w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-sm transition-colors",
            incognitoMode
              ? "opacity-50 cursor-not-allowed"
              : smartCompaction
                ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                : "hover:bg-accent text-muted-foreground"
          )}
          title="When enabled, older messages are summarized instead of removed when context limit is reached"
        >
          <Layers className="h-4 w-4" />
          <span>Smart Context</span>
          {smartCompaction && !incognitoMode && <span className="ml-auto text-xs">On</span>}
        </button>

        {/* Knowledge Base Mode Toggle — show when files exist OR when ragEnabled (so user can disable) */}
        {(hasProjectFiles || (chatFiles?.length ?? 0) > 0 || ragEnabled) && (
          <button
            onClick={toggleRag}
            className={cn(
              "w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-sm transition-colors",
              ragEnabled
                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                : "hover:bg-accent text-muted-foreground"
            )}
            title="When enabled, answers are grounded in project source files"
          >
            <BookOpen className="h-4 w-4" />
            <span>Knowledge Base</span>
            {ragEnabled && <span className="ml-auto text-xs">On</span>}
          </button>
        )}

        {/* Memory Toggle */}
        <div className="flex items-center justify-between px-2 py-1.5">
          <div className="flex items-center gap-2">
            <Brain className={cn("h-4 w-4", incognitoMode ? "text-muted-foreground/50" : "text-muted-foreground")} />
            <span className={cn("text-sm", incognitoMode && "text-muted-foreground/50")}>Memory</span>
            {!hasMem0ApiKey && <span className="text-[10px] text-muted-foreground/50">(No key)</span>}
            {incognitoMode && hasMem0ApiKey && <span className="text-[10px] text-muted-foreground/50">(Incognito)</span>}
          </div>
          <Switch
            checked={memoryEnabled && !incognitoMode}
            onCheckedChange={toggleMemory}
            className="scale-90"
            disabled={!hasMem0ApiKey || incognitoMode}
          />
        </div>

        {/* Multi-Model Mode */}
        <button
          onClick={onToggleMultiModel}
          className={cn(
            "w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-sm transition-colors",
            isMultiModelMode
              ? "bg-primary/10 text-primary"
              : "hover:bg-accent text-muted-foreground"
          )}
        >
          <Swords className="h-4 w-4" />
          <span>Multi-Model</span>
          {isMultiModelMode && <span className="ml-auto text-xs">On</span>}
        </button>

        <DropdownMenuSeparator />

        {/* Temperature */}
        <div className="px-2 py-2">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Thermometer className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Temperature</span>
            </div>
            <div className="flex items-center gap-2">
              {localTemperature !== defaultTemperature && (
                <button
                  onClick={async () => {
                    await updateDefaultTemperature(localTemperature);
                  }}
                  className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  Set as default
                </button>
              )}
              <span className="text-xs text-muted-foreground font-mono">{localTemperature.toFixed(2)}</span>
            </div>
          </div>
          <Slider
            value={[localTemperature]}
            onValueChange={handleTemperatureChange}
            min={0}
            max={2}
            step={0.01}
            className="ml-6"
          />
        </div>

        {/* Max Tokens */}
        <div className="px-2 py-2">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Hash className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Max Tokens</span>
            </div>
            <div className="flex items-center gap-2">
              {localMaxTokens !== defaultMaxTokens && (
                <button
                  onClick={async () => {
                    await updateDefaultMaxTokens(localMaxTokens);
                  }}
                  className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  Set as default
                </button>
              )}
              <span className="text-xs text-muted-foreground font-mono">{localMaxTokens}</span>
            </div>
          </div>
          <Slider
            value={[localMaxTokens]}
            onValueChange={handleMaxTokensChange}
            min={256}
            max={32000}
            step={256}
            className="ml-6"
          />
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
