"use client";

import { useState, useEffect, useCallback } from "react";
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
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";
import { SkeletonLoader } from "@/components/ui/skeleton";
import { getMostRecentChat, createChat, getChatById } from "@/lib/db/queries";
import { getDefaultChatConfig } from "@/lib/ai/default-chat";
import { toast } from "sonner";

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

  /**
   * PERFORMANCE CRITICAL - Parallel Initialization
   *
   * Previously, settings and API keys loaded SEQUENTIALLY:
   *   await loadSettings();
   *   await loadKeys();
   *
   * This added unnecessary latency (each ~100-500ms). Now they load in PARALLEL.
   *
   * Device secret MUST initialize first (it's the encryption key for API keys),
   * but settings and keys can load concurrently after that.
   *
   * Also, API keys are now decrypted in parallel (see api-keys-store.ts).
   */
  useEffect(() => {
    const initAndLoad = async () => {
      // Device secret must init first - needed to decrypt API keys
      try {
        const { initializeDeviceSecret } = await import("@/lib/crypto/api-key-crypto");
        await initializeDeviceSecret();
      } catch (error) {
        console.warn("[Page] Error initializing device secret:", error);
      }

      // Load settings and API keys in PARALLEL for faster startup
      const loadPromises: Promise<void>[] = [];
      if (!settingsLoaded) {
        loadPromises.push(loadSettings());
      }
      if (!keysLoaded) {
        loadPromises.push(loadKeys());
      }
      await Promise.all(loadPromises);

      // Migrate S3 config from old _syncMeta location to API keys vault (if applicable)
      try {
        const { migrateS3ConfigToVault } = await import("@/lib/sync/device-id");
        await migrateS3ConfigToVault();
      } catch (error) {
        console.warn("[Page] S3 config migration:", error);
      }
    };

    initAndLoad();
  }, [loadSettings, loadKeys, settingsLoaded, keysLoaded]);

  // Auto-connect to Lumina if enabled in settings
  useEffect(() => {
    if (settingsLoaded) {
      import("@/stores/lumina-store").then(({ useLuminaStore }) => {
        useLuminaStore.getState().initFromSettings();
      });
    }
  }, [settingsLoaded]);

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

      // Use efficient query that only fetches the most recent chat
      const mostRecentChat = await getMostRecentChat();
      if (mostRecentChat) {
        useUIStore.getState().setActiveChatId(mostRecentChat.id);
      }
    };

    if (keysLoaded && keys.length > 0) {
      loadRecentChat();
    }
  }, [keysLoaded, keys.length]);

  /**
   * PERFORMANCE CRITICAL - Non-Blocking Visibility Handler
   *
   * Previously, this handler was async and AWAITED all operations:
   *   const handleVisibilityChange = async () => {
   *     await initializeDeviceSecret();
   *     await loadSettings();
   *     await loadKeys();
   *     ...
   *   }
   *
   * This BLOCKED the UI when switching tabs or resuming from background!
   * The app would freeze until all operations completed.
   *
   * FIX: Wrap in async IIFE so the handler returns immediately.
   * Operations run in background without blocking the main thread.
   */
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;

      // Run recovery in background - DO NOT await, DO NOT block UI
      (async () => {
        // Wait briefly for DB health hook to validate/reopen connection
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Re-initialize device secret on PWA resume (non-blocking)
        try {
          const { initializeDeviceSecret } = await import("@/lib/crypto/api-key-crypto");
          await initializeDeviceSecret();
        } catch (error) {
          console.warn("[Page] Error initializing device secret on resume:", error);
        }

        // Reload settings and API keys in parallel (non-blocking)
        try {
          await Promise.all([
            useSettingsStore.getState().loadSettings(),
            useApiKeysStore.getState().loadKeys(),
          ]);
        } catch (error) {
          console.warn("[Page] Error reloading settings/keys on resume:", error);
        }

        // Validate active chat still exists
        const activeChatId = useUIStore.getState().activeChatId;
        if (activeChatId) {
          try {
            const chat = await getChatById(activeChatId);
            if (!chat) {
              const mostRecentChat = await getMostRecentChat();
              useUIStore.getState().setActiveChatId(mostRecentChat?.id || null);
            }
          } catch (error) {
            console.warn("[Page] Error validating chat on visibility change:", error);
          }
        }
      })();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);


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
      try {
        // Ensure settings are loaded before setting up draft (needed for defaultMcpServerIds on mobile)
        const state = useSettingsStore.getState();
        if (!state.isLoaded) {
          await state.loadSettings();
        }

        const { defaultProviderId, defaultModelId, defaultModelIdsByProvider, defaultExecutionTarget, currentProjectId, defaultReasoningLevel, defaultMcpServerIds, defaultTemperature, defaultMaxTokens } =
          useSettingsStore.getState();
        const { providerId, modelId, executionTarget } = getDefaultChatConfig({
          defaultProviderId,
          defaultModelId,
          defaultModelIdsByProvider,
          defaultExecutionTarget,
        });

        // Set draft mode - don't create chat yet
        useUIStore.getState().setDraftChatConfig({
          modelId,
          providerId: providerId || undefined,
          executionTarget,
          projectId: currentProjectId,
          activeMcpServerIds: defaultMcpServerIds,
          reasoningLevel: (defaultReasoningLevel as "low" | "medium" | "high" | "xhigh") || "medium",
          temperature: defaultTemperature,
          maxTokens: defaultMaxTokens,
        });
        useUIStore.getState().setActiveChatId(null);

        // Dispatch event to focus input
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent("lumina:chat-created", { detail: { chatId: null } }));
        }, 100);
      } catch (error) {
        console.error("Failed to set up new chat:", error);
        toast.error("Failed to set up new chat. Please try again.");
      }
    };

    window.addEventListener("lumina:new-chat", handleNewChat);
    return () => window.removeEventListener("lumina:new-chat", handleNewChat);
  }, []);

  if (!settingsLoaded || !keysLoaded) {
    return (
      <div className="flex h-[100dvh] items-center justify-center">
        <SkeletonLoader variant="page" />
      </div>
    );
  }

  return (
    <div className="h-[100dvh] p-0 sm:p-2">
      <div className={cn(
        "h-full overflow-hidden rounded-none border-0 bg-background/90 shadow-[0_18px_70px_-40px_rgba(15,23,42,0.6)] backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:rounded-2xl sm:border",
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

      {/* Mobile sidebar - matches hamburger menu Sheet style */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="p-0 border-r border-border bg-background/80 backdrop-blur-xl w-[300px] [&>button]:hidden">
          <Sidebar onNavigate={() => setSidebarOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
