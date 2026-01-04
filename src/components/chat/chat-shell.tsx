"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useUIStore } from "@/stores/ui-store";
import { getChatById, updateChat } from "@/lib/db/queries";
import { getModelById } from "@/lib/constants/models";
import { MessageList } from "./message-list";
import { InputArea } from "./input-area";
import { ReasoningControl } from "./reasoning-control";
import { ModelPickerDialog } from "@/components/model-picker/model-picker-dialog";
import { ToolSelector } from "@/components/tools/tool-selector";
import { BudgetSettingsDialog } from "./budget-settings-dialog";
import { TagSelector } from "@/components/tags/tag-selector";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Settings, ChevronDown, PanelRightOpen, PanelRightClose } from "lucide-react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ArtifactShell } from "@/components/artifacts/artifact-shell";

export function ChatShell() {
  const activeChatId = useUIStore((state) => state.activeChatId);
  const showArtifacts = useUIStore((state) => state.showArtifacts);
  const setShowArtifacts = useUIStore((state) => state.setShowArtifacts);
  const isArenaMode = useUIStore((state) => state.isArenaMode);
  const setIsArenaMode = useUIStore((state) => state.setIsArenaMode);
  const arenaModelIds = useUIStore((state) => state.arenaModelIds);
  const setArenaModelIds = useUIStore((state) => state.setArenaModelIds);

  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [arenaPickerOpen, setArenaPickerOpen] = useState<{ open: boolean, index: number }>({ open: false, index: 0 });

  // Get current chat details
  const chat = useLiveQuery(
    () => (activeChatId ? getChatById(activeChatId) : undefined),
    [activeChatId]
  );

  const currentModel = chat ? getModelById(chat.modelId) : undefined;

  const handleModelChange = async (modelId: string) => {
    if (activeChatId) {
      await updateChat(activeChatId, { modelId });
    }
  };

  const handleArenaModelChange = (modelId: string) => {
    const newIds = [...arenaModelIds];
    newIds[arenaPickerOpen.index] = modelId;
    setArenaModelIds(newIds);
    setArenaPickerOpen({ open: false, index: 0 });
  };

  const toggleArenaMode = () => {
    if (!isArenaMode) {
      // Initialize with current model vs another default
      setArenaModelIds([chat?.modelId || "gpt-4o", "claude-3-5-sonnet-latest"]);
    }
    setIsArenaMode(!isArenaMode);
  };

  if (!activeChatId) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center p-8">
        <h2 className="text-2xl font-bold mb-2">Welcome to Lumina</h2>
        <p className="text-muted-foreground mb-6">
          Select a chat from the sidebar or create a new one to get started
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <ResizablePanelGroup direction="horizontal" className="h-full">
        <ResizablePanel defaultSize={showArtifacts ? 60 : 100} minSize={30}>
          <div className="flex h-full flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b px-4 py-3 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <h2 className="font-semibold truncate">{chat?.title || "Chat"}</h2>
                {chat && (
                  <TagSelector
                    selectedTags={chat.tags || []}
                    onTagsChange={(tags) => updateChat(activeChatId, { tags })}
                  />
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant={isArenaMode ? "default" : "outline"}
                  size="sm"
                  onClick={toggleArenaMode}
                  className="gap-2"
                >
                  <span className="text-xs">Arena</span>
                </Button>

                {!isArenaMode && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setModelPickerOpen(true)}
                    className="gap-2"
                  >
                    <span className="text-sm">{currentModel?.name || "Select Model"}</span>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                )}

                {chat && (
                  <>
                    <ReasoningControl
                      level={chat.reasoningLevel || "medium"}
                      onChange={(level) => updateChat(activeChatId, { reasoningLevel: level })}
                    />
                    <ToolSelector
                      enabledTools={chat.enabledTools || []}
                      onToolsChange={(tools) => updateChat(activeChatId, { enabledTools: tools })}
                    />
                    <BudgetSettingsDialog chatId={activeChatId} />
                  </>
                )}
                <Button variant="ghost" size="icon" onClick={() => setShowArtifacts(!showArtifacts)}>
                  {showArtifacts ? <PanelRightClose className="h-5 w-5" /> : <PanelRightOpen className="h-5 w-5" />}
                </Button>
                <Button variant="ghost" size="icon">
                  <Settings className="h-5 w-5" />
                </Button>
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-hidden relative">
              {isArenaMode ? (
                <ResizablePanelGroup direction="horizontal" className="h-full">
                  <ResizablePanel defaultSize={50} minSize={20}>
                    <div className="flex flex-col h-full border-r">
                      <div className="px-4 py-1.5 border-b bg-muted/30 flex justify-between items-center">
                        <span className="text-[10px] font-bold uppercase">{getModelById(arenaModelIds[0] || "")?.name || "Model 1"}</span>
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
                      <div className="px-4 py-1.5 border-b bg-muted/30 flex justify-between items-center">
                        <span className="text-[10px] font-bold uppercase">{getModelById(arenaModelIds[1] || "")?.name || "Model 2"}</span>
                        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setArenaPickerOpen({ open: true, index: 1 })}>
                          <Settings className="h-3 w-3" />
                        </Button>
                      </div>
                      <MessageList chatId={activeChatId} arenaModelId={arenaModelIds[1]} />
                    </div>
                  </ResizablePanel>
                </ResizablePanelGroup>
              ) : (
                <MessageList chatId={activeChatId} />
              )}
            </div>

            {/* Input */}
            <div className="border-t bg-background p-4">
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
        />
      )}

      {/* Arena Model Picker */}
      <ModelPickerDialog
        open={arenaPickerOpen.open}
        onOpenChange={(open) => setArenaPickerOpen(prev => ({ ...prev, open }))}
        currentModelId={arenaModelIds[arenaPickerOpen.index]}
        onSelectModel={handleArenaModelChange}
      />
    </div>
  );
}
