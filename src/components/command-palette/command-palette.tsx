"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useHotkeys } from "react-hotkeys-hook";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  MessageSquarePlus,
  Settings,
  Sparkles,
  Moon,
  Sun,
  Laptop,
  FileText,
  RefreshCw,
  ArrowRightLeft,
  GraduationCap,
  Eye,
  Brain,
  Wrench,
} from "lucide-react";
import { useUIStore } from "@/stores/ui-store";
import { useSettingsStore } from "@/stores/settings-store";
import { createChat, getChatById, updateChat, updateModelLastUsed } from "@/lib/db/queries";
import { MODELS, type Model, getModelById } from "@/lib/constants/models";
import { useTheme } from "next-themes";
import { useModelsStore } from "@/stores/models-store";
import { getDefaultChatConfig } from "@/lib/ai/default-chat";
import { useApiKeysStore } from "@/stores/api-keys-store";
import { isModelIdCompatibleWithProviderId, pickBestProviderId } from "@/lib/ai/provider-routing";
import { toast } from "sonner";
import Fuse from "fuse.js";
import { getModelCapabilities } from "@/lib/constants/model-capabilities";
import { formatModelCost } from "@/components/model-picker/model-item";
import { cn } from "@/lib/utils";

// Capability badges for command palette items
function ModelCapabilityBadges({ modelId }: { modelId: string }) {
  const capabilities = getModelCapabilities(modelId);
  if (!capabilities.supportsVision && !capabilities.supportsReasoning && !capabilities.supportsTools) {
    return null;
  }
  return (
    <div className="flex items-center gap-0.5 ml-2">
      {capabilities.supportsVision && (
        <span title="Vision"><Eye className="h-3 w-3 text-sky-500" /></span>
      )}
      {capabilities.supportsReasoning && (
        <span title="Reasoning"><Brain className="h-3 w-3 text-purple-500" /></span>
      )}
      {capabilities.supportsTools && (
        <span title="Tools"><Wrench className="h-3 w-3 text-amber-500" /></span>
      )}
    </div>
  );
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const router = useRouter();
  const { activeChatId, setActiveChatId } = useUIStore();
  const { theme, setTheme } = useTheme();
  const { models, loadModels } = useModelsStore();
  const keys = useApiKeysStore((s) => s.keys);

  // Get compatible LLM provider IDs
  const llmProviderIds = useMemo(
    () =>
      Array.from(
        new Set(
          keys
            .map((k) => k.provider)
            .filter((p) =>
              ["openrouter", "openai", "anthropic", "google", "groq", "together", "deepseek", "mistral", "xai", "perplexity", "anyscale"].includes(p) ||
              p.startsWith("custom-openai:")
            )
        )
      ),
    [keys]
  );

  // Cmd/Ctrl+Shift+P mirrors many "command palette" UX patterns and avoids common OS/browser conflicts.
  useHotkeys(
    "mod+shift+p",
    (e) => {
      e.preventDefault();
      setOpen((prev) => !prev);
    },
    { enableOnFormTags: false }
  );

  // Also respond to Cmd/Ctrl+K for model search
  useHotkeys(
    "mod+k",
    (e) => {
      e.preventDefault();
      setOpen(true);
      setSearch("");
    },
    { enableOnFormTags: false }
  );

  useEffect(() => {
    if (!open) {
      setSearch("");
      return;
    }
    loadModels().catch(() => { });
  }, [open, loadModels]);

  const allModels = models.length > 0 ? models : MODELS;

  // Available models (filtered by provider compatibility)
  const availableModels = useMemo(() => {
    return allModels.filter((model) =>
      pickBestProviderId({ modelId: model.id, availableProviderIds: llmProviderIds }) !== null
    );
  }, [allModels, llmProviderIds]);

  // Create Fuse.js instance for fuzzy search
  const fuse = useMemo(() => {
    if (availableModels.length === 0) return null;
    return new Fuse(availableModels, {
      keys: [
        { name: "name", weight: 0.5 },
        { name: "id", weight: 0.3 },
        { name: "provider", weight: 0.15 },
        { name: "description", weight: 0.05 },
      ],
      threshold: 0.4, // More forgiving
      distance: 100,
      ignoreLocation: true,
      includeScore: true,
      minMatchCharLength: 2,
      findAllMatches: true,
    });
  }, [availableModels]);

  // Filter models using fuzzy search
  const filteredModels = useMemo(() => {
    const q = search.trim();
    if (!q) {
      return availableModels.slice(0, 15);
    }
    if (fuse) {
      return fuse.search(q).map((r) => r.item).slice(0, 15);
    }
    // Fallback
    const lowerQ = q.toLowerCase();
    return availableModels
      .filter((model) => {
        const haystack = `${model.name} ${model.id} ${model.provider}`.toLowerCase();
        return haystack.includes(lowerQ);
      })
      .slice(0, 15);
  }, [availableModels, fuse, search]);

  const handleNewChat = async () => {
    // Ensure settings are loaded before creating chat
    const state = useSettingsStore.getState();
    if (!state.isLoaded) {
      await state.loadSettings();
    }
    const { defaultProviderId, defaultModelId, defaultModelIdsByProvider, defaultMcpServerIds } =
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
    });
    setActiveChatId(newChat.id);
    setOpen(false);
  };

  const handleSelectModelNewChat = async (modelId: string) => {
    // Ensure settings are loaded before creating chat
    const state = useSettingsStore.getState();
    if (!state.isLoaded) {
      await state.loadSettings();
    }
    const { defaultMcpServerIds } = useSettingsStore.getState();
    const newChat = await createChat({
      title: "New Chat",
      modelId,
      activeMcpServerIds: defaultMcpServerIds,
    });
    setActiveChatId(newChat.id);
    setOpen(false);
  };

  // Switch model for CURRENT active chat
  const handleSwitchModel = async (modelId: string) => {
    if (!activeChatId) {
      // No active chat, create new one
      await handleSelectModelNewChat(modelId);
      return;
    }

    try {
      const chat = await getChatById(activeChatId);
      if (!chat) {
        await handleSelectModelNewChat(modelId);
        return;
      }

      await updateModelLastUsed(modelId);
      const updates: { modelId: string; providerId?: string } = { modelId };

      // If provider is incompatible, find a new one
      if (chat.providerId && !isModelIdCompatibleWithProviderId(chat.providerId, modelId)) {
        const next = pickBestProviderId({ modelId, availableProviderIds: llmProviderIds });
        updates.providerId = next || undefined;
      }

      await updateChat(activeChatId, updates);
      const model = getModelById(modelId);
      toast.success(`Switched to ${model?.name || modelId}`);
      setOpen(false);
    } catch {
      toast.error("Failed to switch model");
    }
  };

  const handleThemeChange = (newTheme: "light" | "dark" | "system") => {
    setTheme(newTheme);
    setOpen(false);
  };

  const handleSettings = () => {
    router.push("/settings");
    setOpen(false);
  };

  const handleInsertPrompt = () => {
    window.dispatchEvent(new CustomEvent("lumina:open-prompt-library"));
    setOpen(false);
  };

  const handleOpenModelPicker = () => {
    window.dispatchEvent(new CustomEvent("lumina:open-model-picker"));
    setOpen(false);
  };

  const handleShowTour = () => {
    router.push("/onboarding");
    setOpen(false);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Search models or type a command..."
        value={search}
        onValueChange={setSearch}
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {/* Switch Model for Current Chat - shown prominently when there's an active chat */}
        {activeChatId && filteredModels.length > 0 && (
          <>
            <CommandGroup heading="Switch Model (Current Chat)">
              {filteredModels.slice(0, 6).map((model) => {
                const costDisplay = formatModelCost(model.inputCost, model.outputCost);
                const isFree = model.inputCost + model.outputCost === 0;
                return (
                  <CommandItem
                    key={`switch-${model.id}`}
                    value={`switch ${model.name} ${model.id}`}
                    onSelect={() => handleSwitchModel(model.id)}
                    className="py-2"
                  >
                    <ArrowRightLeft className="mr-2 h-4 w-4 shrink-0" />
                    <span className="truncate">{model.name}</span>
                    <ModelCapabilityBadges modelId={model.id} />
                    <div className="ml-auto flex items-center gap-2 shrink-0">
                      <span className={cn(
                        "text-xs",
                        isFree ? "text-green-500" : "text-muted-foreground"
                      )}>
                        {costDisplay}
                      </span>
                      <span className="text-xs text-muted-foreground/70">
                        {model.provider}
                      </span>
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* Actions */}
        <CommandGroup heading="Actions">
          <CommandItem onSelect={handleNewChat}>
            <MessageSquarePlus className="mr-2 h-4 w-4" />
            <span>New Chat</span>
            <span className="ml-auto text-xs text-muted-foreground">Alt+Shift+N</span>
          </CommandItem>
          <CommandItem onSelect={handleOpenModelPicker}>
            <RefreshCw className="mr-2 h-4 w-4" />
            <span>Browse All Models</span>
            <span className="ml-auto text-xs text-muted-foreground">⌘M</span>
          </CommandItem>
          <CommandItem onSelect={handleInsertPrompt}>
            <FileText className="mr-2 h-4 w-4" />
            <span>Insert Prompt</span>
          </CommandItem>
          <CommandItem onSelect={handleSettings}>
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
          </CommandItem>
          <CommandItem onSelect={handleShowTour}>
            <GraduationCap className="mr-2 h-4 w-4" />
            <span>Show Onboarding Tour</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        {/* Theme */}
        <CommandGroup heading="Theme">
          <CommandItem onSelect={() => handleThemeChange("light")}>
            <Sun className="mr-2 h-4 w-4" />
            <span>Light</span>
            {theme === "light" && (
              <span className="ml-auto text-xs text-primary">✓</span>
            )}
          </CommandItem>
          <CommandItem onSelect={() => handleThemeChange("dark")}>
            <Moon className="mr-2 h-4 w-4" />
            <span>Dark</span>
            {theme === "dark" && (
              <span className="ml-auto text-xs text-primary">✓</span>
            )}
          </CommandItem>
          <CommandItem onSelect={() => handleThemeChange("system")}>
            <Laptop className="mr-2 h-4 w-4" />
            <span>System</span>
            {theme === "system" && (
              <span className="ml-auto text-xs text-primary">✓</span>
            )}
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        {/* Start New Chat with Model */}
        <CommandGroup heading="Start New Chat">
          {filteredModels.slice(0, 8).map((model) => {
            const costDisplay = formatModelCost(model.inputCost, model.outputCost);
            const isFree = model.inputCost + model.outputCost === 0;
            return (
              <CommandItem
                key={`new-${model.id}`}
                value={`new ${model.name} ${model.id}`}
                onSelect={() => handleSelectModelNewChat(model.id)}
                className="py-2"
              >
                <Sparkles className="mr-2 h-4 w-4 shrink-0" />
                <span className="truncate">{model.name}</span>
                <ModelCapabilityBadges modelId={model.id} />
                <div className="ml-auto flex items-center gap-2 shrink-0">
                  <span className={cn(
                    "text-xs",
                    isFree ? "text-green-500" : "text-muted-foreground"
                  )}>
                    {costDisplay}
                  </span>
                  <span className="text-xs text-muted-foreground/70">
                    {model.provider}
                  </span>
                </div>
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
