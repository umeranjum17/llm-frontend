"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { getAllTags } from "@/lib/db/queries";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface TagListProps {
    tagIds?: string[];
    className?: string;
    size?: "sm" | "default";
}

export function TagList({ tagIds, className, size = "default" }: TagListProps) {
    const allTags = useLiveQuery(() => getAllTags(), []);

    if (!tagIds || tagIds.length === 0 || !allTags) return null;

    const tags = allTags.filter((t: { id: string; name: string; color: string }) => tagIds.includes(t.id));

    // Color mapping similar to schema (Tailwind classes)
    const getColorClass = (color: string) => {
        switch (color) {
            case "red": return "bg-red-500/10 text-red-600 border-red-500/20";
            case "orange": return "bg-orange-500/10 text-orange-600 border-orange-500/20";
            case "yellow": return "bg-yellow-500/10 text-yellow-600 border-yellow-500/20";
            case "green": return "bg-green-500/10 text-green-600 border-green-500/20";
            case "blue": return "bg-blue-500/10 text-blue-600 border-blue-500/20";
            case "indigo": return "bg-indigo-500/10 text-indigo-600 border-indigo-500/20";
            case "purple": return "bg-purple-500/10 text-purple-600 border-purple-500/20";
            case "pink": return "bg-pink-500/10 text-pink-600 border-pink-500/20";
            case "gray": return "bg-gray-500/10 text-gray-600 border-gray-500/20";
            default: return "bg-secondary text-secondary-foreground border-transparent";
        }
    };

    return (
        <div className={cn("flex flex-wrap gap-1.5", className)}>
            {tags.map((tag: { id: string; name: string; color: string }) => (
                <Badge
                    key={tag.id}
                    variant="outline"
                    className={cn(
                        "font-normal border",
                        getColorClass(tag.color),
                        size === "sm" ? "px-1.5 py-0 text-[10px] h-4" : "px-2 py-0.5 text-xs h-5"
                    )}
                >
                    {tag.name}
                </Badge>
            ))}
        </div>
    );
}
