"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
} from "lucide-react";
import { useUIStore } from "@/stores/ui-store";
import { useSettingsStore } from "@/stores/settings-store";
import { createChat } from "@/lib/db/queries";
import { MODELS } from "@/lib/constants/models";
import { useTheme } from "next-themes";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { setActiveChatId } = useUIStore();
  const { theme, setTheme } = useTheme();

  // Listen for Cmd+K / Ctrl+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

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
            <span className="ml-auto text-xs text-muted-foreground">
              Cmd+N
            </span>
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
          {MODELS.slice(0, 6).map((model) => (
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
