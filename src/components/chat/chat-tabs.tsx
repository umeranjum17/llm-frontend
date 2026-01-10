"use client";

import { useTabsStore } from "@/stores/tabs-store";
import { useLiveQuery } from "dexie-react-hooks";
import { getChatById } from "@/lib/db/queries";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface ChatTabProps {
  chatId: string;
  isActive: boolean;
  onSelect: () => void;
  onClose: (e: React.MouseEvent) => void;
}

function ChatTab({ chatId, isActive, onSelect, onClose }: ChatTabProps) {
  const chat = useLiveQuery(() => getChatById(chatId), [chatId]);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: chatId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex items-center gap-2 px-3 py-1.5 rounded-t-lg border-b-2 transition-all duration-150 cursor-pointer min-w-0 max-w-[200px]",
        isActive
          ? "border-primary bg-card text-foreground"
          : "border-transparent bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
      onClick={onSelect}
      {...attributes}
      {...listeners}
    >
      <span className="truncate text-sm font-medium flex-1 min-w-0">
        {chat?.title || "Untitled"}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
        onClick={onClose}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}

export function ChatTabs() {
  const { tabs, activeTabId, setActiveTab, closeTab, reorderTabs } = useTabsStore();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  if (tabs.length === 0) {
    return null;
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = tabs.indexOf(active.id as string);
      const newIndex = tabs.indexOf(over.id as string);
      reorderTabs(oldIndex, newIndex);
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <div className="flex items-end gap-1 border-b bg-muted/30 px-2 overflow-x-auto scrollbar-thin">
        <SortableContext items={tabs} strategy={horizontalListSortingStrategy}>
          {tabs.map((chatId) => (
            <ChatTab
              key={chatId}
              chatId={chatId}
              isActive={activeTabId === chatId}
              onSelect={() => setActiveTab(chatId)}
              onClose={(e) => {
                e.stopPropagation();
                closeTab(chatId);
              }}
            />
          ))}
        </SortableContext>
      </div>
    </DndContext>
  );
}
