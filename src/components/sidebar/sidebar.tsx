"use client";

import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useUIStore } from "@/stores/ui-store";
import { ProjectSelector } from "@/components/projects/project-selector";
import { ChatList } from "./chat-list";
import { useSidebarKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";

export function Sidebar() {
  const [searchQuery, setSearchQuery] = useState("");
  const [currentProjectId, setCurrentProjectId] = useState<string | undefined>();
  const setActiveChatId = useUIStore((state) => state.setActiveChatId);

  // Register sidebar keyboard shortcuts (Cmd+F for search)
  useSidebarKeyboardShortcuts();

  const handleNewChat = async () => {
    // Import dynamically to avoid circular dependencies
    const { createChat } = await import("@/lib/db/queries");
    const { DEFAULT_MODEL } = await import("@/lib/constants/models");

    const newChat = await createChat({
      title: "New Chat",
      modelId: DEFAULT_MODEL.id,
    });

    setActiveChatId(newChat.id);
  };

  return (
    <div className="flex h-full flex-col border-r bg-background">
      {/* Header */}
      <div className="border-b">
        <div className="flex items-center justify-between px-4 py-3">
          <h2 className="text-lg font-semibold">Lumina</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleNewChat}
            title="New chat"
          >
            <Plus className="h-5 w-5" />
          </Button>
        </div>
        <div className="px-4 pb-3">
          <ProjectSelector
            currentProjectId={currentProjectId}
            onProjectChange={setCurrentProjectId}
          />
        </div>
      </div>

      {/* Search */}
      <div className="border-b px-4 py-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search chats..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-search-input
          />
        </div>
      </div>

      {/* Chat List */}
      <ScrollArea className="flex-1">
        <ChatList searchQuery={searchQuery} />
      </ScrollArea>
    </div>
  );
}
