import { useEffect } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useRouter } from "next/navigation";
import { useUIStore } from "@/stores/ui-store";
import { createChat } from "@/lib/db/queries";
import { toast } from "sonner";
import { useSettingsStore } from "@/stores/settings-store";
import { getDefaultChatConfig } from "@/lib/ai/default-chat";

export function useKeyboardShortcuts() {
  const router = useRouter();
  const { setActiveChatId } = useUIStore();

  // Cmd/Ctrl + N - New Chat
  useHotkeys("mod+n", async (e) => {
    e.preventDefault();
    try {
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
        activeMcpServerIds: defaultMcpServerIds,
        reasoningLevel: (defaultReasoningLevel as "low" | "medium" | "high" | "xhigh") || "medium",
        temperature: defaultTemperature,
        maxTokens: defaultMaxTokens,
      });
      setActiveChatId(newChat.id);
      toast.success("New chat created");
    } catch (error) {
      toast.error("Failed to create chat");
    }
  }, {
    enableOnFormTags: false,
  });

  // Cmd/Ctrl + \ - Toggle Split View
  useHotkeys("mod+\\", (e) => {
    e.preventDefault();
    const { isSplitView, setIsSplitView, setSecondaryChatId } = useUIStore.getState();
    const newState = !isSplitView;
    if (newState) {
      setIsSplitView(true);
      toast.success("Split view enabled - Alt+Click to select second chat");
    } else {
      setIsSplitView(false);
      setSecondaryChatId(null);
      toast.success("Split view disabled");
    }
  }, {
    enableOnFormTags: false,
  });

  // Cmd/Ctrl + M - Open model picker (unified shortcut)
  useHotkeys("mod+m", (e) => {
    e.preventDefault();
    window.dispatchEvent(new CustomEvent("lumina:open-model-picker"));
  }, {
    enableOnFormTags: false, // Don't trigger while typing
  });

  // Cmd/Ctrl + T - Open MCP Tools toggle
  useHotkeys("mod+t", (e) => {
    e.preventDefault();
    window.dispatchEvent(new CustomEvent("lumina:open-tools"));
  }, {
    enableOnFormTags: false,
  });

  // Cmd/Ctrl + / - Keyboard Shortcuts Help
  useHotkeys("mod+/", (e) => {
    e.preventDefault();
    router.push("/settings?tab=shortcuts");
  }, {
    enableOnFormTags: true,
  });

  // Cmd/Ctrl + F - Focus Search (handled by sidebar component)
  // Cmd/Ctrl + K - Command Palette (handled by command palette component)
  // Escape - Close modals (handled by individual dialog components)

  return null;
}

/**
 * Hook for chat-specific keyboard shortcuts
 * Use in chat components for input-related shortcuts
 */
export function useChatKeyboardShortcuts(onSend?: () => void) {
  // Cmd/Ctrl + Enter - Send message (alternative to Enter)
  useHotkeys("mod+enter", (e) => {
    e.preventDefault();
    if (onSend) {
      onSend();
    }
  }, {
    enableOnFormTags: ['TEXTAREA', 'INPUT'],
  });

  return null;
}

/**
 * Hook for sidebar-specific keyboard shortcuts
 */
export function useSidebarKeyboardShortcuts() {
  // Cmd/Ctrl + F - Focus Search
  useHotkeys("mod+f", (e) => {
    e.preventDefault();
    const searchInput = document.querySelector<HTMLInputElement>('[data-search-input]');
    if (searchInput) {
      searchInput.focus();
      searchInput.select();
    }
  }, {
    enableOnFormTags: false,
  });

  return null;
}
