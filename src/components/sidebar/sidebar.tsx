"use client";

import { useState } from "react";
import { Plus, Search, Settings } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useUIStore } from "@/stores/ui-store";
import { useSettingsStore } from "@/stores/settings-store";
import { ProjectSelector } from "@/components/projects/project-selector";
import { ChatList } from "./chat-list";
import { useSidebarKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { getDefaultChatConfig } from "@/lib/ai/default-chat";

export function Sidebar() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const currentProjectId = useSettingsStore((state) => state.currentProjectId);
  const updateCurrentProject = useSettingsStore((state) => state.updateCurrentProject);
  const setActiveChatId = useUIStore((state) => state.setActiveChatId);

  // Register sidebar keyboard shortcuts (Cmd+F for search)
  useSidebarKeyboardShortcuts();

  const handleNewChat = async () => {
    try {
      // Import dynamically to avoid circular dependencies
      const { createChat } = await import("@/lib/db/queries");
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
        projectId: currentProjectId,
      });

      setActiveChatId(newChat.id);
    } catch (error) {
      console.error("Failed to create new chat:", error);
    }
  };

  return (
    <div className="flex h-full flex-col border-r bg-background/30 backdrop-blur-xl supports-[backdrop-filter]:bg-background/20">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3">
          <h2 className="text-lg font-semibold tracking-tight">Lumina</h2>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => router.push("/settings")}
            title="Settings"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
        <div className="px-3 sm:px-4 pb-3">
          <ProjectSelector
            currentProjectId={currentProjectId}
            onProjectChange={updateCurrentProject}
          />
        </div>
      </div>

      {/* Search & New Chat */}
      <div className="px-3 sm:px-4 py-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search chats..."
            className="pl-9 h-9 text-sm bg-muted/50 border-transparent focus:border-border focus:bg-background"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-search-input
          />
        </div>
        <Button
          onClick={handleNewChat}
          variant="outline"
          className="w-full mt-2 gap-2 h-9 text-sm font-medium border-dashed border-muted-foreground/30 text-muted-foreground hover:text-foreground hover:border-muted-foreground/50"
        >
          <Plus className="h-4 w-4" />
          New chat
        </Button>
      </div>

      {/* Chat List */}
      <ScrollArea className="flex-1">
        <ChatList searchQuery={searchQuery} />
      </ScrollArea>
    </div>
  );
}
