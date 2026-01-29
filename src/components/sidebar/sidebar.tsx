"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { SquarePen, Search, Settings, FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUIStore } from "@/stores/ui-store";
import { useSettingsStore } from "@/stores/settings-store";
import { ProjectSelector } from "@/components/projects/project-selector";
import { ChatList } from "./chat-list";
import { useSidebarKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { getDefaultChatConfig } from "@/lib/ai/default-chat";
import { createChat, getChatWithMessages, createFolder } from "@/lib/db/queries";
import { SyncStatusIndicator } from "@/components/sync-status-indicator";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface SidebarProps {
  onNavigate?: () => void;
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const currentProjectId = useSettingsStore((state) => state.currentProjectId);
  const updateCurrentProject = useSettingsStore((state) => state.updateCurrentProject);
  const activeChatId = useUIStore((state) => state.activeChatId);
  const setActiveChatId = useUIStore((state) => state.setActiveChatId);

  // Register sidebar keyboard shortcuts (Cmd+F for search)
  useSidebarKeyboardShortcuts();

  const handleNewChat = async () => {
    // Close sidebar immediately for responsive feel
    onNavigate?.();

    try {
      // Check if current chat is empty - if so, just stay on it instead of creating duplicate
      if (activeChatId) {
        const currentChat = await getChatWithMessages(activeChatId);
        if (currentChat && currentChat.messages.length === 0) {
          // Already on an empty chat, just focus input
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent("lumina:chat-created", { detail: { chatId: activeChatId } }));
          }, 100);
          return;
        }
      }

      // Ensure settings are loaded before creating chat
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
        projectId: currentProjectId,
        activeMcpServerIds: defaultMcpServerIds,
        reasoningLevel: (defaultReasoningLevel as "low" | "medium" | "high" | "xhigh") || "medium",
        temperature: defaultTemperature,
        maxTokens: defaultMaxTokens,
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

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Focus search input when opened
  useEffect(() => {
    if (isSearchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isSearchOpen]);

  // Close search when query is cleared and input loses focus
  const handleSearchBlur = () => {
    if (!searchQuery.trim()) {
      setIsSearchOpen(false);
    }
  };

  return (
    <div className="flex h-full w-full min-w-0 flex-col border-r border-border/50 bg-background overflow-x-hidden">
      {/* Header - minimal like ChatGPT */}
      <div className="flex items-center justify-between px-3 py-3">
        <div className="flex items-center gap-2">
          <img src="/icons/icon.svg" alt="Lumina" className="h-8 w-8 dark:hidden" />
          <img src="/icons/icon-dark.svg" alt="Lumina" className="h-8 w-8 hidden dark:block" />
          <ProjectSelector
            currentProjectId={currentProjectId}
            onProjectChange={updateCurrentProject}
            compact
          />
        </div>
        <div className="flex items-center gap-1">
          <SyncStatusIndicator />
          <Link href="/settings" prefetch title="Settings" onClick={onNavigate}>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
              aria-label="Settings"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Action List (ChatGPT style) */}
      <div className="px-3 pt-4 pb-4">
        {/* New Chat */}
        <button
          onClick={handleNewChat}
          className="flex w-full items-center gap-4 py-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <SquarePen className="h-5 w-5" />
          <span>New chat</span>
        </button>

        {/* Search */}
        {isSearchOpen ? (
          <div className="relative py-1">
            <Search className="absolute left-0 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              type="search"
              placeholder="Search chats..."
              className="pl-9 h-9 text-sm bg-transparent border-border/50 focus:border-border"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onBlur={handleSearchBlur}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setSearchQuery("");
                  setIsSearchOpen(false);
                }
              }}
              data-search-input
            />
          </div>
        ) : (
          <button
            onClick={() => setIsSearchOpen(true)}
            className="flex w-full items-center gap-4 py-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <Search className="h-5 w-5" />
            <span>Search chats</span>
          </button>
        )}

        {/* New Folder */}
        <button
          onClick={async () => {
            await createFolder("New Folder", undefined, currentProjectId);
            // No toast - folder appears in sidebar
          }}
          className="flex w-full items-center gap-4 py-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <FolderPlus className="h-5 w-5" />
          <span>New folder</span>
        </button>
      </div>

      {/* Chat List */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <ChatList searchQuery={searchQuery} onChatSelect={onNavigate} currentProjectId={currentProjectId} />
      </div>
    </div>
  );
}
