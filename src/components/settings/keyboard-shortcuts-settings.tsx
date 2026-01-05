"use client";

import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Command, Keyboard } from "lucide-react";

interface Shortcut {
  keys: string[];
  description: string;
  category: string;
}

const SHORTCUTS: Shortcut[] = [
  // Navigation
  {
    keys: ["Cmd", "Shift", "P"],
    description: "Open command palette",
    category: "Navigation",
  },
  {
    keys: ["Alt", "Shift", "N"],
    description: "New chat",
    category: "Navigation",
  },
  {
    keys: ["Cmd", "F"],
    description: "Focus search",
    category: "Navigation",
  },
  {
    keys: ["Cmd", "/"],
    description: "Show keyboard shortcuts",
    category: "Navigation",
  },
  {
    keys: ["Escape"],
    description: "Close modals/dialogs",
    category: "Navigation",
  },

  // Chat
  {
    keys: ["Enter"],
    description: "Send message",
    category: "Chat",
  },
  {
    keys: ["Shift", "Enter"],
    description: "New line",
    category: "Chat",
  },
  {
    keys: ["Cmd", "Enter"],
    description: "Send message (alternative)",
    category: "Chat",
  },

  // Editing
  {
    keys: ["Cmd", "Z"],
    description: "Undo",
    category: "Editing",
  },
  {
    keys: ["Cmd", "Shift", "Z"],
    description: "Redo",
    category: "Editing",
  },
  {
    keys: ["Cmd", "C"],
    description: "Copy",
    category: "Editing",
  },
  {
    keys: ["Cmd", "V"],
    description: "Paste",
    category: "Editing",
  },
];

export function KeyboardShortcutsSettings() {
  const categories = Array.from(new Set(SHORTCUTS.map((s) => s.category)));

  const renderKey = (key: string) => {
    // Replace "Cmd" with "⌘" on Mac, "Ctrl" on Windows/Linux
    const isMac = typeof window !== "undefined" && navigator.platform.includes("Mac");
    const displayKey =
      key === "Cmd"
        ? (isMac ? "⌘" : "Ctrl")
        : key === "Alt"
          ? (isMac ? "⌥" : "Alt")
          : key;

    return (
      <Badge
        key={key}
        variant="outline"
        className="font-mono text-xs px-2 py-0.5"
      >
        {displayKey}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Keyboard Shortcuts</h3>
        <p className="text-sm text-muted-foreground">
          Quick reference for all available keyboard shortcuts
        </p>
      </div>

      <div className="space-y-6">
        {categories.map((category) => (
          <div key={category} className="space-y-3">
            <Label className="text-sm font-semibold">{category}</Label>
            <div className="space-y-2">
              {SHORTCUTS.filter((s) => s.category === category).map(
                (shortcut, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <span className="text-sm">{shortcut.description}</span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, i) => (
                        <span key={i} className="flex items-center gap-1">
                          {i > 0 && <span className="text-xs text-muted-foreground">+</span>}
                          {renderKey(key)}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Tip */}
      <div className="flex items-start gap-3 p-4 border rounded-lg bg-muted/50">
        <Keyboard className="h-5 w-5 mt-0.5 text-muted-foreground" />
        <div className="space-y-1">
          <p className="text-sm font-medium">Pro Tip</p>
          <p className="text-xs text-muted-foreground">
            Press <kbd className="px-1.5 py-0.5 text-xs font-mono bg-background border rounded">Cmd</kbd> + <kbd className="px-1.5 py-0.5 text-xs font-mono bg-background border rounded">/</kbd> anywhere in the app to see this shortcut list
          </p>
        </div>
      </div>
    </div>
  );
}
