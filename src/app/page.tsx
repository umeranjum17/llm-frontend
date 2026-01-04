"use client";

import { useEffect } from "react";
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

export default function Home() {
  const router = useRouter();
  const { loadKeys, isLoaded: keysLoaded, keys } = useApiKeysStore();
  const { loadSettings, isLoaded: settingsLoaded } = useSettingsStore();

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
    // Redirect to onboarding if no API keys
    if (keysLoaded && keys.length === 0) {
      router.push("/onboarding");
    }
  }, [keysLoaded, keys, router]);

  if (!settingsLoaded || !keysLoaded) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="h-screen overflow-hidden">
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel defaultSize={25} minSize={20} maxSize={40}>
          <Sidebar />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={75}>
          <ChatShell />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
