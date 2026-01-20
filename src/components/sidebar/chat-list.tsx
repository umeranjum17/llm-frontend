import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLiveQueryWithTimeout } from "@/hooks/use-live-query-with-timeout";
import { useVirtualizer } from "@tanstack/react-virtual";
import { MessageSquare, Pin, Star, Trash2, Folder, ChevronDown, ChevronRight, FolderPlus, MoreVertical, Edit2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { getAllChatsCached, deleteChat, updateChat, getAllFolders, createFolder, moveChatToFolder, updateFolder, deleteFolder, getLastMessagesForChats, getAllTags, db } from "@/lib/db/queries";
import { getTextFromMessageContent } from "@/lib/utils/message-content";
import { useUIStore } from "@/stores/ui-store";
import { useChatSearch } from "@/hooks/use-search";
import { useLongPress } from "@/hooks/use-long-press";
import { Button } from "@/components/ui/button";
import type { Chat, Folder as FolderType, Message } from "@/lib/db/schema";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { FolderDialog } from "./folder-dialog";
import { BulkActions } from "./bulk-actions";
import { EmptyState } from "@/components/ui/empty-state";
import { Search } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ChatListProps {
  searchQuery: string;
  onChatSelect?: () => void;
  currentProjectId?: string;
}

type ListItem = { type: "folder"; folder: FolderType } | { type: "chat"; chat: Chat };

export function ChatList({ searchQuery, onChatSelect, currentProjectId }: ChatListProps) {
  const activeChatId = useUIStore((state) => state.activeChatId);
  const setActiveChatId = useUIStore((state) => state.setActiveChatId);
  const secondaryChatId = useUIStore((state) => state.secondaryChatId);
  const isSplitView = useUIStore((state) => state.isSplitView);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<FolderType | null>(null);
  const [deleteFolderId, setDeleteFolderId] = useState<string | null>(null);
  const [deleteChatId, setDeleteChatId] = useState<string | null>(null);
  const [selectedChats, setSelectedChats] = useState<Set<string>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [lastMessagesMap, setLastMessagesMap] = useState<Map<string, Message | undefined>>(new Map());
  const [searchResults, setSearchResults] = useState<Chat[] | null>(null);

  const scrollParentRef = useRef<HTMLDivElement>(null);

  // Consolidate three queries into one transaction to reduce IndexedDB round-trips
  // Load only what's needed: 100 recent chats + pinned chats (merged and deduped)
  // This is critical for mobile performance where IndexedDB can be slow
  // Use direct DB queries (not cached) so useLiveQuery tracks changes and triggers re-renders
  const { data: chatListData, isTimedOut, retry: handleRetry } = useLiveQueryWithTimeout(
    async () => {
      const result = await db.transaction('r', [db.chats, db.folders, db.tags], async () => {
        const [pinnedChats, recentChats, foldersResult, tagsResult] = await Promise.all([
          db.chats.where('pinned').equals(1).toArray(),
          db.chats.orderBy('updatedAt').reverse().limit(100).toArray(),
          db.folders.toArray(),
          db.tags.orderBy('name').toArray()
        ]);

        // Merge and dedupe (pinned may overlap with recent)
        const pinnedIds = new Set(pinnedChats.map(c => c.id));
        const allChats = [...pinnedChats, ...recentChats.filter(c => !pinnedIds.has(c.id))];

        // Sort chats: pinned first, then by explicit order if set, otherwise by recency
        allChats.sort((a, b) => {
          // Pinned chats always come first
          if (a.pinned && !b.pinned) return -1;
          if (!a.pinned && b.pinned) return 1;

          const aHasOrder = a.order !== undefined;
          const bHasOrder = b.order !== undefined;

          // Within the same folder, respect order
          if (a.folderId === b.folderId) {
            // If both have explicit order, sort by order
            if (aHasOrder && bHasOrder) {
              if (a.order !== b.order) return (a.order ?? 0) - (b.order ?? 0);
              // Fallback to recency for same order
              return b.updatedAt - a.updatedAt;
            }
            // If only one has order, that one comes first
            if (aHasOrder && !bHasOrder) return -1;
            if (!aHasOrder && bHasOrder) return 1;
          }

          // Default to newest first for items without explicit order
          return b.updatedAt - a.updatedAt;
        });

        // Sort folders by order
        foldersResult.sort((a: FolderType, b: FolderType) => {
          if (a.order !== undefined && b.order !== undefined) return a.order - b.order;
          if (a.order !== undefined) return -1;
          if (b.order !== undefined) return 1;
          return a.createdAt - b.createdAt;
        });

        return { chats: allChats, folders: foldersResult, tags: tagsResult };
      });
      return result;
    },
    [],
    { timeoutMs: 5000 }
  );

  const allChats = chatListData?.chats;
  const folders = chatListData?.folders;
  const tags = chatListData?.tags;

  // Filter chats by current project
  const chats = useMemo(() => {
    if (!allChats) return undefined;
    if (!currentProjectId) return allChats;
    return allChats.filter((chat: Chat) => chat.projectId === currentProjectId);
  }, [allChats, currentProjectId]);

  const filteredFolders = useMemo(() => {
    if (!folders) return undefined;
    if (!currentProjectId) return folders;
    const folderIdsInProject = new Set(
      (chats || [])
        .map((chat: Chat) => chat.folderId)
        .filter((folderId): folderId is string => Boolean(folderId))
    );
    return folders.filter(
      (folder: FolderType) =>
        folder.projectId === currentProjectId ||
        (!folder.projectId && folderIdsInProject.has(folder.id))
    );
  }, [folders, currentProjectId, chats]);

  // Memoize the chat IDs string to avoid stale message previews
  const chatIdsKey = useMemo(() => chats?.map((c: Chat) => c.id).join(",") ?? "", [chats]);

  useEffect(() => {
    setLastMessagesMap(new Map());
  }, [chatIdsKey, searchQuery]);

  // Lazy-load search: only load all chats when user types a search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null);  // Clear results, show default list
      return;
    }

    const timeout = setTimeout(async () => {
      try {
        // Only now do we load ALL chats for search
        const allChatsForSearch = await db.chats.orderBy('updatedAt').reverse().toArray();
        // Filter by current project if applicable
        const projectFilteredChats = currentProjectId
          ? allChatsForSearch.filter((chat: Chat) => chat.projectId === currentProjectId)
          : allChatsForSearch;

        // Perform fuzzy search using Fuse.js
        const Fuse = (await import('fuse.js')).default;
        const fuse = new Fuse(projectFilteredChats, {
          keys: ['title', 'summary'],
          threshold: 0.4
        });
        setSearchResults(fuse.search(searchQuery).map(r => r.item));
      } catch (error) {
        console.error("Failed to search chats:", error);
        setSearchResults([]);
      }
    }, 300);  // 300ms debounce

    return () => clearTimeout(timeout);
  }, [searchQuery, currentProjectId]);

  // Use search results if searching, otherwise use default limited list
  const { matches: messageMatches } = useChatSearch(chats || [], searchQuery);
  const filteredChats = searchResults ?? (chats || []);

  const handleChatClick = (chatId: string, index: number, e: React.MouseEvent) => {
    const isSplitView = useUIStore.getState().isSplitView;
    const setSecondaryChatId = useUIStore.getState().setSecondaryChatId;

    if (e.altKey && isSplitView) {
      // Alt+Click in split view: Set as secondary chat
      setSecondaryChatId(chatId);
      setSelectedChats(new Set());
      setLastSelectedIndex(null);
    } else if (e.metaKey || e.ctrlKey) {
      // Cmd/Ctrl+Click: Toggle selection
      setSelectedChats(prev => {
        const next = new Set(prev);
        if (next.has(chatId)) {
          next.delete(chatId);
        } else {
          next.add(chatId);
        }
        return next;
      });
      setLastSelectedIndex(index);
    } else if (e.shiftKey && lastSelectedIndex !== null) {
      // Shift+Click: Range selection
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      const chatItems = chatItemsList.slice(start, end + 1);
      setSelectedChats(prev => {
        const next = new Set(prev);
        chatItems.forEach(item => {
          if (item.type === "chat") {
            next.add(item.chat.id);
          }
        });
        return next;
      });
    } else {
      // Regular click: Select chat and clear selection
      setActiveChatId(chatId);
      setSelectedChats(new Set());
      setLastSelectedIndex(null);
      onChatSelect?.();
    }
  };

  const handleBulkDelete = async (chatIds: string[]) => {
    for (const chatId of chatIds) {
      await deleteChat(chatId);
      if (activeChatId === chatId) {
        setActiveChatId(null);
      }
    }
    setSelectedChats(new Set());
    toast.success(`Deleted ${chatIds.length} chat${chatIds.length > 1 ? "s" : ""}`);
  };

  const handleBulkMove = async (chatIds: string[], folderId: string | null) => {
    for (const chatId of chatIds) {
      await moveChatToFolder(chatId, folderId);
    }
    setSelectedChats(new Set());
    toast.success(`Moved ${chatIds.length} chat${chatIds.length > 1 ? "s" : ""}`);
  };

  const handleBulkTag = async (chatIds: string[], tagId: string) => {
    // Batch fetch all chats at once to avoid N+1 query pattern
    const chats = await db.chats.where('id').anyOf(chatIds).toArray();

    // Batch update in transaction for better performance
    await db.transaction('rw', db.chats, async () => {
      for (const chat of chats) {
        const currentTags = chat.tags || [];
        if (!currentTags.includes(tagId)) {
          await db.chats.update(chat.id, { tags: [...currentTags, tagId] });
        }
      }
    });

    setSelectedChats(new Set());
    toast.success(`Tagged ${chatIds.length} chat${chatIds.length > 1 ? "s" : ""}`);
  };

  const handleTogglePin = async (e: React.MouseEvent, chat: Chat) => {
    e.stopPropagation();
    await updateChat(chat.id, { pinned: !chat.pinned });
  };

  const handleToggleFavorite = async (e: React.MouseEvent, chat: Chat) => {
    e.stopPropagation();
    await updateChat(chat.id, { favorite: !chat.favorite });
  };

  const handleDelete = (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    setDeleteChatId(chatId);
  };

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => ({ ...prev, [folderId]: !prev[folderId] }));
  };

  const handleCreateFolder = () => {
    setEditingFolder(null);
    setFolderDialogOpen(true);
  };

  const handleSaveFolder = async (name: string, color?: string) => {
    if (editingFolder) {
      await updateFolder(editingFolder.id, { name, color });
      toast.success("Folder updated");
    } else {
      await createFolder(name, color, currentProjectId);
      toast.success("Folder created");
    }
  };

  const handleEditFolder = (folder: FolderType) => {
    setEditingFolder(folder);
    setFolderDialogOpen(true);
  };

  const handleDeleteFolder = async () => {
    if (deleteFolderId) {
      await deleteFolder(deleteFolderId);
      toast.success("Folder deleted");
      setDeleteFolderId(null);
    }
  };

  const handleDeleteChatConfirm = async () => {
    if (deleteChatId) {
      await deleteChat(deleteChatId);
      if (activeChatId === deleteChatId) {
        setActiveChatId(null);
      }
      toast.success("Chat deleted");
      setDeleteChatId(null);
    }
  };

  const buildItemsList = (): ListItem[] => {
    if (!chats || !filteredFolders) return [];

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

    const items: ListItem[] = [];

    // Add folders
    filteredFolders.forEach((folder: FolderType) => {
      items.push({ type: "folder", folder });
      if (expandedFolders[folder.id]) {
        const folderChats = chatsByFolder[folder.id] || [];
        folderChats.forEach((chat: Chat) => items.push({ type: "chat", chat }));
      }
    });

    // Add loose chats
    if (looseChats.length > 0 || items.length === 0) {
      looseChats.forEach(chat => items.push({ type: "chat", chat }));
    }

    return items;
  };

  const items = useMemo(() => {
    if (!chats || !filteredFolders) return [];
    return buildItemsList();
  }, [filteredChats, filteredFolders, expandedFolders, chats]);
  const chatItemsList = useMemo(() => items.filter(i => i.type === "chat"), [items]);
  const chatIndexById = useMemo(() => {
    const map = new Map<string, number>();
    chatItemsList.forEach((item, index) => {
      if (item.type === "chat") {
        map.set(item.chat.id, index);
      }
    });
    return map;
  }, [chatItemsList]);

  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: (index) => (items[index]?.type === "folder" ? 40 : 64),
    overscan: 6,
  });

  const visibleChatIds = useMemo(() => {
    const ids: string[] = [];
    rowVirtualizer.getVirtualItems().forEach((virtualItem) => {
      const item = items[virtualItem.index];
      if (item?.type === "chat") {
        ids.push(item.chat.id);
      }
    });
    return ids;
  }, [items, rowVirtualizer]);

  useEffect(() => {
    const idsToLoad = visibleChatIds.filter((id) => !lastMessagesMap.has(id));
    if (idsToLoad.length === 0) return;

    let cancelled = false;
    getLastMessagesForChats(idsToLoad)
      .then((map) => {
        if (cancelled) return;
        setLastMessagesMap((prev) => {
          const next = new Map(prev);
          map.forEach((value, key) => {
            next.set(key, value);
          });
          return next;
        });
      })
      .catch((error) => {
        console.error("Failed to load last messages:", error);
      });

    return () => {
      cancelled = true;
    };
  }, [visibleChatIds, lastMessagesMap]);

  if (!chats || !filteredFolders) {
    return (
      <div className="flex flex-col h-full">
        {isTimedOut ? (
          <div className="flex flex-col items-center justify-center flex-1 p-8 text-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10">
              <RefreshCw className="h-6 w-6 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Loading took too long</p>
              <p className="text-xs text-muted-foreground">
                This may indicate a database issue or slow connection.
              </p>
            </div>
            <div className="flex flex-col gap-2 w-full max-w-xs">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRetry}
                className="gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Retry
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  if ("caches" in window) {
                    const cacheNames = await caches.keys();
                    await Promise.all(cacheNames.map((name) => caches.delete(name)));
                  }
                  window.location.reload();
                }}
                className="gap-2 text-xs"
              >
                Clear Cache & Reload
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex-1 p-4 space-y-3">
            {/* Skeleton UI */}
            <div className="space-y-2">
              <div className="h-4 w-24 bg-muted/50 rounded animate-pulse" />
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex gap-2 p-2.5 rounded-lg border border-transparent">
                    <div className="flex-1 space-y-2">
                      <div className="h-3 bg-muted/50 rounded animate-pulse" style={{ width: `${60 + Math.random() * 30}%` }} />
                      <div className="h-2 bg-muted/30 rounded animate-pulse" style={{ width: `${40 + Math.random() * 40}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground/60 pt-4">
              <RefreshCw className="h-3 w-3 animate-spin" />
              <span>Loading chats...</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={searchQuery ? Search : MessageSquare}
        title={searchQuery ? "No chats found" : "No chats yet"}
        description={
          searchQuery
            ? "Try adjusting your search terms or create a new chat."
            : "Create your first chat to start conversing with AI models."
        }
        action={
          searchQuery
            ? undefined
            : {
              label: "New Chat",
              onClick: () => {
                const event = new CustomEvent("lumina:new-chat");
                window.dispatchEvent(event);
              },
            }
        }
        secondaryAction={
          !searchQuery
            ? {
              label: "Create Folder",
              onClick: handleCreateFolder,
            }
            : undefined
        }
        className="h-full"
      />
    );
  }

  return (
    <>
      <div className="flex h-full min-w-0 flex-col overflow-x-hidden">
        <div className="px-4 py-1.5 flex justify-between items-center">
          <span className="text-[10px] font-medium text-muted-foreground/70">Chats</span>
          <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground/70 hover:text-muted-foreground" onClick={handleCreateFolder} title="New Folder">
            <FolderPlus className="h-3 w-3" />
          </Button>
        </div>
        {selectedChats.size > 0 && (
          <BulkActions
            selectedChats={selectedChats}
            onClearSelection={() => {
              setSelectedChats(new Set());
              setLastSelectedIndex(null);
            }}
            onBulkDelete={handleBulkDelete}
            onBulkMove={handleBulkMove}
            onBulkTag={handleBulkTag}
            folders={folders || []}
            tags={tags || []}
          />
        )}
        <div ref={scrollParentRef} className="flex-1 min-h-0 min-w-0 overflow-y-auto">
          <div
            className="pb-4 min-w-0"
            style={{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualItem) => {
              const item = items[virtualItem.index];
              if (!item) return null;
              if (item.type === "folder") {
                const folderChatCount = chats?.filter((c: Chat) => c.folderId === item.folder.id).length || 0;
                return (
                  <div
                    key={virtualItem.key}
                    ref={rowVirtualizer.measureElement}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                  >
                    <FolderItem
                      folder={item.folder}
                      isExpanded={expandedFolders[item.folder.id]}
                      onToggle={() => toggleFolder(item.folder.id)}
                      chatCount={folderChatCount}
                      onEdit={() => handleEditFolder(item.folder)}
                      onDelete={() => setDeleteFolderId(item.folder.id)}
                    />
                  </div>
                );
              }

              const chatIndex = chatIndexById.get(item.chat.id) ?? 0;
              const matches = messageMatches.get(item.chat.id);
              return (
                <div
                  key={virtualItem.key}
                  ref={rowVirtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  <ChatItem
                    chat={item.chat}
                    lastMessage={lastMessagesMap.get(item.chat.id)}
                    searchMatches={matches}
                    isActive={item.chat.id === activeChatId}
                    isSecondary={isSplitView && item.chat.id === secondaryChatId}
                    isSelected={selectedChats.has(item.chat.id)}
                    isNested={!!item.chat.folderId}
                    onClick={(e) => handleChatClick(item.chat.id, chatIndex, e)}
                    onTogglePin={(e) => handleTogglePin(e, item.chat)}
                    onToggleFavorite={(e) => handleToggleFavorite(e, item.chat)}
                    onDelete={(e) => handleDelete(e, item.chat.id)}
                    folders={folders || []}
                    onMoveToFolder={(folderId) => moveChatToFolder(item.chat.id, folderId)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Folder Dialog */}
      <FolderDialog
        open={folderDialogOpen}
        onOpenChange={setFolderDialogOpen}
        onSave={handleSaveFolder}
        folder={editingFolder}
      />

      {/* Delete Folder Confirmation */}
      <AlertDialog open={!!deleteFolderId} onOpenChange={(open) => !open && setDeleteFolderId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Folder?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the folder but keep all chats inside. The chats will be moved to &quot;No Folder&quot;.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteFolder}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Chat Confirmation */}
      <AlertDialog open={!!deleteChatId} onOpenChange={(open) => !open && setDeleteChatId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Chat?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the chat and all its messages.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteChatConfirm}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}


interface FolderItemProps {
  folder: FolderType;
  isExpanded: boolean;
  onToggle: () => void;
  chatCount?: number;
  onEdit: () => void;
  onDelete: () => void;
}

function FolderItem({ folder, isExpanded, onToggle, chatCount = 0, onEdit, onDelete }: FolderItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <motion.div
      className={cn(
        "flex max-w-full min-w-0 items-center gap-2 overflow-hidden px-3 py-1.5 mx-2 my-0.5 cursor-pointer hover:bg-accent/50 group rounded-lg transition-colors select-none",
      )}
      onClick={onToggle}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
    >
      <motion.span
        animate={{ rotate: isExpanded ? 90 : 0 }}
        transition={{ duration: 0.2 }}
      >
        <ChevronRight className="h-3 w-3 text-muted-foreground" />
      </motion.span>
      <Folder className="h-3.5 w-3.5" style={folder.color ? { color: folder.color } : undefined} />
      <span className="text-xs font-medium truncate flex-1 min-w-0">{folder.name}</span>
      {chatCount > 0 && (
        <span className="text-[10px] text-muted-foreground/60">
          {chatCount}
        </span>
      )}
      <AnimatePresence>
        {(isHovered || menuOpen) && (
          <motion.div
            initial={{ opacity: 0, x: 5 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 5 }}
            transition={{ duration: 0.15 }}
          >
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="icon" className="h-5 w-5">
                  <MoreVertical className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(); setMenuOpen(false); }}>
                  <Edit2 className="h-3.5 w-3.5 mr-2" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDelete(); setMenuOpen(false); }} className="text-destructive">
                  <Trash2 className="h-3.5 w-3.5 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

interface SortableChatItemProps {
  chat: Chat;
  lastMessage?: import("@/lib/db/schema").Message;
  searchMatches?: import("@/lib/db/queries").MessageSearchResult[];
  isActive: boolean;
  isSecondary?: boolean;
  isSelected?: boolean;
  isNested?: boolean;
  onClick: (e: React.MouseEvent) => void;
  onTogglePin: (e: React.MouseEvent) => void;
  onToggleFavorite: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  folders: FolderType[];
  onMoveToFolder: (folderId: string | null) => void;
}

function ChatItem({
  chat,
  lastMessage,
  searchMatches,
  isActive,
  isSecondary = false,
  isSelected = false,
  isNested,
  onClick,
  onTogglePin,
  onToggleFavorite,
  onDelete,
  folders,
  onMoveToFolder,
}: SortableChatItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Use search match snippet if available, otherwise last message
  const rawPreview = searchMatches && searchMatches.length > 0
    ? getTextFromMessageContent(searchMatches[0].content)
    : lastMessage
      ? getTextFromMessageContent(lastMessage.content)
      : "";

  const previewText =
    rawPreview.length > 120 ? `${rawPreview.slice(0, 120).trimEnd()}…` : rawPreview;

  // Long press support for mobile
  const longPressHandlers = useLongPress({
    onLongPress: (e) => {
      e.preventDefault();
      e.stopPropagation();
      setMenuOpen(true);
    },
    onClick: (e) => {
      // Convert TouchEvent to MouseEvent-like for onClick
      onClick(e as React.MouseEvent);
    },
  });

  return (
    <TooltipProvider>
      <motion.div
        className={cn(
          "group relative cursor-pointer px-2.5 py-2 mx-2 my-0.5 rounded-lg transition-colors hover:bg-accent/60 select-none max-w-full min-w-0 overflow-hidden",
          isActive && "bg-accent",
          isSecondary && "bg-accent/40 ring-1 ring-primary/30",
          isSelected && "bg-accent/60 ring-1 ring-primary/40",
          isNested && "ml-6",
        )}
        {...longPressHandlers}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
      >
        <div className="flex items-center gap-1 min-w-0 w-full max-w-full overflow-hidden">
          <Tooltip delayDuration={500}>
            <TooltipTrigger asChild>
              <div className="flex-1 min-w-0 w-0 overflow-hidden">
                <div className="flex items-center gap-1 min-w-0">
                  <AnimatePresence>
                    {chat.pinned && (
                      <motion.span
                        initial={{ scale: 0, rotate: -180 }}
                        animate={{ scale: 1, rotate: 0 }}
                        exit={{ scale: 0, rotate: 180 }}
                        transition={{ type: "spring", stiffness: 400, damping: 20 }}
                      >
                        <Pin className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
                      </motion.span>
                    )}
                  </AnimatePresence>
                  <AnimatePresence>
                    {chat.favorite && (
                      <motion.span
                        initial={{ scale: 0, rotate: -180 }}
                        animate={{ scale: 1, rotate: 0 }}
                        exit={{ scale: 0, rotate: 180 }}
                        transition={{ type: "spring", stiffness: 400, damping: 20 }}
                      >
                        <Star className="h-2.5 w-2.5 text-yellow-500/70 shrink-0" />
                      </motion.span>
                    )}
                  </AnimatePresence>
                  <h3 className="text-xs font-medium truncate flex-1 min-w-0" title={chat.title}>
                    {chat.title}
                  </h3>
                </div>
                <div className="text-[10px] text-muted-foreground/70 leading-tight truncate">
                  {previewText || `Updated ${formatDistanceToNow(new Date(chat.updatedAt), { addSuffix: true })}`}
                </div>
              </div>
            </TooltipTrigger>
            {chat.summary && (
              <TooltipContent side="right" className="max-w-[300px] text-xs">
                {chat.summary}
              </TooltipContent>
            )}
          </Tooltip>

          {/* Three-dot menu (shown on hover or when menu is open) */}
          <AnimatePresence>
            {(isHovered || isActive || menuOpen) && (
              <motion.div
                className="flex items-center shrink-0"
                initial={{ opacity: 0, x: 5 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 5 }}
                transition={{ duration: 0.15 }}
              >
                <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 hover:bg-accent"
                    >
                      <MoreVertical className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onTogglePin(e);
                    setMenuOpen(false);
                  }}
                >
                  <Pin className={cn("h-3.5 w-3.5 mr-2", chat.pinned && "fill-current")} />
                  {chat.pinned ? "Unpin" : "Pin"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavorite(e);
                    setMenuOpen(false);
                  }}
                >
                  <Star className={cn("h-3.5 w-3.5 mr-2", chat.favorite && "fill-current text-yellow-500")} />
                  {chat.favorite ? "Unfavorite" : "Favorite"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs">Move to Folder</DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onMoveToFolder(null);
                    setMenuOpen(false);
                  }}
                >
                  <Folder className="h-3.5 w-3.5 mr-2" />
                  No Folder
                </DropdownMenuItem>
                {folders.map((folder) => (
                  <DropdownMenuItem
                    key={folder.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onMoveToFolder(folder.id);
                      toast.success(`Moved to ${folder.name}`);
                      setMenuOpen(false);
                    }}
                  >
                    <Folder className="h-3.5 w-3.5 mr-2" style={folder.color ? { color: folder.color } : undefined} />
                    <span className="truncate flex-1">{folder.name}</span>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(e);
                    setMenuOpen(false);
                  }}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </TooltipProvider>
  );
}
