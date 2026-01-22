"use client";

import { useState, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { SlidersHorizontal, Bot, Brain, DollarSign, Swords, Thermometer, Hash, EyeOff } from "lucide-react";
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
import { getAgentById, getSettings, updateSettings, updateChat, getChatById, getMessages } from "@/lib/db/queries";
import { db } from "@/lib/db/schema";
import { toast } from "sonner";
import { useSettingsStore } from "@/stores/settings-store";

type ReasoningLevel = "low" | "medium" | "high" | "xhigh";

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
  const chat = useLiveQuery(() => chatId ? getChatById(chatId) : undefined, [chatId]);
  const currentAgent = useLiveQuery(
    () => (chat?.agentId ? getAgentById(chat.agentId) : undefined),
    [chat?.agentId]
  );
  const settings = useLiveQuery(() => getSettings());
  const messages = useLiveQuery(() => chatId ? getMessages(chatId) : undefined, [chatId]);
  const mem0ApiKey = useLiveQuery(() => db.apiKeys.get("mem0"), []);

  const hasMem0ApiKey = !!mem0ApiKey?.key;
  const incognitoMode = chat?.incognitoMode ?? false;
  const memoryEnabled = settings?.memoryEnabled !== false && hasMem0ApiKey;
  const reasoningLevel = chat?.reasoningLevel || "medium";
  const defaultTemperature = settings?.defaultTemperature ?? 1;
  const defaultMaxTokens = settings?.defaultMaxTokens ?? 4096;
  const temperature = chat?.temperature ?? defaultTemperature;
  const maxTokens = chat?.maxTokens ?? defaultMaxTokens;
  const calculatedCost = messages?.reduce((sum, msg) => sum + (msg.cost || 0), 0) || 0;

  const defaultReasoningLevel = (settings?.defaultReasoningLevel as ReasoningLevel) || "medium";
  const updateDefaultReasoningLevel = useSettingsStore((state) => state.updateDefaultReasoningLevel);
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
      toast.success(newStatus ? "Incognito mode enabled - Memory & tools disabled" : "Incognito mode disabled");
    }
  };

  const toggleMemory = async () => {
    const newStatus = !(settings?.memoryEnabled !== false);
    await updateSettings({ memoryEnabled: newStatus });
    toast.success(newStatus ? "Memory enabled" : "Memory disabled");
  };

  const setReasoningLevel = async (level: ReasoningLevel) => {
    if (chatId) {
      await updateChat(chatId, { reasoningLevel: level });
    }
  };

  const handleSetAsDefault = async () => {
    await updateDefaultReasoningLevel(reasoningLevel);
    toast.success(`${REASONING_LEVELS.find(l => l.value === reasoningLevel)?.label} set as default`);
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

        {/* Arena Mode */}
        <button
          onClick={onToggleArena}
          className={cn(
            "w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-sm transition-colors",
            isArenaMode
              ? "bg-primary/10 text-primary"
              : "hover:bg-accent text-muted-foreground"
          )}
        >
          <Swords className="h-4 w-4" />
          <span>Arena Mode</span>
          {isArenaMode && <span className="ml-auto text-xs">On</span>}
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
                    toast.success(`Temperature ${localTemperature.toFixed(2)} set as default`);
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
                    toast.success(`Max tokens ${localMaxTokens} set as default`);
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
