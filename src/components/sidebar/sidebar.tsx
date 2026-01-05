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

export function Sidebar() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const currentProjectId = useSettingsStore((state) => state.currentProjectId);
  const updateCurrentProject = useSettingsStore((state) => state.updateCurrentProject);
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
    <div className="flex h-full flex-col border-r bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/65">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3">
          <h2 className="text-lg font-semibold tracking-tight">Lumina</h2>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9"
              onClick={() => router.push("/settings")}
              title="Settings"
            >
              <Settings className="h-5 w-5" />
            </Button>
            <Button
              variant="default"
              size="icon"
              className="h-9 w-9 font-semibold"
              onClick={handleNewChat}
              title="New chat"
            >
              <Plus className="h-5 w-5" />
            </Button>
          </div>
        </div>
        <div className="px-3 sm:px-4 pb-3">
          <ProjectSelector
            currentProjectId={currentProjectId}
            onProjectChange={updateCurrentProject}
          />
        </div>
      </div>

      {/* Search */}
      <div className="border-b bg-background/50 px-3 sm:px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/40">
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
        <Button onClick={handleNewChat} className="w-full mt-3 gap-2 h-10 text-[15px] font-semibold" size="sm">
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
