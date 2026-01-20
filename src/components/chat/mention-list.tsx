
import { cn } from "@/lib/utils";
import { MentionItem } from "@/lib/mentions/types";
import { FileText, Bot, Hash, Terminal, MessageSquare, Tag, Zap } from "lucide-react";

interface MentionListProps {
    items: MentionItem[];
    activeIndex: number;
    onSelect: (item: MentionItem) => void;
    className?: string;
}

const getIcon = (type: MentionItem["type"]) => {
    switch (type) {
        case "agent":
            return <Bot className="h-4 w-4" />;
        case "file":
            return <FileText className="h-4 w-4" />;
        case "command":
            return <Terminal className="h-4 w-4" />;
        case "chat":
            return <MessageSquare className="h-4 w-4" />;
        case "tag":
            return <Tag className="h-4 w-4" />;
        case "prompt":
            return <Hash className="h-4 w-4" />;
        case "skill":
            return <Zap className="h-4 w-4" />;
        default:
            return <Hash className="h-4 w-4" />;
    }
};

export function MentionList({ items, activeIndex, onSelect, className }: MentionListProps) {
    if (items.length === 0) return null;

    return (
        <div
            className={cn(
                "z-50 w-64 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
                className
            )}
        >
            <div className="p-1">
                {items.map((item, index) => (
                    <div
                        key={item.id}
                        className={cn(
                            "relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors",
                            index === activeIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
                        )}
                        onClick={() => onSelect(item)}
                    >
                        <div className="mr-2 flex h-4 w-4 items-center justify-center opacity-70">
                            {item.icon || getIcon(item.type)}
                        </div>
                        <div className="flex flex-col flex-1 overflow-hidden">
                            <span className="truncate font-medium">{item.label}</span>
                            {item.description && (
                                <span className="truncate text-xs text-muted-foreground opacity-70">
                                    {item.description}
                                </span>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
