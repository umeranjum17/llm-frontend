"use client";

import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Command, Keyboard, Edit2, X, Save, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { getSettings, updateSettings } from "@/lib/db/queries";
import { useLiveQuery } from "dexie-react-hooks";
import { toast } from "sonner";

interface Shortcut {
  id: string;
  keys: string[];
  description: string;
  category: string;
  editable?: boolean;
}

const DEFAULT_SHORTCUTS: Shortcut[] = [
  // Navigation
  {
    id: "command-palette",
    keys: ["Cmd", "Shift", "P"],
    description: "Open command palette",
    category: "Navigation",
    editable: true,
  },
  {
    id: "new-chat",
    keys: ["Alt", "Shift", "N"],
    description: "New chat",
    category: "Navigation",
    editable: true,
  },
  {
    id: "focus-search",
    keys: ["Cmd", "F"],
    description: "Focus search",
    category: "Navigation",
    editable: true,
  },
  {
    id: "show-shortcuts",
    keys: ["Cmd", "/"],
    description: "Show keyboard shortcuts",
    category: "Navigation",
    editable: true,
  },
  {
    id: "escape",
    keys: ["Escape"],
    description: "Close modals/dialogs",
    category: "Navigation",
    editable: false,
  },

  // Chat
  {
    id: "send-message",
    keys: ["Enter"],
    description: "Send message",
    category: "Chat",
    editable: false,
  },
  {
    id: "new-line",
    keys: ["Shift", "Enter"],
    description: "New line",
    category: "Chat",
    editable: false,
  },
  {
    id: "send-alternative",
    keys: ["Cmd", "Enter"],
    description: "Send message (alternative)",
    category: "Chat",
    editable: true,
  },
  {
    id: "open-model-picker",
    keys: ["Alt", "Shift", "M"],
    description: "Open model picker",
    category: "Chat",
    editable: true,
  },

  // Editing
  {
    id: "undo",
    keys: ["Cmd", "Z"],
    description: "Undo",
    category: "Editing",
    editable: false,
  },
  {
    id: "redo",
    keys: ["Cmd", "Shift", "Z"],
    description: "Redo",
    category: "Editing",
    editable: false,
  },
  {
    id: "copy",
    keys: ["Cmd", "C"],
    description: "Copy",
    category: "Editing",
    editable: false,
  },
  {
    id: "paste",
    keys: ["Cmd", "V"],
    description: "Paste",
    category: "Editing",
    editable: false,
  },
];

export function KeyboardShortcutsSettings() {
  const settings = useLiveQuery(() => getSettings(), []);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [customShortcuts, setCustomShortcuts] = useState<Record<string, string[]>>({});
  const [conflictId, setConflictId] = useState<string | null>(null);

  useEffect(() => {
    if (settings?.shortcuts) {
      const parsed: Record<string, string[]> = {};
      for (const [id, value] of Object.entries(settings.shortcuts)) {
        try {
          parsed[id] = JSON.parse(value);
        } catch {
          // If not JSON, assume it's a single key
          parsed[id] = [value];
        }
      }
      setCustomShortcuts(parsed);
    }
  }, [settings]);

  const categories = Array.from(new Set(DEFAULT_SHORTCUTS.map((s) => s.category)));

  const getShortcutKeys = (shortcut: Shortcut): string[] => {
    return customShortcuts[shortcut.id] || shortcut.keys;
  };

  const renderKey = (key: string) => {
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

  const handleStartEdit = (shortcut: Shortcut) => {
    setEditingId(shortcut.id);
    setConflictId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent, shortcut: Shortcut) => {
    e.preventDefault();
    e.stopPropagation();

    const keys: string[] = [];
    if (e.metaKey || e.ctrlKey) keys.push("Cmd");
    if (e.altKey) keys.push("Alt");
    if (e.shiftKey) keys.push("Shift");
    
    const key = e.key;
    if (key && key !== "Meta" && key !== "Control" && key !== "Alt" && key !== "Shift") {
      if (key === " ") keys.push("Space");
      else if (key.length === 1) keys.push(key.toUpperCase());
      else keys.push(key);

      // Check for conflicts
      const newCombo = keys.join("+");
      const conflicting = DEFAULT_SHORTCUTS.find(
        s => s.id !== shortcut.id && getShortcutKeys(s).join("+") === newCombo
      );

      if (conflicting) {
        setConflictId(conflicting.id);
        return;
      }

      setConflictId(null);
      setCustomShortcuts(prev => ({
        ...prev,
        [shortcut.id]: keys,
      }));
      setEditingId(null);
    }
  };

  const handleSave = async () => {
    if (settings) {
      const serialized: Record<string, string> = {};
      for (const [id, keys] of Object.entries(customShortcuts)) {
        serialized[id] = JSON.stringify(keys);
      }
      await updateSettings({ shortcuts: serialized });
      toast.success("Shortcuts saved");
      setEditingId(null);
    }
  };

  const handleReset = async () => {
    if (settings) {
      await updateSettings({ shortcuts: {} });
      setCustomShortcuts({});
      toast.success("Shortcuts reset to defaults");
      setEditingId(null);
    }
  };

  const handleResetOne = (shortcut: Shortcut) => {
    setCustomShortcuts(prev => {
      const next = { ...prev };
      delete next[shortcut.id];
      return next;
    });
    setEditingId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Keyboard Shortcuts</h3>
          <p className="text-sm text-muted-foreground">
            Customize keyboard shortcuts. Click edit to change a shortcut.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleReset}>
          <RotateCcw className="h-4 w-4 mr-2" />
          Reset All
        </Button>
      </div>

      <div className="space-y-6">
        {categories.map((category) => (
          <div key={category} className="space-y-3">
            <Label className="text-sm font-semibold">{category}</Label>
            <div className="space-y-2">
              {DEFAULT_SHORTCUTS.filter((s) => s.category === category).map(
                (shortcut) => {
                  const keys = getShortcutKeys(shortcut);
                  const isEditing = editingId === shortcut.id;
                  const hasConflict = conflictId === shortcut.id;
                  const isCustom = customShortcuts[shortcut.id] !== undefined;

                  return (
                    <div
                      key={shortcut.id}
                      className={cn(
                        "flex items-center justify-between p-3 border rounded-lg transition-colors",
                        isEditing && "ring-2 ring-primary",
                        hasConflict && "border-destructive"
                      )}
                    >
                      <span className="text-sm flex-1">{shortcut.description}</span>
                      <div className="flex items-center gap-2">
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <Input
                              className="w-32 text-xs"
                              placeholder="Press keys..."
                              onKeyDown={(e) => handleKeyDown(e, shortcut)}
                              autoFocus
                              onBlur={() => setEditingId(null)}
                            />
                            {hasConflict && (
                              <span className="text-xs text-destructive">Conflict!</span>
                            )}
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-1">
                              {keys.map((key, i) => (
                                <span key={i} className="flex items-center gap-1">
                                  {i > 0 && <span className="text-xs text-muted-foreground">+</span>}
                                  {renderKey(key)}
                                </span>
                              ))}
                            </div>
                            {shortcut.editable && (
                              <div className="flex items-center gap-1">
                                {isCustom && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={() => handleResetOne(shortcut)}
                                    title="Reset to default"
                                  >
                                    <RotateCcw className="h-3 w-3" />
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => handleStartEdit(shortcut)}
                                  title="Edit shortcut"
                                >
                                  <Edit2 className="h-3 w-3" />
                                </Button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                }
              )}
            </div>
          </div>
        ))}
      </div>

      {Object.keys(customShortcuts).length > 0 && (
        <div className="flex justify-end">
          <Button onClick={handleSave}>
            <Save className="h-4 w-4 mr-2" />
            Save Changes
          </Button>
        </div>
      )}

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
