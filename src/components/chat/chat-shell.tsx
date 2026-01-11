"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useLiveQuery } from "dexie-react-hooks";
import { useRouter } from "next/navigation";
import { useUIStore } from "@/stores/ui-store";
import {
  createChat,
  getChatById,
  getFavoriteModels,
  getRecentModels,
  updateChat,
  updateModelLastUsed,
  getMessages,
  getAllModelAliases,
} from "@/lib/db/queries";
import { MODELS, type Model, getModelById } from "@/lib/constants/models";
import { MessageList } from "./message-list";
import { InputArea } from "./input-area";
import { TagList } from "./tag-list";
import { cn } from "@/lib/utils";
import { useAutoTags } from "@/hooks/use-auto-tags";
import { useChatSummary } from "@/hooks/use-chat-summary";
import { ModelPickerDialog } from "@/components/model-picker/model-picker-dialog";
import { BudgetSettingsDialog } from "./budget-settings-dialog";
import { ChatSettingsPopover } from "./chat-settings-popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Check,
  Settings,
  ChevronDown,
  PanelRightOpen,
  PanelRightClose,
  Menu,
  Maximize2,
  Minimize2,
  Columns2,
} from "lucide-react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ArtifactShell } from "@/components/artifacts/artifact-shell";
import { AgentPickerDialog } from "@/components/agents/agent-picker-dialog";
import { useApiKeysStore } from "@/stores/api-keys-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useModelsStore } from "@/stores/models-store";
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
import { MessageSquare } from "lucide-react";

export function ChatShell() {
  const router = useRouter();
  const activeChatId = useUIStore((state) => state.activeChatId);
  const setActiveChatId = useUIStore((state) => state.setActiveChatId);
  const secondaryChatId = useUIStore((state) => state.secondaryChatId);
  const setSecondaryChatId = useUIStore((state) => state.setSecondaryChatId);
  const isSplitView = useUIStore((state) => state.isSplitView);
  const setIsSplitView = useUIStore((state) => state.setIsSplitView);
  const showArtifacts = useUIStore((state) => state.showArtifacts);
  const setShowArtifacts = useUIStore((state) => state.setShowArtifacts);
  const isArenaMode = useUIStore((state) => state.isArenaMode);
  const setIsArenaMode = useUIStore((state) => state.setIsArenaMode);
  const arenaModelIds = useUIStore((state) => state.arenaModelIds);
  const setArenaModelIds = useUIStore((state) => state.setArenaModelIds);
  const isFocusMode = useUIStore((state) => state.isFocusMode);
  const setIsFocusMode = useUIStore((state) => state.setIsFocusMode);
  const getKeyForProvider = useApiKeysStore((s) => s.getKeyForProvider);
  const keys = useApiKeysStore((s) => s.keys);
  const models = useModelsStore((state) => state.models);

  const llmProviderIds = useMemo(
    () =>
      Array.from(
        new Set(
          keys
            .map((k) => k.provider)
            .filter((p) =>
              ["openrouter", "openai", "anthropic", "groq", "together", "perplexity", "anyscale", "ollama", "lmstudio"].includes(p) ||
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

  // Get current chat details
  const chat = useLiveQuery(
    () => (activeChatId ? getChatById(activeChatId) : undefined),
    [activeChatId]
  );

  const messages = useLiveQuery(() => (activeChatId ? getMessages(activeChatId) : undefined), [activeChatId]);

  // Map messages to match ai SDK Message type (createdAt as Date)
  const aiMessages = useMemo(() => {
    if (!messages) return [];
    return messages.map((m) => ({
      ...m,
      createdAt: new Date(m.createdAt),
    })) as any[];
  }, [messages]);

  // Auto-tagging hook
  useAutoTags(activeChatId || "", aiMessages, chat?.tags);

  // Auto-summary hook
  useChatSummary(activeChatId || "", aiMessages, chat?.summary);

  const currentModel = chat ? getModelById(chat.modelId) : undefined;

  useEffect(() => {
    if (!chat?.providerId) return;
    if (isModelIdCompatibleWithProviderId(chat.providerId, chat.modelId)) return;
    updateChat(chat.id, { providerId: undefined }).catch(() => { });
  }, [chat?.id, chat?.modelId, chat?.providerId]);

  const favoriteModelEntries = useLiveQuery(() => getFavoriteModels(), []);
  const recentModelEntries = useLiveQuery(() => getRecentModels(6), []);
  const modelAliases = useLiveQuery(() => getAllModelAliases(), []);

  const modelAliasMap = useMemo(() => {
    const map = new Map<string, string>();
    (modelAliases || []).forEach(a => map.set(a.id, a.alias));
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
  const quickSwitchModels = useMemo(() => {
    const combined = [
      ...favoriteModelObjects,
      ...recentModelObjects.filter((m) => !favoriteModelObjects.some((f) => f.id === m.id)),
    ];
    return combined.slice(0, 9);
  }, [favoriteModelObjects, recentModelObjects]);

  // Keyboard shortcut: Cmd/Ctrl+M to open model picker
  useHotkeys(
    "mod+m",
    (e) => {
      e.preventDefault();
      if (!isArenaMode && activeChatId) {
        setModelPickerOpen(true);
      }
    },
    { enableOnFormTags: false }
  );

  // Number hotkeys 1-9 for quick model switching (when dropdown is NOT open, use Alt+1-9)
  useHotkeys(
    "alt+1,alt+2,alt+3,alt+4,alt+5,alt+6,alt+7,alt+8,alt+9",
    (e) => {
      e.preventDefault();
      const num = parseInt(e.key, 10);
      if (!isNaN(num) && num >= 1 && num <= 9) {
        const model = quickSwitchModels[num - 1];
        if (model && activeChatId) {
          handleQuickModelChange(model.id);
          toast.success(`Switched to ${model.name}`);
        }
      }
    },
    { enableOnFormTags: false },
    [quickSwitchModels, activeChatId]
  );

  useEffect(() => {
    const handler = () => {
      if (!isArenaMode) setModelPickerOpen(true);
    };
    window.addEventListener("lumina:open-model-picker", handler as EventListener);
    return () => window.removeEventListener("lumina:open-model-picker", handler as EventListener);
  }, [isArenaMode]);

  const handleModelChange = async (modelId: string) => {
    if (activeChatId) {
      const updates: { modelId: string; providerId?: string } = { modelId };

      // If the chat is pinned to an incompatible provider, switch to a compatible one.
      if (chat?.providerId && !isModelIdCompatibleWithProviderId(chat.providerId, modelId)) {
        const next = pickBestProviderId({ modelId, availableProviderIds: llmProviderIds });
        updates.providerId = next || undefined;
      }

      await updateChat(activeChatId, updates);
    }
  };

  const handleQuickModelChange = async (modelId: string) => {
    if (!activeChatId || chat?.modelId === modelId) return;
    await updateModelLastUsed(modelId);
    const updates: { modelId: string; providerId?: string } = { modelId };
    if (chat?.providerId && !isModelIdCompatibleWithProviderId(chat.providerId, modelId)) {
      const next = pickBestProviderId({ modelId, availableProviderIds: llmProviderIds });
      updates.providerId = next || undefined;
    }
    await updateChat(activeChatId, updates);
  };

  const handleArenaModelChange = (modelId: string) => {
    const newIds = [...arenaModelIds];
    newIds[arenaPickerOpen.index] = modelId;
    setArenaModelIds(newIds);
    setArenaPickerOpen({ open: false, index: 0 });
  };

  const handleNewChat = async () => {
    try {
      const { defaultProviderId, defaultModelId, defaultModelIdsByProvider } =
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
      });
      setActiveChatId(newChat.id);
      toast.success("New chat created");
    } catch {
      toast.error("Could not create chat");
    }
  };

  const toggleSplitView = () => {
    if (isSplitView) {
      // Disable split view
      setIsSplitView(false);
      setSecondaryChatId(null);
      toast.success("Split view disabled");
    } else {
      // Enable split view - set secondary to the most recent different chat
      setIsSplitView(true);
      toast.success("Split view enabled - Alt+Click a chat to select it for the second panel");
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

  if (!activeChatId) {
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
            {/* Header - Clean Single Row */}
            <header className="sticky top-0 z-20 border-b border-border/50 bg-card/80 backdrop-blur-xl supports-[backdrop-filter]:bg-card/60">
              <div className="flex items-center justify-between px-4 h-12">
                {/* Left: Menu + Title */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="sm:hidden h-8 w-8 shrink-0"
                    onClick={() => window.dispatchEvent(new CustomEvent("lumina:open-sidebar"))}
                    title="Open sidebar"
                  >
                    <Menu className="h-4 w-4" />
                  </Button>
                  <div className="flex flex-col min-w-0">
                    <h1 className="text-sm font-medium truncate text-foreground/90">{chat?.title || "Chat"}</h1>
                    {chat?.tags && chat.tags.length > 0 && (
                      <TagList tagIds={chat.tags} size="sm" className="mt-0.5" />
                    )}
                  </div>
                </div>

                {/* Right: Model Selector + Settings + Artifacts */}
                <div className="flex items-center gap-1.5">
                  {!isArenaMode && chat && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 gap-2 px-3 text-xs font-medium border-border/50"
                        >
                          <div className="flex flex-col items-start leading-none">
                            <span className="max-w-[120px] sm:max-w-[180px] truncate">
                              {modelAliasMap.get(chat.modelId) || currentModel?.name || "Select Model"}
                            </span>
                            {providerId && (
                              <span className="text-[10px] text-muted-foreground">
                                {providerId === "openrouter" ? "OpenRouter" : providerLabel(providerId)}
                              </span>
                            )}
                          </div>
                          <ChevronDown className="h-3 w-3 opacity-60" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-80">
                        {/* Provider Section */}
                        {providerId && (
                          <div className="space-y-3">
                            <div className="p-3 pb-0">
                              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Provider</span>
                            </div>
                            <div className="grid grid-cols-1 gap-1 px-1">
                              {(() => {
                                const compatibleProviders = llmProviderIds
                                  .filter(pid => isModelIdCompatibleWithProviderId(pid, chat.modelId))
                                  .map(pid => ({ id: pid, label: providerLabel(pid) }))
                                  .sort((a, b) => a.label.localeCompare(b.label));

                                if (compatibleProviders.length > 1) {
                                  return (
                                    <>
                                      {compatibleProviders.map((p) => (
                                        <DropdownMenuItem
                                          key={p.id}
                                          onClick={() => activeChatId && updateChat(activeChatId, { providerId: p.id })}
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
                            </div>
                          </div>
                        )}

                        <div className="px-1">
                          <DropdownMenuLabel className="flex items-center justify-between">
                            Quick Switch
                            <span className="text-xs text-muted-foreground font-normal">Alt+1-9</span>
                          </DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {quickSwitchModels.length > 0 ? (
                            quickSwitchModels.map((model, idx) => (
                              <DropdownMenuItem
                                key={model.id}
                                onClick={() => handleQuickModelChange(model.id)}
                                className="cursor-pointer"
                              >
                                <div className="flex w-full items-center gap-2">
                                  <span className="w-5 h-5 rounded bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground shrink-0">
                                    {idx + 1}
                                  </span>
                                  <span className="truncate flex-1">{model.name}</span>
                                  <span className="text-xs text-muted-foreground shrink-0">
                                    {model.provider}
                                  </span>
                                  {chat?.modelId === model.id && (
                                    <Check className="h-4 w-4 text-primary shrink-0" />
                                  )}
                                </div>
                              </DropdownMenuItem>
                            ))
                          ) : (
                            <div className="px-4 py-3 text-sm text-muted-foreground text-center">
                              No favorites or recent models.
                              <br />
                              Browse to add some!
                            </div>
                          )}
                        </div>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setModelPickerOpen(true)}
                          className="cursor-pointer"
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

                  <ChatSettingsPopover
                    chatId={activeChatId}
                    onOpenAgentPicker={() => setAgentPickerOpen(true)}
                    onOpenBudgetDialog={() => setBudgetDialogOpen(true)}
                    isArenaMode={isArenaMode}
                    onToggleArena={toggleArenaMode}
                  />

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
            </header>

            {/* Messages Area */}
            <div className="flex-1 overflow-hidden relative bg-background/20">
              {isArenaMode ? (
                <ResizablePanelGroup direction="horizontal" className="h-full">
                  <ResizablePanel defaultSize={50} minSize={20}>
                    <div className="flex flex-col h-full border-r">
                      <div className="px-4 py-1.5 border-b bg-background/60 backdrop-blur flex justify-between items-center">
                        <span className="text-[10px] font-bold uppercase">{getModelById(arenaModelIds[0] || "")?.name || arenaModelIds[0]?.split("/").pop()?.replace(/-/g, " ") || "Model 1"}</span>
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
                        <span className="text-[10px] font-bold uppercase">{getModelById(arenaModelIds[1] || "")?.name || arenaModelIds[1]?.split("/").pop()?.replace(/-/g, " ") || "Model 2"}</span>
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
            <div className="border-t border-border/70 bg-card/80 p-3 backdrop-blur-xl supports-[backdrop-filter]:bg-card/65 shadow-[0_-8px_30px_-24px_rgba(0,0,0,0.6)]">
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

      {/* Model Picker Dialog */}
      {chat && (
        <ModelPickerDialog
          open={modelPickerOpen}
          onOpenChange={setModelPickerOpen}
          currentModelId={chat.modelId}
          onSelectModel={handleModelChange}
          currentProviderId={chat.providerId}
          onSelectProviderId={(providerId) => activeChatId && updateChat(activeChatId, { providerId })}
        />
      )}

      {/* Arena Model Picker */}
      <ModelPickerDialog
        open={arenaPickerOpen.open}
        onOpenChange={(open) => setArenaPickerOpen(prev => ({ ...prev, open }))}
        currentModelId={arenaModelIds[arenaPickerOpen.index]}
        onSelectModel={handleArenaModelChange}
      />

      {chat && (
        <AgentPickerDialog
          open={agentPickerOpen}
          onOpenChange={setAgentPickerOpen}
          chatId={chat.id}
          currentAgentId={chat.agentId}
        />
      )}

      {/* Budget Settings Dialog */}
      <BudgetSettingsDialog
        chatId={activeChatId}
        open={budgetDialogOpen}
        onOpenChange={setBudgetDialogOpen}
      />
    </div>
  );
}
