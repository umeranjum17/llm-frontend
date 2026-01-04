import { useEffect, useState } from "react";
import { Virtuoso } from "react-virtuoso";
import { useLiveQuery } from "dexie-react-hooks";
import { MessageSquare, Pin, Star, Trash2, Folder, ChevronDown, ChevronRight, FolderPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { getAllChats, deleteChat, updateChat, getAllFolders, createFolder } from "@/lib/db/queries";
import { useUIStore } from "@/stores/ui-store";
import { useChatSearch } from "@/hooks/use-search";
import { Button } from "@/components/ui/button";
import type { Chat, Folder as FolderType } from "@/lib/db/schema";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

interface ChatListProps {
  searchQuery: string;
}

export function ChatList({ searchQuery }: ChatListProps) {
  const activeChatId = useUIStore((state) => state.activeChatId);
  const setActiveChatId = useUIStore((state) => state.setActiveChatId);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

  // Use Dexie live query for reactive updates
  const chats = useLiveQuery(() => getAllChats(), []);
  const folders = useLiveQuery(() => getAllFolders(), []);

  // Use fuzzy search with Fuse.js
  const filteredChats = useChatSearch(chats || [], searchQuery);

  const handleChatClick = (chatId: string) => {
    setActiveChatId(chatId);
  };

  const handleTogglePin = async (e: React.MouseEvent, chat: Chat) => {
    e.stopPropagation();
    await updateChat(chat.id, { pinned: !chat.pinned });
  };

  const handleToggleFavorite = async (e: React.MouseEvent, chat: Chat) => {
    e.stopPropagation();
    await updateChat(chat.id, { favorite: !chat.favorite });
  };

  const handleDelete = async (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    if (confirm("Delete this chat?")) {
      await deleteChat(chatId);
      if (activeChatId === chatId) {
        setActiveChatId(null);
      }
    }
  };

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => ({ ...prev, [folderId]: !prev[folderId] }));
  };

  const handleCreateFolder = async () => {
    const name = prompt("Enter folder name:");
    if (name) {
      await createFolder(name);
      toast.success("Folder created");
    }
  };

  if (!chats || !folders) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        Loading...
      </div>
    );
  }

  // Group chats by folder
  const chatsByFolder: Record<string, Chat[]> = {};
  const looseChats: Chat[] = [];

  filteredChats.forEach(chat => {
    if (chat.folderId) {
      if (!chatsByFolder[chat.folderId]) chatsByFolder[chat.folderId] = [];
      chatsByFolder[chat.folderId].push(chat);
    } else {
      looseChats.push(chat);
    }
  });

  // Flat list for Virtuoso (folders and chats)
  const items: ({ type: "folder", folder: FolderType } | { type: "chat", chat: Chat })[] = [];

  folders.forEach(folder => {
    items.push({ type: "folder", folder });
    if (expandedFolders[folder.id]) {
      const folderChats = chatsByFolder[folder.id] || [];
      folderChats.forEach(chat => items.push({ type: "chat", chat }));
    }
  });

  if (looseChats.length > 0 || items.length === 0) {
    looseChats.forEach(chat => items.push({ type: "chat", chat }));
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground">
          {searchQuery ? "No chats found" : "No chats yet"}
        </p>
        <Button variant="ghost" size="sm" onClick={handleCreateFolder} className="mt-4 gap-2">
          <FolderPlus className="h-4 w-4" />
          Create Folder
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 py-2 flex justify-between items-center border-b bg-muted/20">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Your Library</span>
        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={handleCreateFolder} title="New Folder">
          <FolderPlus className="h-3.5 w-3.5" />
        </Button>
      </div>
      <Virtuoso
        data={items}
        className="flex-1"
        itemContent={(index, item) => {
          if (item.type === "folder") {
            const isExpanded = expandedFolders[item.folder.id];
            return (
              <div
                className="flex items-center gap-2 px-4 py-2 cursor-pointer hover:bg-accent/50 group"
                onClick={() => toggleFolder(item.folder.id)}
              >
                {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                <Folder className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-semibold truncate flex-1">{item.folder.name}</span>
              </div>
            );
          }

          const chat = item.chat;
          return (
            <ChatItem
              key={chat.id}
              chat={chat}
              isActive={chat.id === activeChatId}
              isNested={!!chat.folderId}
              onClick={() => handleChatClick(chat.id)}
              onTogglePin={(e) => handleTogglePin(e, chat)}
              onToggleFavorite={(e) => handleToggleFavorite(e, chat)}
              onDelete={(e) => handleDelete(e, chat.id)}
            />
          );
        }}
      />
    </div>
  );
}

interface ChatItemProps {
  chat: Chat;
  isActive: boolean;
  isNested?: boolean;
  onClick: () => void;
  onTogglePin: (e: React.MouseEvent) => void;
  onToggleFavorite: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
}

function ChatItem({
  chat,
  isActive,
  isNested,
  onClick,
  onTogglePin,
  onToggleFavorite,
  onDelete,
}: ChatItemProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <div
      className={cn(
        "group relative cursor-pointer border-b px-4 py-3 transition-colors hover:bg-accent",
        isActive && "bg-accent",
        isNested && "pl-8"
      )}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {chat.pinned && <Pin className="h-3 w-3 text-primary shrink-0" />}
            {chat.favorite && <Star className="h-3 w-3 text-yellow-500 shrink-0" />}
            <h3 className="text-sm font-medium truncate">{chat.title}</h3>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="truncate">{chat.modelId}</span>
            <span>•</span>
            <span>{formatDistanceToNow(new Date(chat.updatedAt), { addSuffix: true })}</span>
          </div>
        </div>

        {/* Actions (shown on hover) */}
        {(isHovered || isActive) && (
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onTogglePin}
              title={chat.pinned ? "Unpin" : "Pin"}
            >
              <Pin className={cn("h-3 w-3", chat.pinned && "fill-current")} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onToggleFavorite}
              title={chat.favorite ? "Unfavorite" : "Favorite"}
            >
              <Star className={cn("h-3 w-3", chat.favorite && "fill-current text-yellow-500")} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                const name = prompt("Move to folder (name):");
                if (name) {
                  getAllFolders().then(folders => {
                    const folder = folders.find(f => f.name.toLowerCase() === name.toLowerCase());
                    if (folder) {
                      updateChat(chat.id, { folderId: folder.id });
                      toast.success(`Moved to ${folder.name}`);
                    } else {
                      toast.error("Folder not found");
                    }
                  });
                }
              }}
              title="Move to Folder"
            >
              <Folder className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onDelete}
              title="Delete"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
