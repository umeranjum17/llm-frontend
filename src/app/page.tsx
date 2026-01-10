"use client";

import { useEffect, useRef, useState } from "react";
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

export default function Home() {
  const router = useRouter();
  const { loadKeys, isLoaded: keysLoaded, keys } = useApiKeysStore();
  const { loadSettings, isLoaded: settingsLoaded, sidebarWidth, updateSidebarWidth } = useSettingsStore();
  const loadModels = useModelsStore((s) => s.loadModels);
  const sidebarSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

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
    loadModels().catch(() => {});
  }, [loadModels]);

  useEffect(() => {
    // Redirect to onboarding if no API keys
    if (keysLoaded && keys.length === 0) {
      router.push("/onboarding");
    }
  }, [keysLoaded, keys, router]);

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
        {isMobile ? (
          <ChatShell />
        ) : (
          <ResizablePanelGroup
            direction="horizontal"
            onLayout={(sizes) => {
              const next = sizes?.[0];
              if (typeof next !== "number") return;
              if (sidebarSaveTimeout.current) clearTimeout(sidebarSaveTimeout.current);
              sidebarSaveTimeout.current = setTimeout(() => {
                updateSidebarWidth(next).catch(() => {});
              }, 300);
            }}
          >
            <ResizablePanel 
              defaultSize={isWideScreen ? (sidebarWidth ?? 18) : (sidebarWidth ?? 22)} 
              minSize={isWideScreen ? 14 : 16} 
              maxSize={isWideScreen ? 28 : 32}
            >
              <Sidebar />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={isWideScreen ? 82 : 75}>
              <ChatShell />
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
