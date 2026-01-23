"use client";

import { useEffect, useMemo, useState, useCallback, useRef, lazy, Suspense } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useLiveQuery } from "dexie-react-hooks";
import { useLiveQueryWithTimeout } from "@/hooks/use-live-query-with-timeout";
import { useRouter } from "next/navigation";
import { useUIStore } from "@/stores/ui-store";
import { useShallow } from "zustand/react/shallow";
import {
  createChat,
  getChatWithAgent,
  getModelPickerData,
  updateChat,
  updateModelLastUsed,
  getMessages,
  updateAgent,
} from "@/lib/db/queries";
import { MODELS, type Model, getModelById, USE_CASE_RECOMMENDATIONS, MODEL_CATALOG } from "@/lib/constants/models";
import { MessageList } from "./message-list";
import { InputArea } from "./input-area";
import { TagList } from "./tag-list";
import { cn } from "@/lib/utils";
import { useAutoTags } from "@/hooks/use-auto-tags";
import { useChatSummary } from "@/hooks/use-chat-summary";
import { BudgetSettingsDialog } from "./budget-settings-dialog";
import { ChatSettingsPopover } from "./chat-settings-popover";
import { ToolQuickToggle } from "./tool-quick-toggle";
import { SkillApprovalDialog } from "./skill-approval-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// Lazy load heavy dialog components for better initial load
const ModelPickerDialog = lazy(() =>
  import("@/components/model-picker/model-picker-dialog").then((m) => ({
    default: m.ModelPickerDialog,
  }))
);
const AgentPickerDialog = lazy(() =>
  import("@/components/agents/agent-picker-dialog").then((m) => ({
    default: m.AgentPickerDialog,
  }))
);
const SkillEditorDialog = lazy(() =>
  import("@/components/settings/skill-editor-dialog").then((m) => ({
    default: m.SkillEditorDialog,
  }))
);
const AgentEditorDialog = lazy(() =>
  import("@/components/agents/agent-editor-dialog").then((m) => ({
    default: m.AgentEditorDialog,
  }))
);
import {
  Check,
  Settings,
  ChevronDown,
  PanelRightOpen,
  PanelRightClose,
  Maximize2,
  Minimize2,
  Columns2,
  Bot,
} from "lucide-react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ArtifactShell } from "@/components/artifacts/artifact-shell";
import { useApiKeysStore } from "@/stores/api-keys-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useModelsStore } from "@/stores/models-store";
import { useStreamingStore } from "@/stores/streaming-store";
import { getDefaultChatConfig } from "@/lib/ai/default-chat";
import { isModelIdCompatibleWithProviderId, pickBestProviderId, providerLabel } from "@/lib/ai/provider-routing";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { EmptyState } from "@/components/ui/empty-state";
import { EmptyStateWelcome } from "@/components/chat/empty-state-welcome";
import { MessageSquare, Eye, Brain, Wrench, Code, Zap, DollarSign, Sparkles, AlertTriangle, ImageIcon } from "lucide-react";
import { getModelCapabilities } from "@/lib/constants/model-capabilities";
import { formatModelCost } from "@/components/model-picker/model-item";
import { OfflineIndicator } from "@/components/pwa";

export function ChatShell() {
  const router = useRouter();

  // Use shallow comparison to prevent re-renders when unrelated state changes
  const {
    activeChatId,
    setActiveChatId,
    secondaryChatId,
    setSecondaryChatId,
    isSplitView,
    setIsSplitView,
    showArtifacts,
    setShowArtifacts,
    isArenaMode,
    setIsArenaMode,
    arenaModelIds,
    setArenaModelIds,
    isFocusMode,
    setIsFocusMode,
    skillEditorOpen,
    setSkillEditorOpen,
    agentEditorOpen,
    setAgentEditorOpen,
    draftChatConfig,
  } = useUIStore(
    useShallow((state) => ({
      activeChatId: state.activeChatId,
      setActiveChatId: state.setActiveChatId,
      secondaryChatId: state.secondaryChatId,
      setSecondaryChatId: state.setSecondaryChatId,
      isSplitView: state.isSplitView,
      setIsSplitView: state.setIsSplitView,
      showArtifacts: state.showArtifacts,
      setShowArtifacts: state.setShowArtifacts,
      isArenaMode: state.isArenaMode,
      setIsArenaMode: state.setIsArenaMode,
      arenaModelIds: state.arenaModelIds,
      setArenaModelIds: state.setArenaModelIds,
      isFocusMode: state.isFocusMode,
      setIsFocusMode: state.setIsFocusMode,
      skillEditorOpen: state.skillEditorOpen,
      setSkillEditorOpen: state.setSkillEditorOpen,
      agentEditorOpen: state.agentEditorOpen,
      setAgentEditorOpen: state.setAgentEditorOpen,
      draftChatConfig: state.draftChatConfig,
    }))
  );

  const getKeyForProvider = useApiKeysStore((s) => s.getKeyForProvider);
  const keys = useApiKeysStore((s) => s.keys);
  const models = useModelsStore((state) => state.models);
  const autoTaggingEnabled = useSettingsStore((state) => state.autoTaggingEnabled);
  const lastProviderIdByModel = useSettingsStore((state) => state.lastProviderIdByModel);
  const updateLastProviderForModel = useSettingsStore((state) => state.updateLastProviderForModel);

  const llmProviderIds = useMemo(
    () =>
      Array.from(
        new Set(
          keys
            .map((k) => k.provider)
            .filter((p) =>
              ["openrouter", "openai", "anthropic", "google", "deepseek", "mistral", "xai", "groq", "together", "perplexity", "anyscale"].includes(p) ||
              p.startsWith("custom-openai:")
            )
        )
      ),
    [keys]
  );

  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [arenaPickerOpen, setArenaPickerOpen] = useState<{ open: boolean, index: number }>({ open: false, index: 0 });
  const [agentPickerOpen, setAgentPickerOpen] = useState(false);
  const [budgetDialogOpen, setBudgetDialogOpen] = useState(false);
  const [headerExpanded, setHeaderExpanded] = useState(false);

  // Get streaming count for mobile active chats indicator
  const activeStreamCount = useStreamingStore((state) => state.getActiveStreamCount());
  const [toolWarningDismissed, setToolWarningDismissed] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Get current chat and agent in a single query to reduce cascading re-renders
  // Use timeout wrapper for critical queries to detect DB stalls
  const chatDataQuery = useLiveQueryWithTimeout(
    () => (activeChatId ? getChatWithAgent(activeChatId) : undefined),
    [activeChatId],
    { timeoutMs: 5000 }
  );
  const chatData = chatDataQuery.data;
  const chatFromDb = chatData?.chat;
  const currentAgent = chatData?.agent;

  // Draft mode: no activeChatId but draftChatConfig exists
  const isDraftMode = !activeChatId && draftChatConfig !== null;

  // Create virtual chat for draft mode or use DB chat
  const chat = isDraftMode && draftChatConfig ? {
    id: "draft",
    title: "New Chat",
    modelId: draftChatConfig.modelId,
    providerId: draftChatConfig.providerId,
    projectId: draftChatConfig.projectId || "",
    activeMcpServerIds: draftChatConfig.activeMcpServerIds || [],
    reasoningLevel: draftChatConfig.reasoningLevel || "medium",
    temperature: draftChatConfig.temperature,
    maxTokens: draftChatConfig.maxTokens,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  } as any : chatFromDb;

  const messagesQuery = useLiveQueryWithTimeout(
    () => (activeChatId ? getMessages(activeChatId) : undefined),
    [activeChatId],
    { timeoutMs: 5000, defaultValue: [] }
  );
  const messagesFromDb = messagesQuery.data;

  // In draft mode, there are no messages yet
  const messages = isDraftMode ? [] : messagesFromDb;

  // Map messages to match ai SDK Message type (createdAt as Date)
  const aiMessages = useMemo(() => {
    if (!messages) return [];
    return messages.map((m) => ({
      ...m,
      createdAt: new Date(m.createdAt),
    })) as any[];
  }, [messages]);

  // Welcome mode: no messages yet, show centered welcome screen
  const isWelcomeMode = (activeChatId || isDraftMode) && messages && messages.length === 0;

  // Handle suggestion chip click - populate input and focus
  const handleSuggestionClick = useCallback((prompt: string) => {
    // Dispatch event to populate input area
    window.dispatchEvent(new CustomEvent("lumina:populate-input", { detail: { text: prompt } }));
  }, []);

  // Auto-tagging hook
  useAutoTags(activeChatId || "", aiMessages, chat?.tags, autoTaggingEnabled ?? false);

  // Auto-summary hook
  useChatSummary(activeChatId || "", aiMessages, chat?.summary);

  // Always use chat's model - agent's default model is copied to chat.modelId when agent is selected
  // If user changes model via dropdown, chat.modelId is updated and should take precedence
  const currentModel = chat?.modelId ? getModelById(chat.modelId) : undefined;

  useEffect(() => {
    if (!chat?.providerId) return;
    if (isModelIdCompatibleWithProviderId(chat.providerId, chat.modelId)) return;
    updateChat(chat.id, { providerId: undefined }).catch(() => { });
  }, [chat?.id, chat?.modelId, chat?.providerId]);

  // Batch query for model picker data - reduces 3 queries to 1 transaction
  const modelPickerData = useLiveQuery(() => getModelPickerData(), []);
  const favoriteModelEntries = modelPickerData?.favorites;
  const recentModelEntries = modelPickerData?.recent;
  const modelAliases = modelPickerData?.aliases;

  const modelAliasMap = useMemo(() => {
    const map = new Map<string, string>();
    (modelAliases || []).forEach((a: { id: string; alias: string }) => map.set(a.id, a.alias));
    return map;
  }, [modelAliases]);

  const allModels = models.length > 0 ? models : MODELS;
  const modelMap = useMemo(
    () => new Map(allModels.map((model) => [model.id, model])),
    [allModels]
  );
  const favoriteIds = useMemo(
    () => new Set((favoriteModelEntries || []).map((model) => model.id)),
    [favoriteModelEntries]
  );
  const favoriteModelObjects = useMemo(() => {
    const entries = favoriteModelEntries || [];
    return entries
      .map((model) => modelMap.get(model.id))
      .filter((model): model is Model => Boolean(model))
      .filter((model) => {
        // If a specific provider is set, only show compatible models
        if (chat?.providerId) {
          return isModelIdCompatibleWithProviderId(chat.providerId, model.id);
        }
        // Otherwise show anything runnable
        return pickBestProviderId({ modelId: model.id, availableProviderIds: llmProviderIds }) !== null;
      });
  }, [favoriteModelEntries, llmProviderIds, modelMap, chat?.providerId]);

  const recentModelObjects = useMemo(() => {
    const entries = recentModelEntries || [];
    return entries
      .filter((model) => !favoriteIds.has(model.id))
      .map((model) => modelMap.get(model.id))
      .filter((model): model is Model => Boolean(model))
      .filter((model) => {
        if (chat?.providerId) {
          return isModelIdCompatibleWithProviderId(chat.providerId, model.id);
        }
        return pickBestProviderId({ modelId: model.id, availableProviderIds: llmProviderIds }) !== null;
      });
  }, [favoriteIds, llmProviderIds, recentModelEntries, modelMap, chat?.providerId]);

  const suggestedModels = useMemo(() => {
    const excluded = new Set([
      ...(favoriteModelEntries || []).map((model) => model.id),
      ...(recentModelEntries || []).map((model) => model.id),
    ]);
    return allModels
      .filter((model) => !excluded.has(model.id))
      .filter((model) => {
        if (chat?.providerId) {
          return isModelIdCompatibleWithProviderId(chat.providerId, model.id);
        }
        return pickBestProviderId({ modelId: model.id, availableProviderIds: llmProviderIds }) !== null;
      })
      .slice(0, 8);
  }, [allModels, favoriteModelEntries, llmProviderIds, recentModelEntries, chat?.providerId]);

  // Build a quick-switch list: favorites first, then recent, up to 9 models for number hotkeys
  // Sort alphabetically within each group to keep positions stable when switching models
  const quickSwitchModels = useMemo(() => {
    const sortedFavorites = [...favoriteModelObjects].sort((a, b) => a.name.localeCompare(b.name));
    const sortedRecent = [...recentModelObjects]
      .filter((m) => !favoriteModelObjects.some((f) => f.id === m.id))
      .sort((a, b) => a.name.localeCompare(b.name));
    return [...sortedFavorites, ...sortedRecent].slice(0, 9);
  }, [favoriteModelObjects, recentModelObjects]);

  // Check if OpenRouter is available - it can route to any model
  const hasOpenRouter = llmProviderIds.includes("openrouter");
  const canUseAnyModel = hasOpenRouter || chat?.providerId === "openrouter";

  // Use-case based recommendations (prioritizes catalog models when OpenRouter is available)
  const useCaseRecommendations = useMemo(() => {
    const cases = ["coding", "reasoning", "chat", "budget", "image-generation"] as const;
    const result: Record<string, Model[]> = {};

    for (const useCase of cases) {
      const rec = USE_CASE_RECOMMENDATIONS[useCase];
      if (!rec) continue;

      const models = rec.models
        .map(id => {
          // Try to find in allModels first (has provider data)
          const fromAll = allModels.find(m => m.id === id);
          if (fromAll) return fromAll;

          // If OpenRouter is available, use catalog models directly
          if (canUseAnyModel) {
            return MODEL_CATALOG.find(m => m.id === id);
          }

          return undefined;
        })
        .filter((m): m is Model => m !== undefined)
        .slice(0, 3); // Top 3 per category

      if (models.length > 0) {
        result[useCase] = models;
      }
    }

    return result;
  }, [allModels, canUseAnyModel]);

  // Check if we should show tool calling warning
  // Shows when MCP tools are enabled but model has "basic" tool calling tier
  const toolCallingWarning = useMemo(() => {
    if (!chat?.modelId) return null;
    const hasToolsEnabled = (chat?.activeMcpServerIds?.length ?? 0) > 0;
    if (!hasToolsEnabled) return null;

    const capabilities = getModelCapabilities(chat.modelId);
    if (capabilities.toolCallingTier !== "basic") return null;

    const modelName = currentModel?.name || chat.modelId.split("/").pop() || "This model";
    return {
      message: `${modelName} has limited tool calling. For complex workflows, try models with "Tools Elite" or "Tools Pro" badges.`,
      modelName,
    };
  }, [chat?.modelId, chat?.activeMcpServerIds, currentModel?.name]);

  // Number hotkeys Alt+1-9 for quick model switching
  useHotkeys(
    "alt+1,alt+2,alt+3,alt+4,alt+5,alt+6,alt+7,alt+8,alt+9",
    (e) => {
      e.preventDefault();
      const num = parseInt(e.key, 10);
      if (!isNaN(num) && num >= 1 && num <= 9) {
        const model = quickSwitchModels[num - 1];
        if (model && activeChatId) {
          handleQuickModelChange(model.id);
          // No toast - model indicator in UI shows the change
        }
      }
    },
    { enableOnFormTags: false },
    [quickSwitchModels, activeChatId]
  );

  // Use ref to avoid recreating listener on isArenaMode changes
  const isArenaModeRef = useRef(isArenaMode);
  useEffect(() => {
    isArenaModeRef.current = isArenaMode;
  }, [isArenaMode]);

  useEffect(() => {
    const handler = () => {
      if (!isArenaModeRef.current) setModelPickerOpen(true);
    };
    window.addEventListener("lumina:open-model-picker", handler);
    return () => window.removeEventListener("lumina:open-model-picker", handler);
  }, []); // Empty deps - listener registered once

  // Show tool calling warning as toast (once per chat session)
  const toolWarningShownRef = useRef(new Set<string>());
  useEffect(() => {
    if (!toolCallingWarning || !activeChatId) return;
    if (toolWarningDismissed) return;
    if (toolWarningShownRef.current.has(activeChatId)) return;

    toolWarningShownRef.current.add(activeChatId);
    toast.warning(toolCallingWarning.message, {
      duration: 8000,
      action: {
        label: "Disable Tools",
        onClick: async () => {
          if (activeChatId) {
            await updateChat(activeChatId, { activeMcpServerIds: [] });
            toast.success("Tools disabled for this chat");
          }
        },
      },
    });
  }, [toolCallingWarning, activeChatId, toolWarningDismissed]);

  const handleModelChange = async (modelId: string) => {
    if (isDraftMode && draftChatConfig) {
      // Update draft config instead of DB
      useUIStore.getState().setDraftChatConfig({
        ...draftChatConfig,
        modelId,
      });
    } else if (activeChatId) {
      const updates: { modelId: string; providerId?: string } = { modelId };

      // Check for remembered provider preference first
      const remembered = lastProviderIdByModel?.[modelId];
      if (
        remembered &&
        llmProviderIds.includes(remembered) &&
        isModelIdCompatibleWithProviderId(remembered, modelId)
      ) {
        updates.providerId = remembered;
      } else if (chat?.providerId && !isModelIdCompatibleWithProviderId(chat.providerId, modelId)) {
        // Current provider incompatible, fall back to best provider
        const next = pickBestProviderId({ modelId, availableProviderIds: llmProviderIds });
        updates.providerId = next || undefined;
      }

      await updateChat(activeChatId, updates);

      // Also persist model preference to the agent if one is selected
      if (chat?.agentId && currentAgent && currentAgent.executionType !== "pipeline") {
        await updateAgent(chat.agentId, { modelId });
      }
    }
  };

  const handleQuickModelChange = async (modelId: string) => {
    if (chat?.modelId === modelId) return;

    if (isDraftMode && draftChatConfig) {
      // Update draft config instead of DB
      useUIStore.getState().setDraftChatConfig({
        ...draftChatConfig,
        modelId,
      });
      useSettingsStore.getState().updateDefaultModel(modelId);
      return;
    }

    if (!activeChatId) return;
    await updateModelLastUsed(modelId);

    const updates: { modelId: string; providerId?: string } = { modelId };

    // Check for remembered provider first
    const remembered = lastProviderIdByModel?.[modelId];
    if (
      remembered &&
      llmProviderIds.includes(remembered) &&
      isModelIdCompatibleWithProviderId(remembered, modelId)
    ) {
      updates.providerId = remembered;
    } else if (chat?.providerId && !isModelIdCompatibleWithProviderId(chat.providerId, modelId)) {
      // Current provider incompatible, fall back to best provider
      const next = pickBestProviderId({ modelId, availableProviderIds: llmProviderIds });
      updates.providerId = next || undefined;
    }

    await updateChat(activeChatId, updates);
    useSettingsStore.getState().updateDefaultModel(modelId);

    // Also persist model preference to the agent if one is selected
    if (chat?.agentId && currentAgent && currentAgent.executionType !== "pipeline") {
      await updateAgent(chat.agentId, { modelId });
    }
  };

  const handleArenaModelChange = (modelId: string) => {
    const newIds = [...arenaModelIds];
    newIds[arenaPickerOpen.index] = modelId;
    setArenaModelIds(newIds);
    setArenaPickerOpen({ open: false, index: 0 });
  };

  const handleNewChat = async () => {
    try {
      // Ensure settings are loaded before creating chat (prevents MCP servers from being empty on mobile)
      const state = useSettingsStore.getState();
      if (!state.isLoaded) {
        await state.loadSettings();
      }
      const { defaultProviderId, defaultModelId, defaultModelIdsByProvider, defaultMcpServerIds, defaultReasoningLevel, defaultTemperature, defaultMaxTokens } =
        useSettingsStore.getState();
      const { providerId, modelId } = getDefaultChatConfig({
        defaultProviderId,
        defaultModelId,
        defaultModelIdsByProvider,
      });
      const newChat = await createChat({
        title: "New Chat",
        modelId,
        providerId: providerId || undefined,
        activeMcpServerIds: defaultMcpServerIds,
        reasoningLevel: (defaultReasoningLevel as "low" | "medium" | "high" | "xhigh") || "medium",
        temperature: defaultTemperature,
        maxTokens: defaultMaxTokens,
      });
      setActiveChatId(newChat.id);
      // No toast - new chat appearing is obvious
    } catch {
      toast.error("Could not create chat");
    }
  };

  const toggleSplitView = () => {
    if (isSplitView) {
      // Disable split view
      setIsSplitView(false);
      setSecondaryChatId(null);
      // No toast - UI change is obvious
    } else {
      // Enable split view - set secondary to the most recent different chat
      setIsSplitView(true);
    }
  };

  const toggleArenaMode = () => {
    if (!isArenaMode) {
      // Initialize with current model vs another default
      setArenaModelIds([chat?.modelId || "openai/gpt-4o", "anthropic/claude-3.5-sonnet"]);
    }
    setIsArenaMode(!isArenaMode);
  };

  const providerId = chat
    ? (chat.providerId && isModelIdCompatibleWithProviderId(chat.providerId, chat.modelId)
      ? chat.providerId
      : pickBestProviderId({
        modelId: chat.modelId,
        availableProviderIds: llmProviderIds,
      }))
    : null;

  // Show error state if critical queries timed out
  if (chatDataQuery.isTimedOut || messagesQuery.isTimedOut) {
    return (
      <EmptyState
        icon={MessageSquare}
        title="Database Timeout"
        description="The database is not responding. This may indicate a stale cache or corrupted database."
        action={{
          label: "Refresh Page",
          onClick: () => window.location.reload(),
        }}
        secondaryAction={{
          label: "Clear Cache & Reload",
          onClick: async () => {
            if ("caches" in window) {
              const cacheNames = await caches.keys();
              await Promise.all(cacheNames.map((name) => caches.delete(name)));
            }
            if ("serviceWorker" in navigator) {
              const registrations = await navigator.serviceWorker.getRegistrations();
              await Promise.all(registrations.map((reg) => reg.unregister()));
            }
            window.location.reload();
          },
        }}
        className="h-full"
      />
    );
  }

  if (!activeChatId && !isDraftMode) {
    return (
      <EmptyState
        icon={MessageSquare}
        title="Welcome to Lumina"
        description="Select a chat from the sidebar or create a new one to get started with your AI conversations."
        action={{
          label: "New Chat",
          onClick: handleNewChat,
        }}
        secondaryAction={{
          label: "Browse Chats",
          onClick: () => window.dispatchEvent(new CustomEvent("lumina:open-sidebar")),
        }}
        className="h-full"
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <ResizablePanelGroup direction="horizontal" className="h-full">
        <ResizablePanel defaultSize={showArtifacts ? 60 : 100} minSize={30}>
          <div className="flex h-full flex-col">
            {/* Header - Minimal by default, expands on hover */}
            <header
              className={cn(
                "sticky top-0 z-20 border-b bg-background/95 backdrop-blur-sm transition-all duration-200",
                isWelcomeMode ? "border-transparent" : "border-border/30",
                headerExpanded && "bg-card/80 backdrop-blur-xl"
              )}
              onMouseEnter={() => setHeaderExpanded(true)}
              onMouseLeave={() => setHeaderExpanded(false)}
            >
              <div className="flex items-center justify-between px-3 sm:px-6 h-12">
                {/* Left: Title (hidden on mobile for cleaner look) */}
                <div className="hidden sm:flex items-center gap-3 min-w-0 flex-1">
                  <div className="flex flex-col min-w-0">
                    <h1 className="text-sm font-medium truncate text-foreground max-w-none">{chat?.title || "Chat"}</h1>
                  </div>
                  <OfflineIndicator className="inline-flex" />
                </div>
                {/* Mobile: Active chats indicator (opens sidebar) */}
                <div className="sm:hidden flex-1 flex items-center">
                  {activeStreamCount > 0 && (
                    <button
                      onClick={() => window.dispatchEvent(new CustomEvent("lumina:open-sidebar"))}
                      className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-primary/10 hover:bg-primary/20 transition-colors text-xs font-medium text-primary"
                    >
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                      </span>
                      {activeStreamCount} active
                    </button>
                  )}
                </div>

                {/* Right: Model Selector + Settings (Agent selector hidden on mobile) */}
                <div className="flex items-center gap-1">
                  {/* Agent Selector - hidden on mobile for cleaner look */}
                  {!isArenaMode && chat && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="hidden sm:flex h-8 gap-1.5 px-3 text-xs font-medium border-border/50"
                      onClick={() => setAgentPickerOpen(true)}
                    >
                      <div className="flex items-center gap-1.5">
                        {currentAgent ? (
                          <>
                            <span className="text-sm leading-none">{currentAgent.avatar || "🤖"}</span>
                            <div className="flex flex-col items-start leading-none">
                              <span className="max-w-[120px] truncate font-medium">
                                {currentAgent.name}
                              </span>
                              {currentAgent.executionType === "pipeline" && currentAgent.pipeline?.steps?.length ? (
                                <span className="text-[10px] text-muted-foreground">
                                  Pipeline ({currentAgent.pipeline.steps.length} steps)
                                </span>
                              ) : currentAgent.modelId && (
                                <span className="text-[10px] text-muted-foreground">
                                  {getModelById(currentAgent.modelId)?.name || currentAgent.modelId.split("/").pop()}
                                </span>
                              )}
                            </div>
                          </>
                        ) : (
                          <>
                            <Bot className="h-4 w-4 text-muted-foreground" />
                            <span className="text-muted-foreground">Agent</span>
                          </>
                        )}
                      </div>
                    </Button>
                  )}

                  {/* Model Selector - simplified on mobile */}
                  {!isArenaMode && chat && !(currentAgent?.executionType === "pipeline" && currentAgent.pipeline?.steps?.length) && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1.5 px-2 sm:px-3 text-xs font-medium border-border/50"
                        >
                          <div className="flex flex-col items-start leading-none">
                            <span className="max-w-[100px] sm:max-w-[180px] truncate text-xs">
                              {modelAliasMap.get(chat.modelId) || currentModel?.name || "Model"}
                            </span>
                            {providerId && (
                              <span className="hidden sm:block text-[10px] text-muted-foreground">
                                {providerId === "openrouter" ? "OpenRouter" : providerLabel(providerId)}
                              </span>
                            )}
                          </div>
                          <ChevronDown className="h-3 w-3 opacity-60" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-96 max-h-[70vh]">
                        {/* Provider Section */}
                        {providerId && (() => {
                          const compatibleProviders = llmProviderIds
                            .filter(pid => isModelIdCompatibleWithProviderId(pid, chat.modelId))
                            .map(pid => ({ id: pid, label: providerLabel(pid) }))
                            .sort((a, b) => a.label.localeCompare(b.label));

                          if (compatibleProviders.length > 1) {
                            return (
                              <>
                                <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase tracking-wider">
                                  Provider
                                </DropdownMenuLabel>
                                {compatibleProviders.map((p) => (
                                  <DropdownMenuItem
                                    key={p.id}
                                    onClick={async () => {
                                      if (activeChatId) {
                                        await updateChat(activeChatId, { providerId: p.id });
                                        // Remember this provider for this model
                                        if (chat?.modelId) {
                                          await updateLastProviderForModel(chat.modelId, p.id);
                                        }
                                      }
                                    }}
                                    className="cursor-pointer"
                                  >
                                    <div className="flex w-full items-center gap-2">
                                      <span>{p.label}</span>
                                      {providerId === p.id && (
                                        <Check className="ml-auto h-4 w-4 text-primary" />
                                      )}
                                    </div>
                                  </DropdownMenuItem>
                                ))}
                                <DropdownMenuSeparator />
                              </>
                            );
                          }
                          return null;
                        })()}

                        {/* Quick Switch (Favorites + Recent) */}
                        {quickSwitchModels.length > 0 && (
                          <>
                            <DropdownMenuLabel className="flex items-center justify-between">
                              <span className="flex items-center gap-1.5">
                                <Sparkles className="h-3 w-3 text-yellow-500" />
                                Quick Switch
                              </span>
                              <span className="text-[10px] text-muted-foreground font-normal">Alt+1-9</span>
                            </DropdownMenuLabel>
                            {quickSwitchModels.slice(0, 5).map((model, idx) => {
                              const capabilities = getModelCapabilities(model.id);
                              const costDisplay = formatModelCost(model.inputCost, model.outputCost);
                              const isFree = model.inputCost + model.outputCost === 0;
                              return (
                                <DropdownMenuItem
                                  key={model.id}
                                  onClick={() => handleQuickModelChange(model.id)}
                                  className="cursor-pointer py-1.5"
                                >
                                  <div className="flex w-full items-center gap-2">
                                    <span className="w-4 h-4 rounded bg-muted flex items-center justify-center text-[10px] font-medium text-muted-foreground shrink-0">
                                      {idx + 1}
                                    </span>
                                    <span className="truncate flex-1 text-sm">{model.name}</span>
                                    <div className="flex items-center gap-0.5 shrink-0">
                                      {capabilities.supportsVision && <Eye className="h-3 w-3 text-sky-500" />}
                                      {capabilities.supportsReasoning && <Brain className="h-3 w-3 text-purple-500" />}
                                    </div>
                                    <span className={cn("text-[10px] shrink-0", isFree ? "text-green-500" : "text-muted-foreground")}>
                                      {costDisplay}
                                    </span>
                                    {chat?.modelId === model.id && <Check className="h-3 w-3 text-primary shrink-0" />}
                                  </div>
                                </DropdownMenuItem>
                              );
                            })}
                            <DropdownMenuSeparator />
                          </>
                        )}

                        {/* Use Case Recommendations */}
                        {Object.keys(useCaseRecommendations).length > 0 && (
                          <>
                            <DropdownMenuLabel className="text-[10px] text-muted-foreground uppercase tracking-wider">
                              Recommended for
                            </DropdownMenuLabel>

                            {/* Coding */}
                            {useCaseRecommendations.coding && (
                              <div className="px-2 py-1">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <Code className="h-3 w-3 text-blue-500" />
                                  <span className="text-[10px] font-medium text-muted-foreground">Coding</span>
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {useCaseRecommendations.coding.map(model => (
                                    <button
                                      key={model.id}
                                      onClick={() => handleQuickModelChange(model.id)}
                                      className={cn(
                                        "px-2 py-0.5 text-[11px] rounded-md border transition-colors",
                                        chat?.modelId === model.id
                                          ? "bg-primary text-primary-foreground border-primary"
                                          : "bg-muted/50 hover:bg-muted border-border/50 hover:border-border"
                                      )}
                                    >
                                      {model.name}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Reasoning */}
                            {useCaseRecommendations.reasoning && (
                              <div className="px-2 py-1">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <Brain className="h-3 w-3 text-purple-500" />
                                  <span className="text-[10px] font-medium text-muted-foreground">Reasoning</span>
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {useCaseRecommendations.reasoning.map(model => (
                                    <button
                                      key={model.id}
                                      onClick={() => handleQuickModelChange(model.id)}
                                      className={cn(
                                        "px-2 py-0.5 text-[11px] rounded-md border transition-colors",
                                        chat?.modelId === model.id
                                          ? "bg-primary text-primary-foreground border-primary"
                                          : "bg-muted/50 hover:bg-muted border-border/50 hover:border-border"
                                      )}
                                    >
                                      {model.name}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Fast Chat */}
                            {useCaseRecommendations.chat && (
                              <div className="px-2 py-1">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <Zap className="h-3 w-3 text-orange-500" />
                                  <span className="text-[10px] font-medium text-muted-foreground">Fast</span>
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {useCaseRecommendations.chat.map(model => (
                                    <button
                                      key={model.id}
                                      onClick={() => handleQuickModelChange(model.id)}
                                      className={cn(
                                        "px-2 py-0.5 text-[11px] rounded-md border transition-colors",
                                        chat?.modelId === model.id
                                          ? "bg-primary text-primary-foreground border-primary"
                                          : "bg-muted/50 hover:bg-muted border-border/50 hover:border-border"
                                      )}
                                    >
                                      {model.name}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Budget */}
                            {useCaseRecommendations.budget && (
                              <div className="px-2 py-1">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <DollarSign className="h-3 w-3 text-green-500" />
                                  <span className="text-[10px] font-medium text-muted-foreground">Budget</span>
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {useCaseRecommendations.budget.map(model => (
                                    <button
                                      key={model.id}
                                      onClick={() => handleQuickModelChange(model.id)}
                                      className={cn(
                                        "px-2 py-0.5 text-[11px] rounded-md border transition-colors",
                                        chat?.modelId === model.id
                                          ? "bg-primary text-primary-foreground border-primary"
                                          : "bg-muted/50 hover:bg-muted border-border/50 hover:border-border"
                                      )}
                                    >
                                      {model.name}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Image Generation */}
                            {useCaseRecommendations["image-generation"] && (
                              <div className="px-2 py-1">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <ImageIcon className="h-3 w-3 text-pink-500" />
                                  <span className="text-[10px] font-medium text-muted-foreground">Image</span>
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {useCaseRecommendations["image-generation"].map(model => (
                                    <button
                                      key={model.id}
                                      onClick={() => handleQuickModelChange(model.id)}
                                      className={cn(
                                        "px-2 py-0.5 text-[11px] rounded-md border transition-colors",
                                        chat?.modelId === model.id
                                          ? "bg-primary text-primary-foreground border-primary"
                                          : "bg-muted/50 hover:bg-muted border-border/50 hover:border-border"
                                      )}
                                    >
                                      {model.name}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                            <DropdownMenuSeparator />
                          </>
                        )}

                        {/* Browse all */}
                        <DropdownMenuItem
                          onClick={() => setModelPickerOpen(true)}
                          className="cursor-pointer font-medium"
                        >
                          Browse all models
                          <DropdownMenuShortcut>⌘M</DropdownMenuShortcut>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}

                  {isArenaMode && (
                    <Badge variant="secondary" className="h-8 px-3 text-xs font-medium">
                      Arena Mode
                    </Badge>
                  )}

                  {!providerId && !isArenaMode && (
                    <Badge
                      variant="destructive"
                      className="h-8 text-xs font-medium px-3 cursor-pointer"
                      onClick={() => router.push("/settings?tab=api-keys")}
                      title="Configure a provider"
                    >
                      No provider
                    </Badge>
                  )}

                  {/* Tool toggle - visible on all screen sizes */}
                  <ToolQuickToggle chatId={activeChatId || undefined} />

                  <ChatSettingsPopover
                    chatId={activeChatId || undefined}
                    onOpenAgentPicker={() => setAgentPickerOpen(true)}
                    onOpenBudgetDialog={() => setBudgetDialogOpen(true)}
                    isArenaMode={isArenaMode}
                    onToggleArena={toggleArenaMode}
                  />

                  {/* Desktop only buttons - always visible */}
                  <div className="hidden sm:flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn("h-8 w-8", isSplitView && "text-primary")}
                      onClick={toggleSplitView}
                      title={isSplitView ? "Exit Split View" : "Split View"}
                    >
                      <Columns2 className="h-4 w-4" />
                    </Button>

                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn("h-8 w-8", isFocusMode && "text-primary")}
                      onClick={() => setIsFocusMode(!isFocusMode)}
                      title={isFocusMode ? "Exit Focus Mode" : "Enter Focus Mode"}
                    >
                      {isFocusMode ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                    </Button>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setShowArtifacts(!showArtifacts)}
                      title={showArtifacts ? "Hide artifacts" : "Show artifacts"}
                    >
                      {showArtifacts ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </div>
            </header>

            {/* Messages Area */}
            <div className="flex-1 overflow-hidden relative">
              {isWelcomeMode ? (
                <EmptyStateWelcome
                  onSuggestionClick={handleSuggestionClick}
                  modelName={currentModel?.name}
                />
              ) : isArenaMode && arenaModelIds.length >= 2 ? (
                <ResizablePanelGroup direction="horizontal" className="h-full">
                  <ResizablePanel defaultSize={50} minSize={20}>
                    <div className="flex flex-col h-full border-r">
                      <div className="px-4 py-1.5 border-b bg-background/60 backdrop-blur flex justify-between items-center">
                        <span className="text-[10px] font-bold uppercase">{getModelById(arenaModelIds[0])?.name || arenaModelIds[0].split("/").pop()?.replace(/-/g, " ") || "Model 1"}</span>
                        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setArenaPickerOpen({ open: true, index: 0 })}>
                          <Settings className="h-3 w-3" />
                        </Button>
                      </div>
                      <MessageList chatId={activeChatId} arenaModelId={arenaModelIds[0]} />
                    </div>
                  </ResizablePanel>
                  <ResizableHandle withHandle />
                  <ResizablePanel defaultSize={50} minSize={20}>
                    <div className="flex flex-col h-full">
                      <div className="px-4 py-1.5 border-b bg-background/60 backdrop-blur flex justify-between items-center">
                        <span className="text-[10px] font-bold uppercase">{getModelById(arenaModelIds[1])?.name || arenaModelIds[1].split("/").pop()?.replace(/-/g, " ") || "Model 2"}</span>
                        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setArenaPickerOpen({ open: true, index: 1 })}>
                          <Settings className="h-3 w-3" />
                        </Button>
                      </div>
                      <MessageList chatId={activeChatId} arenaModelId={arenaModelIds[1]} />
                    </div>
                  </ResizablePanel>
                </ResizablePanelGroup>
              ) : isSplitView ? (
                <ResizablePanelGroup direction="horizontal" className="h-full">
                  <ResizablePanel defaultSize={50} minSize={30}>
                    <MessageList
                      chatId={activeChatId}
                      onSendMessage={(content) => {
                        window.dispatchEvent(new CustomEvent("lumina:send-message", { detail: { content } }));
                      }}
                    />
                  </ResizablePanel>
                  <ResizableHandle withHandle />
                  <ResizablePanel defaultSize={50} minSize={30}>
                    {secondaryChatId ? (
                      <MessageList
                        chatId={secondaryChatId}
                        onSendMessage={(content) => {
                          window.dispatchEvent(new CustomEvent("lumina:send-message", { detail: { content } }));
                        }}
                      />
                    ) : (
                      <EmptyState
                        icon={MessageSquare}
                        title="Select a chat"
                        description="Click on a chat from the sidebar to view it here"
                        className="h-full"
                      />
                    )}
                  </ResizablePanel>
                </ResizablePanelGroup>
              ) : (
                <MessageList
                  chatId={activeChatId}
                  onSendMessage={(content) => {
                    window.dispatchEvent(new CustomEvent("lumina:send-message", { detail: { content } }));
                  }}
                />
              )}
            </div>

            {/* Input */}
            <div className="border-t border-border/40 bg-background p-2 sm:p-4 safe-area-bottom">
              <InputArea chatId={activeChatId} />
            </div>
          </div>
        </ResizablePanel>

        {showArtifacts && (
          <>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={40} minSize={20}>
              <ArtifactShell />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>

      {/* Model Picker Dialog - Lazy loaded */}
      {chat && (
        <Suspense fallback={null}>
          <ModelPickerDialog
            open={modelPickerOpen}
            onOpenChange={setModelPickerOpen}
            currentModelId={chat.modelId}
            onSelectModel={handleModelChange}
            currentProviderId={chat.providerId}
            onSelectProviderId={(providerId) => activeChatId && updateChat(activeChatId, { providerId })}
          />
        </Suspense>
      )}

      {/* Arena Model Picker - Lazy loaded */}
      <Suspense fallback={null}>
        <ModelPickerDialog
          open={arenaPickerOpen.open}
          onOpenChange={(open) => setArenaPickerOpen(prev => ({ ...prev, open }))}
          currentModelId={arenaModelIds[arenaPickerOpen.index]}
          onSelectModel={handleArenaModelChange}
        />
      </Suspense>

      {/* Agent Picker - Lazy loaded */}
      {chat && (
        <Suspense fallback={null}>
          <AgentPickerDialog
            open={agentPickerOpen}
            onOpenChange={setAgentPickerOpen}
            chatId={chat.id}
            currentAgentId={chat.agentId}
          />
        </Suspense>
      )}

      {/* Budget Settings Dialog */}
      <BudgetSettingsDialog
        chatId={activeChatId || undefined}
        open={budgetDialogOpen}
        onOpenChange={setBudgetDialogOpen}
      />

      {/* Global Skill Editor Dialog (for Convert to Skill feature) */}
      <Suspense fallback={null}>
        <SkillEditorDialog
          open={skillEditorOpen}
          onOpenChange={setSkillEditorOpen}
        />
      </Suspense>

      {/* Global Agent Editor Dialog (for Convert to Agent feature) */}
      <Suspense fallback={null}>
        <AgentEditorDialog
          open={agentEditorOpen}
          onOpenChange={setAgentEditorOpen}
        />
      </Suspense>

      {/* Skill Approval Dialog */}
      <SkillApprovalDialog />
    </div>
  );
}
