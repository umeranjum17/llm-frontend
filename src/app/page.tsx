"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useApiKeysStore } from "@/stores/api-keys-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Sidebar } from "@/components/sidebar/sidebar";
import { ChatShell } from "@/components/chat/chat-shell";
import { ensureBuiltIns } from "@/lib/db/seed";
import { useModelsStore } from "@/stores/models-store";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";
import { getAllChats } from "@/lib/db/queries";

export default function Home() {
  const router = useRouter();
  const { loadKeys, isLoaded: keysLoaded, keys } = useApiKeysStore();
  const { loadSettings, isLoaded: settingsLoaded } = useSettingsStore();
  const loadModels = useModelsStore((s) => s.loadModels);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const isFocusMode = useUIStore((state) => state.isFocusMode);

  // Register global keyboard shortcuts
  useKeyboardShortcuts();

  useEffect(() => {
    // Load settings and API keys on mount
    if (!settingsLoaded) {
      loadSettings();
    }
    if (!keysLoaded) {
      loadKeys();
    }
  }, [loadSettings, loadKeys, settingsLoaded, keysLoaded]);

  useEffect(() => {
    // Seed built-in agents/prompts once the app is running.
    ensureBuiltIns().catch((err) => console.error("Failed to seed built-ins:", err));
  }, []);

  useEffect(() => {
    loadModels().catch(() => { });
  }, [loadModels]);

  useEffect(() => {
    // Redirect to onboarding if no API keys
    if (keysLoaded && keys.length === 0) {
      router.push("/onboarding");
    }
  }, [keysLoaded, keys, router]);

  // Auto-load the most recent chat on app startup
  useEffect(() => {
    const loadRecentChat = async () => {
      const activeChatId = useUIStore.getState().activeChatId;
      if (activeChatId) return; // Already has an active chat

      const chats = await getAllChats();
      if (chats.length > 0) {
        // Get the most recent chat (first one after sorting by updatedAt)
        const mostRecentChat = chats[0];
        useUIStore.getState().setActiveChatId(mostRecentChat.id);
      }
    };

    if (keysLoaded && keys.length > 0) {
      loadRecentChat();
    }
  }, [keysLoaded, keys.length]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 768px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  // Wide screen detection for ultra-wide optimization
  const [isWideScreen, setIsWideScreen] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1920px)");
    const update = () => setIsWideScreen(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const handler = () => setSidebarOpen(true);
    window.addEventListener("lumina:open-sidebar", handler as EventListener);
    return () => window.removeEventListener("lumina:open-sidebar", handler as EventListener);
  }, []);

  // Handle new chat event from mobile nav
  useEffect(() => {
    const handleNewChat = async () => {
      const { createChat } = await import("@/lib/db/queries");
      const { getDefaultChatConfig } = await import("@/lib/ai/default-chat");
      const { defaultProviderId, defaultModelId, defaultModelIdsByProvider, currentProjectId } =
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

      useUIStore.getState().setActiveChatId(newChat.id);
    };

    window.addEventListener("lumina:new-chat", handleNewChat);
    return () => window.removeEventListener("lumina:new-chat", handleNewChat);
  }, []);

  if (!settingsLoaded || !keysLoaded) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="h-screen p-0 sm:p-2">
      <div className={cn(
        "h-full overflow-hidden rounded-none border-0 bg-background/70 shadow-[0_18px_70px_-40px_rgba(15,23,42,0.6)] backdrop-blur supports-[backdrop-filter]:bg-background/60 sm:rounded-2xl sm:border",
        isWideScreen && "max-w-[2560px] mx-auto"
      )}>
        {isMobile || isFocusMode ? (
          <div className={cn("h-full", isFocusMode && "max-w-4xl mx-auto px-4 sm:px-0")}>
            <ChatShell />
          </div>
        ) : (
          <ResizablePanelGroup
            direction="horizontal"
            className="h-full min-w-0"
            autoSaveId="lumina-main-layout"
          >
            <ResizablePanel
              id="sidebar"
              order={1}
              defaultSize={isWideScreen ? 16 : 20}
              minSize={isWideScreen ? 12 : 15}
              maxSize={isWideScreen ? 26 : 32}
              className="min-w-0"
            >
              <Sidebar />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel
              id="main"
              order={2}
              defaultSize={isWideScreen ? 84 : 80}
              className="min-w-0"
            >
              <div className="h-full min-w-0">
                <ChatShell />
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>

      <Dialog open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <DialogContent className="left-0 top-0 h-[100dvh] w-[100vw] max-w-none translate-x-0 translate-y-0 rounded-none p-0 sm:left-[50%] sm:top-[50%] sm:h-[90vh] sm:w-[92vw] sm:max-w-[360px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl">
          <Sidebar />
        </DialogContent>
      </Dialog>
    </div>
  );
}
