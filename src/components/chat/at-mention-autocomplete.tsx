"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getProjectFiles, getChatsByProject, getChatById, getLastMessage } from "@/lib/db/queries";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { File, MessageSquare } from "lucide-react";
import { getFileIcon } from "@/lib/utils/file-extractor";
import { getTextFromMessageContent } from "@/lib/utils/message-content";
import type { ProjectFile, Chat } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

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
  const [hoveredItem, setHoveredItem] = useState<{ type: "file" | "chat"; id: string } | null>(null);
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
                <FilePreviewItem
                  key={file.id}
                  file={file}
                  index={index}
                  selectedIndex={selectedIndex}
                  onSelect={() => onSelect("file", file.id, file.name)}
                  onHover={() => setHoveredItem({ type: "file", id: file.id })}
                  onLeave={() => setHoveredItem(null)}
                />
              ))}
            </CommandGroup>
          )}
          {filteredChats.length > 0 && (
            <CommandGroup heading="Chats">
              {filteredChats.map((chat, index) => (
                <ChatPreviewItem
                  key={chat.id}
                  chat={chat}
                  index={filteredFiles.length + index}
                  selectedIndex={selectedIndex}
                  onSelect={() => onSelect("chat", chat.id, chat.title)}
                  onHover={() => setHoveredItem({ type: "chat", id: chat.id })}
                  onLeave={() => setHoveredItem(null)}
                />
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </div>
  );
}

interface FilePreviewItemProps {
  file: ProjectFile;
  index: number;
  selectedIndex: number;
  onSelect: () => void;
  onHover: () => void;
  onLeave: () => void;
}

function FilePreviewItem({ file, index, selectedIndex, onSelect, onHover, onLeave }: FilePreviewItemProps) {
  const [showPreview, setShowPreview] = useState(false);
  const preview = file.text ? (file.text.slice(0, 200) + (file.text.length > 200 ? "..." : "")) : null;

  return (
    <div className="relative group">
      <CommandItem
        onSelect={onSelect}
        onMouseEnter={() => {
          onHover();
          setShowPreview(true);
        }}
        onMouseLeave={() => {
          onLeave();
          setShowPreview(false);
        }}
        className={cn(selectedIndex === index && "bg-accent")}
      >
        <span className="mr-2">{getFileIcon(file.name)}</span>
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{file.name}</div>
          <div className="text-xs text-muted-foreground">
            {(file.size / 1024).toFixed(1)} KB
          </div>
        </div>
      </CommandItem>
      {showPreview && preview && (
        <div 
          className="absolute left-full ml-2 top-0 z-50 w-80 p-3 bg-popover border rounded-lg shadow-dropdown text-sm"
          onMouseEnter={() => setShowPreview(true)}
          onMouseLeave={() => setShowPreview(false)}
        >
          <div className="font-medium mb-2">{file.name}</div>
          <div className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-6">
            {preview}
          </div>
        </div>
      )}
    </div>
  );
}

interface ChatPreviewItemProps {
  chat: Chat;
  index: number;
  selectedIndex: number;
  onSelect: () => void;
  onHover: () => void;
  onLeave: () => void;
}

function ChatPreviewItem({ chat, index, selectedIndex, onSelect, onHover, onLeave }: ChatPreviewItemProps) {
  const [showPreview, setShowPreview] = useState(false);
  const lastMessage = useLiveQuery(() => showPreview ? getLastMessage(chat.id) : undefined, [chat.id, showPreview]);
  const preview = lastMessage ? (() => {
    const text = getTextFromMessageContent(lastMessage.content);
    return text.slice(0, 200) + (text.length > 200 ? "..." : "");
  })() : null;

  return (
    <div className="relative group">
      <CommandItem
        onSelect={onSelect}
        onMouseEnter={() => {
          onHover();
          setShowPreview(true);
        }}
        onMouseLeave={() => {
          onLeave();
          setShowPreview(false);
        }}
        className={cn(selectedIndex === index && "bg-accent")}
      >
        <MessageSquare className="mr-2 h-4 w-4" />
        <div className="flex-1 min-w-0 truncate">{chat.title}</div>
      </CommandItem>
      {showPreview && preview && (
        <div 
          className="absolute left-full ml-2 top-0 z-50 w-80 p-3 bg-popover border rounded-lg shadow-dropdown text-sm"
          onMouseEnter={() => setShowPreview(true)}
          onMouseLeave={() => setShowPreview(false)}
        >
          <div className="font-medium mb-2">{chat.title}</div>
          <div className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-6">
            {preview}
          </div>
        </div>
      )}
    </div>
  );
}
