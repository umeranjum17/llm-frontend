import { useState, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  useDroppable,
  MeasuringStrategy,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MessageSquare, Pin, Star, Trash2, Folder, ChevronDown, ChevronRight, FolderPlus, GripVertical, MoreVertical, Edit2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { getAllChats, deleteChat, updateChat, getAllFolders, createFolder, reorderChats, reorderFolders, moveChatToFolder, updateFolder, deleteFolder, getLastMessagesForChats, getChatById, getAllTags } from "@/lib/db/queries";
import { getTextFromMessageContent } from "@/lib/utils/message-content";
import { useUIStore } from "@/stores/ui-store";
import { useChatSearch } from "@/hooks/use-search";
import { Button } from "@/components/ui/button";
import type { Chat, Folder as FolderType } from "@/lib/db/schema";
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
}

type ListItem = { type: "folder"; folder: FolderType } | { type: "chat"; chat: Chat };

export function ChatList({ searchQuery, onChatSelect }: ChatListProps) {
  const activeChatId = useUIStore((state) => state.activeChatId);
  const setActiveChatId = useUIStore((state) => state.setActiveChatId);
  const secondaryChatId = useUIStore((state) => state.secondaryChatId);
  const isSplitView = useUIStore((state) => state.isSplitView);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draggedItem, setDraggedItem] = useState<ListItem | null>(null);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<FolderType | null>(null);
  const [deleteFolderId, setDeleteFolderId] = useState<string | null>(null);
  const [deleteChatId, setDeleteChatId] = useState<string | null>(null);
  const [selectedChats, setSelectedChats] = useState<Set<string>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Use Dexie live query for reactive updates
  const chats = useLiveQuery(() => getAllChats(), []);
  const folders = useLiveQuery(() => getAllFolders(), []);
  const tags = useLiveQuery(() => getAllTags(), []);

  // Batch fetch last messages for all chats (avoids N+1 queries)
  // Memoize the chat IDs string to prevent unnecessary re-subscriptions
  const chatIdsKey = useMemo(() => chats?.map(c => c.id).join(',') ?? '', [chats]);
  const lastMessagesMap = useLiveQuery(
    () => {
      const ids = chatIdsKey.split(',').filter(Boolean);
      return ids.length > 0 ? getLastMessagesForChats(ids) : Promise.resolve(new Map());
    },
    [chatIdsKey]
  );

  // Use fuzzy search with Fuse.js
  const { chats: filteredChats, matches: messageMatches } = useChatSearch(chats || [], searchQuery);

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
      const items = buildItemsList();
      const chatItems = items.filter(i => i.type === "chat").slice(start, end + 1);
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
    for (const chatId of chatIds) {
      const chat = await getChatById(chatId);
      if (chat) {
        const currentTags = chat.tags || [];
        if (!currentTags.includes(tagId)) {
          await updateChat(chatId, { tags: [...currentTags, tagId] });
        }
      }
    }
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
      await createFolder(name, color);
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

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const activeIdStr = active.id as string;
    setActiveId(activeIdStr);

    // Find the dragged item - IDs are prefixed with "folder-" or "chat-"
    const allItems = buildItemsList();
    const item = allItems.find(i =>
      (i.type === "folder" && `folder-${i.folder.id}` === activeIdStr) ||
      (i.type === "chat" && `chat-${i.chat.id}` === activeIdStr)
    );
    setDraggedItem(item || null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setDraggedItem(null);

    if (!over || active.id === over.id) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Handle folder reordering
    if (activeId.startsWith("folder-") && overId.startsWith("folder-")) {
      const folderIds = folders?.map(f => f.id) || [];
      const activeIndex = folderIds.indexOf(activeId.replace("folder-", ""));
      const overIndex = folderIds.indexOf(overId.replace("folder-", ""));

      if (activeIndex !== -1 && overIndex !== -1) {
        const newOrder = arrayMove(folderIds, activeIndex, overIndex);
        await reorderFolders(newOrder);
      }
      return;
    }

    // Handle chat reordering within same folder
    if (activeId.startsWith("chat-") && overId.startsWith("chat-")) {
      const activeChatId = activeId.replace("chat-", "");
      const overChatId = overId.replace("chat-", "");
      const activeChat = chats?.find(c => c.id === activeChatId);
      const overChat = chats?.find(c => c.id === overChatId);

      if (activeChat && overChat && activeChat.folderId === overChat.folderId) {
        const folderChats = chats?.filter(c => c.folderId === activeChat.folderId) || [];
        const chatIds = folderChats.map(c => c.id);
        const activeIndex = chatIds.indexOf(activeChatId);
        const overIndex = chatIds.indexOf(overChatId);

        if (activeIndex !== -1 && overIndex !== -1) {
          const newOrder = arrayMove(chatIds, activeIndex, overIndex);
          await reorderChats(newOrder);
        }
      }
      return;
    }

    // Handle moving chat to folder (drag chat onto folder)
    if (activeId.startsWith("chat-") && overId.startsWith("folder-")) {
      const chatId = activeId.replace("chat-", "");
      const folderId = overId.replace("folder-", "");
      await moveChatToFolder(chatId, folderId);
      toast.success("Chat moved to folder");
      return;
    }

    // Handle moving chat out of folder (drag to "no-folder" zone)
    if (activeId.startsWith("chat-") && overId === "no-folder") {
      const chatId = activeId.replace("chat-", "");
      await moveChatToFolder(chatId, null);
      toast.success("Chat moved out of folder");
      return;
    }
  };

  const buildItemsList = (): ListItem[] => {
    if (!chats || !folders) return [];

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
    folders.forEach(folder => {
      items.push({ type: "folder", folder });
      if (expandedFolders[folder.id]) {
        const folderChats = chatsByFolder[folder.id] || [];
        folderChats.forEach(chat => items.push({ type: "chat", chat }));
      }
    });

    // Add loose chats
    if (looseChats.length > 0 || items.length === 0) {
      looseChats.forEach(chat => items.push({ type: "chat", chat }));
    }

    return items;
  };

  if (!chats || !folders) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        Loading...
      </div>
    );
  }

  const items = buildItemsList();

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

  // Get sortable IDs for folders and chats
  const folderIds = folders.map(f => `folder-${f.id}`);
  const sortableChatIds = items.filter(i => i.type === "chat").map(i => `chat-${i.chat.id}`);
  const sortableIds = [...folderIds, ...sortableChatIds, "no-folder"];

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      modifiers={[restrictToVerticalAxis]}
      measuring={{
        droppable: {
          strategy: MeasuringStrategy.Always,
        },
      }}
    >
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
        <ScrollArea className="flex-1 min-h-0 min-w-0">
          <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
            <div className="pb-4 min-w-0">
              {/* No-folder drop zone for moving chats out of folders */}
              <NoFolderDropZone isDragging={!!draggedItem} />
              {items.map((item, index) => {
                if (item.type === "folder") {
                  const folderChatCount = chats?.filter(c => c.folderId === item.folder.id).length || 0;
                  return (
                    <SortableFolderItem
                      key={item.folder.id}
                      folder={item.folder}
                      isExpanded={expandedFolders[item.folder.id]}
                      onToggle={() => toggleFolder(item.folder.id)}
                      chatCount={folderChatCount}
                      onEdit={() => handleEditFolder(item.folder)}
                      onDelete={() => setDeleteFolderId(item.folder.id)}
                    />
                  );
                }

                const chatIndex = items.filter(i => i.type === "chat").findIndex(i => i.type === "chat" && i.chat.id === item.chat.id);
                const matches = messageMatches.get(item.chat.id);
                return (
                  <SortableChatItem
                    key={item.chat.id}
                    chat={item.chat}
                    lastMessage={lastMessagesMap?.get(item.chat.id)}
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
                );
              })}
            </div>
          </SortableContext>
        </ScrollArea>
        <DragOverlay>
          {draggedItem && (
            <div className="opacity-50">
              {draggedItem.type === "folder" ? (
                <div className="flex items-center gap-2 px-4 py-2 bg-background border rounded-lg shadow-sm w-[200px]">
                  <Folder className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="text-xs font-semibold truncate">{draggedItem.folder.name}</span>
                </div>
              ) : (
                <div className="px-4 py-3 border rounded-lg bg-background shadow-sm w-[240px]">
                  <div className="text-sm font-medium truncate">{draggedItem.chat.title}</div>
                </div>
              )}
            </div>
          )}
        </DragOverlay>
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
    </DndContext>
  );
}


interface SortableFolderItemProps {
  folder: FolderType;
  isExpanded: boolean;
  onToggle: () => void;
  chatCount?: number;
  onEdit: () => void;
  onDelete: () => void;
}

function SortableFolderItem({ folder, isExpanded, onToggle, chatCount = 0, onEdit, onDelete }: SortableFolderItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `folder-${folder.id}` });
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: `folder-${folder.id}`,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        setDroppableRef(node);
      }}
      style={style}
      className={cn(
        "flex max-w-full min-w-0 items-center gap-2 overflow-hidden px-3 py-1.5 mx-2 my-0.5 cursor-pointer hover:bg-accent/50 group rounded-lg transition-colors select-none",
        isDragging && "opacity-50",
        isOver && "bg-accent ring-1 ring-primary/50"
      )}
      onClick={onToggle}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground transition-colors opacity-30 group-hover:opacity-100 touch-none select-none"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-3 w-3" />
      </button>
      {isExpanded ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
      <Folder className="h-3.5 w-3.5" style={folder.color ? { color: folder.color } : undefined} />
      <span className="text-xs font-medium truncate flex-1 min-w-0">{folder.name}</span>
      {chatCount > 0 && (
        <span className="text-[10px] text-muted-foreground/60">
          {chatCount}
        </span>
      )}
      {isHovered && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-5 w-5">
              <MoreVertical className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(); }}>
              <Edit2 className="h-3.5 w-3.5 mr-2" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDelete(); }} className="text-destructive">
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

function NoFolderDropZone({ isDragging }: { isDragging: boolean }) {
  const { setNodeRef, isOver } = useDroppable({
    id: "no-folder",
  });

  if (!isDragging && !isOver) return null;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "mx-2 px-3 py-2 text-xs text-muted-foreground bg-accent/60 rounded-lg transition-colors mb-2 border border-dashed border-transparent",
        isOver && "border-primary/50 bg-accent",
        !isOver && isDragging && "opacity-50"
      )}
    >
      Drop here to remove from folder
    </div>
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

function SortableChatItem({
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
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `chat-${chat.id}` });

  // Use search match snippet if available, otherwise last message
  const rawPreview = searchMatches && searchMatches.length > 0
    ? getTextFromMessageContent(searchMatches[0].content)
    : lastMessage
      ? getTextFromMessageContent(lastMessage.content)
      : "";

  const previewText =
    rawPreview.length > 120 ? `${rawPreview.slice(0, 120).trimEnd()}…` : rawPreview;

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <TooltipProvider>
      <div
        ref={setNodeRef}
        style={style}
        className={cn(
          "group relative cursor-pointer px-2.5 py-2 mx-2 my-0.5 rounded-lg transition-colors hover:bg-accent/60 select-none max-w-full min-w-0 overflow-hidden",
          isActive && "bg-accent",
          isSecondary && "bg-accent/40 ring-1 ring-primary/30",
          isSelected && "bg-accent/60 ring-1 ring-primary/40",
          isNested && "ml-6",
          isDragging && "opacity-50"
        )}
        onClick={onClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div className="flex items-center gap-1 min-w-0 w-full max-w-full overflow-hidden">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground transition-colors shrink-0 opacity-30 group-hover:opacity-100 touch-none select-none"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-3 w-3" />
          </button>

          <Tooltip delayDuration={500}>
            <TooltipTrigger asChild>
              <div className="flex-1 min-w-0 w-0 overflow-hidden">
                <div className="flex items-center gap-1 min-w-0">
                  {chat.pinned && <Pin className="h-2.5 w-2.5 text-muted-foreground shrink-0" />}
                  {chat.favorite && <Star className="h-2.5 w-2.5 text-yellow-500/70 shrink-0" />}
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

          {/* Actions (shown on hover) */}
          <div
            className={cn(
              "flex items-center gap-0.5 shrink-0 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100",
              (isHovered || isActive) && "opacity-100"
            )}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  onClick={onTogglePin}
                >
                  <Pin className={cn("h-2.5 w-2.5", chat.pinned && "fill-current")} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {chat.pinned ? "Unpin" : "Pin"}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  onClick={onToggleFavorite}
                >
                  <Star className={cn("h-2.5 w-2.5", chat.favorite && "fill-current text-yellow-500")} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {chat.favorite ? "Unfavorite" : "Favorite"}
              </TooltipContent>
            </Tooltip>

            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                    >
                      <Folder className="h-2.5 w-2.5" />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="top">Move to Folder</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Move to Folder</DropdownMenuLabel>
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onMoveToFolder(null); }}>
                  No Folder
                </DropdownMenuItem>
                {folders.length > 0 && <DropdownMenuSeparator />}
                {folders.map((folder) => (
                  <DropdownMenuItem
                    key={folder.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onMoveToFolder(folder.id);
                      toast.success(`Moved to ${folder.name}`);
                    }}
                  >
                    <Folder className="h-3.5 w-3.5 mr-2" style={folder.color ? { color: folder.color } : undefined} />
                    <span className="truncate flex-1">{folder.name}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  onClick={onDelete}
                >
                  <Trash2 className="h-2.5 w-2.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Delete</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
