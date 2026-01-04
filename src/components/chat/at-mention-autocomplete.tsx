"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getProjectFiles, getChatsByProject } from "@/lib/db/queries";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { File, MessageSquare } from "lucide-react";
import { getFileIcon } from "@/lib/utils/file-extractor";
import type { ProjectFile, Chat } from "@/lib/db/schema";

interface AtMentionAutocompleteProps {
  projectId?: string;
  onSelect: (type: "file" | "chat", id: string, name: string) => void;
  onClose: () => void;
  position: { top: number; left: number };
  query: string;
}

export function AtMentionAutocomplete({
  projectId,
  onSelect,
  onClose,
  position,
  query,
}: AtMentionAutocompleteProps) {
  const files = useLiveQuery(
    () => (projectId ? getProjectFiles(projectId) : []),
    [projectId]
  );
  const chats = useLiveQuery(() => getChatsByProject(projectId || ""), [projectId]);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const commandRef = useRef<HTMLDivElement>(null);

  // Filter items by query
  const filteredFiles = useMemo(() => {
    const q = query.toLowerCase();
    return (files || []).filter((file) =>
      file.name.toLowerCase().includes(q)
    );
  }, [files, query]);

  const filteredChats = useMemo(() => {
    const q = query.toLowerCase();
    return (chats || []).filter((chat) =>
      chat.title.toLowerCase().includes(q)
    );
  }, [chats, query]);

  const totalItems = filteredFiles.length + filteredChats.length;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % totalItems);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + totalItems) % totalItems);
      } else if (e.key === "Enter") {
        e.preventDefault();
        // Select current item
        if (selectedIndex < filteredFiles.length) {
          const file = filteredFiles[selectedIndex];
          onSelect("file", file.id, file.name);
        } else {
          const chat = filteredChats[selectedIndex - filteredFiles.length];
          onSelect("chat", chat.id, chat.title);
        }
      } else if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedIndex, totalItems, filteredFiles, filteredChats, onSelect, onClose]);

  if (totalItems === 0) {
    return (
      <div
        className="absolute z-50 bg-popover border rounded-lg shadow-lg p-4 text-sm text-muted-foreground"
        style={{ top: position.top, left: position.left }}
      >
        No files or chats found
      </div>
    );
  }

  return (
    <div
      ref={commandRef}
      className="absolute z-50 bg-popover border rounded-lg shadow-lg overflow-hidden"
      style={{ top: position.top, left: position.left, minWidth: "300px", maxHeight: "300px" }}
    >
      <Command>
        <CommandList>
          {filteredFiles.length > 0 && (
            <CommandGroup heading="Files">
              {filteredFiles.map((file, index) => (
                <CommandItem
                  key={file.id}
                  onSelect={() => onSelect("file", file.id, file.name)}
                  className={selectedIndex === index ? "bg-accent" : ""}
                >
                  <span className="mr-2">{getFileIcon(file.name)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{file.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {(file.size / 1024).toFixed(1)} KB
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {filteredChats.length > 0 && (
            <CommandGroup heading="Chats">
              {filteredChats.map((chat, index) => (
                <CommandItem
                  key={chat.id}
                  onSelect={() => onSelect("chat", chat.id, chat.title)}
                  className={
                    selectedIndex === filteredFiles.length + index ? "bg-accent" : ""
                  }
                >
                  <MessageSquare className="mr-2 h-4 w-4" />
                  <div className="flex-1 min-w-0 truncate">{chat.title}</div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </div>
  );
}
