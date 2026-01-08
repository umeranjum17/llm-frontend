"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, Folder, Tag, Archive, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Chat } from "@/lib/db/schema";

interface BulkActionsProps {
  selectedChats: Set<string>;
  onClearSelection: () => void;
  onBulkDelete: (chatIds: string[]) => void;
  onBulkMove: (chatIds: string[], folderId: string | null) => void;
  onBulkTag: (chatIds: string[], tagId: string) => void;
  folders: Array<{ id: string; name: string }>;
  tags: Array<{ id: string; name: string }>;
}

export function BulkActions({
  selectedChats,
  onClearSelection,
  onBulkDelete,
  onBulkMove,
  onBulkTag,
  folders,
  tags,
}: BulkActionsProps) {
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const [showTagMenu, setShowTagMenu] = useState(false);

  if (selectedChats.size === 0) return null;

  const selectedCount = selectedChats.size;
  const chatIds = Array.from(selectedChats);

  return (
    <div className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 px-4 py-2 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="font-medium">
          {selectedCount} selected
        </Badge>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearSelection}
          className="h-7 text-xs"
        >
          <X className="h-3 w-3 mr-1" />
          Clear
        </Button>
      </div>
      <div className="flex items-center gap-1">
        <div className="relative">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setShowMoveMenu(!showMoveMenu);
              setShowTagMenu(false);
            }}
            className="h-7 text-xs"
          >
            <Folder className="h-3 w-3 mr-1" />
            Move
          </Button>
          {showMoveMenu && (
            <div className="absolute top-full right-0 mt-1 bg-popover border rounded-md shadow-lg z-30 min-w-[150px] py-1">
              <button
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent"
                onClick={() => {
                  onBulkMove(chatIds, null);
                  setShowMoveMenu(false);
                }}
              >
                No Folder
              </button>
              {folders.length > 0 && <div className="border-t my-1" />}
              {folders.map((folder) => (
                <button
                  key={folder.id}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent"
                  onClick={() => {
                    onBulkMove(chatIds, folder.id);
                    setShowMoveMenu(false);
                  }}
                >
                  {folder.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="relative">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setShowTagMenu(!showTagMenu);
              setShowMoveMenu(false);
            }}
            className="h-7 text-xs"
            disabled={tags.length === 0}
          >
            <Tag className="h-3 w-3 mr-1" />
            Tag
          </Button>
          {showTagMenu && tags.length > 0 && (
            <div className="absolute top-full right-0 mt-1 bg-popover border rounded-md shadow-lg z-30 min-w-[150px] py-1 max-h-48 overflow-y-auto">
              {tags.map((tag) => (
                <button
                  key={tag.id}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent"
                  onClick={() => {
                    onBulkTag(chatIds, tag.id);
                    setShowTagMenu(false);
                  }}
                >
                  {tag.name}
                </button>
              ))}
            </div>
          )}
        </div>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => onBulkDelete(chatIds)}
          className="h-7 text-xs"
        >
          <Trash2 className="h-3 w-3 mr-1" />
          Delete
        </Button>
      </div>
    </div>
  );
}


