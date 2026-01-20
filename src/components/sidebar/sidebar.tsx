"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Search, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUIStore } from "@/stores/ui-store";
import { useSettingsStore } from "@/stores/settings-store";
import { ProjectSelector } from "@/components/projects/project-selector";
import { ChatList } from "./chat-list";
import { useSidebarKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { getDefaultChatConfig } from "@/lib/ai/default-chat";
import { createChat } from "@/lib/db/queries";
import { toast } from "sonner";

interface SidebarProps {
  onNavigate?: () => void;
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const currentProjectId = useSettingsStore((state) => state.currentProjectId);
  const updateCurrentProject = useSettingsStore((state) => state.updateCurrentProject);
  const setActiveChatId = useUIStore((state) => state.setActiveChatId);

  // Register sidebar keyboard shortcuts (Cmd+F for search)
  useSidebarKeyboardShortcuts();

  const handleNewChat = async () => {
    // Close sidebar immediately for responsive feel
    onNavigate?.();

    try {
      // Ensure settings are loaded before creating chat
      const state = useSettingsStore.getState();
      if (!state.isLoaded) {
        await state.loadSettings();
      }
      const { defaultProviderId, defaultModelId, defaultModelIdsByProvider, defaultMcpServerIds, defaultReasoningLevel } =
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
        projectId: currentProjectId,
        activeMcpServerIds: defaultMcpServerIds,
        reasoningLevel: (defaultReasoningLevel as "low" | "medium" | "high" | "xhigh") || "medium",
      });

      setActiveChatId(newChat.id);
      
      // Dispatch event to focus input after chat is created
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent("lumina:chat-created", { detail: { chatId: newChat.id } }));
      }, 100);
    } catch (error) {
      console.error("Failed to create new chat:", error);
      toast.error("Failed to create new chat. Please try again.");
    }
  };

  return (
    <div className="flex h-full w-full min-w-0 flex-col border-r bg-background/30 backdrop-blur-xl supports-[backdrop-filter]:bg-background/20 overflow-x-hidden">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center gap-2 px-3 sm:px-4 py-2.5 sm:py-3">
          <h2 className="text-lg font-semibold tracking-tight">Lumina</h2>
          <div className="flex-1 min-w-0">
            <ProjectSelector
              currentProjectId={currentProjectId}
              onProjectChange={updateCurrentProject}
              compact
            />
          </div>
          <Link href="/settings" prefetch title="Settings" onClick={onNavigate}>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Search & New Chat */}
      <div className="flex items-center gap-2 px-3 sm:px-4 py-2.5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search..."
            className="pl-9 h-9 text-sm bg-muted/50 border-transparent focus:border-border focus:bg-background"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-search-input
          />
        </div>
        <Button
          onClick={handleNewChat}
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
          title="New chat"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Chat List */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <ChatList searchQuery={searchQuery} onChatSelect={onNavigate} currentProjectId={currentProjectId} />
      </div>
    </div>
  );
}
