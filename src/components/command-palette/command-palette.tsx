"use client";

import { useEffect, useState } from "react";
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
  Search,
  Sparkles,
  Palette,
  Moon,
  Sun,
  Laptop,
  FileText,
} from "lucide-react";
import { useUIStore } from "@/stores/ui-store";
import { useSettingsStore } from "@/stores/settings-store";
import { createChat } from "@/lib/db/queries";
import { MODELS } from "@/lib/constants/models";
import { useTheme } from "next-themes";
import { useModelsStore } from "@/stores/models-store";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { setActiveChatId } = useUIStore();
  const { theme, setTheme } = useTheme();
  const { models, loadModels } = useModelsStore();

  // Cmd/Ctrl+Shift+P mirrors many “command palette” UX patterns and avoids common OS/browser conflicts.
  useHotkeys(
    "mod+shift+p",
    (e) => {
      e.preventDefault();
      setOpen((prev) => !prev);
    },
    { enableOnFormTags: false }
  );

  useEffect(() => {
    if (!open) return;
    loadModels().catch(() => {});
  }, [open, loadModels]);

  const handleNewChat = async () => {
    const newChat = await createChat({
      title: "New Chat",
      modelId: MODELS[0].id,
    });
    setActiveChatId(newChat.id);
    setOpen(false);
  };

  const handleSelectModel = async (modelId: string) => {
    const newChat = await createChat({
      title: "New Chat",
      modelId,
    });
    setActiveChatId(newChat.id);
    setOpen(false);
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

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {/* Actions */}
        <CommandGroup heading="Actions">
          <CommandItem onSelect={handleNewChat}>
            <MessageSquarePlus className="mr-2 h-4 w-4" />
            <span>New Chat</span>
            <span className="ml-auto text-xs text-muted-foreground">Alt+Shift+N</span>
          </CommandItem>
          <CommandItem onSelect={handleInsertPrompt}>
            <FileText className="mr-2 h-4 w-4" />
            <span>Insert Prompt</span>
          </CommandItem>
          <CommandItem onSelect={handleSettings}>
            <Settings className="mr-2 h-4 w-4" />
            <span>Settings</span>
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

        {/* Quick Model Selection */}
        <CommandGroup heading="Start Chat with Model">
          {(models.length > 0 ? models : MODELS).slice(0, 10).map((model) => (
            <CommandItem
              key={model.id}
              onSelect={() => handleSelectModel(model.id)}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              <span>{model.name}</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {model.provider}
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
