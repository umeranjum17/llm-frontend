"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Folder } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Folder as FolderType } from "@/lib/db/schema";

const FOLDER_COLORS = [
  "#3b82f6", // blue
  "#8b5cf6", // purple
  "#ec4899", // pink
  "#f59e0b", // amber
  "#10b981", // emerald
  "#ef4444", // red
  "#06b6d4", // cyan
  "#84cc16", // lime
  "#f97316", // orange
  "#6366f1", // indigo
];

interface FolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (name: string, color?: string) => void;
  folder?: FolderType | null;
}

export function FolderDialog({ open, onOpenChange, onSave, folder }: FolderDialogProps) {
  const [name, setName] = useState("");
  const [selectedColor, setSelectedColor] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (open) {
      setName(folder?.name || "");
      setSelectedColor(folder?.color || undefined);
    }
  }, [open, folder]);

  const handleSave = () => {
    if (name.trim()) {
      onSave(name.trim(), selectedColor);
      setName("");
      setSelectedColor(undefined);
      onOpenChange(false);
    }
  };

  const handleCancel = () => {
    setName("");
    setSelectedColor(undefined);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{folder ? "Edit Folder" : "Create Folder"}</DialogTitle>
          <DialogDescription>
            {folder ? "Update folder name and color" : "Create a new folder to organize your chats"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="folder-name">Folder Name</Label>
            <Input
              id="folder-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter folder name"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleSave();
                }
              }}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label>Color (Optional)</Label>
            <div className="flex flex-wrap gap-2">
              {FOLDER_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setSelectedColor(selectedColor === color ? undefined : color)}
                  className={cn(
                    "w-8 h-8 rounded-full border-2 transition-all",
                    selectedColor === color
                      ? "border-foreground scale-110 ring-2 ring-offset-2 ring-primary"
                      : "border-border hover:scale-105"
                  )}
                  style={{ backgroundColor: color }}
                  aria-label={`Select color ${color}`}
                />
              ))}
              <button
                type="button"
                onClick={() => setSelectedColor(undefined)}
                className={cn(
                  "w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all",
                  !selectedColor
                    ? "border-foreground scale-110 ring-2 ring-offset-2 ring-primary"
                    : "border-border hover:scale-105"
                )}
                aria-label="No color"
              >
                <Folder className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim()}>
            {folder ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


