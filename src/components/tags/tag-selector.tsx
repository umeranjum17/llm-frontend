"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tag, Plus, Check, X } from "lucide-react";
import { getAllTags } from "@/lib/db/queries";
import { TagManagerDialog } from "./tag-manager-dialog";

interface TagSelectorProps {
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
}

export function TagSelector({ selectedTags, onTagsChange }: TagSelectorProps) {
  const allTags = useLiveQuery(() => getAllTags(), []);

  const toggleTag = (tagId: string) => {
    if (selectedTags.includes(tagId)) {
      onTagsChange(selectedTags.filter((id) => id !== tagId));
    } else {
      onTagsChange([...selectedTags, tagId]);
    }
  };

  const getTagName = (tagId: string) => {
    return allTags?.find((t) => t.id === tagId)?.name || tagId;
  };

  const getTagColor = (tagId: string) => {
    return allTags?.find((t) => t.id === tagId)?.color || "#6b7280";
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Selected Tags */}
      {selectedTags.map((tagId) => (
        <Badge
          key={tagId}
          variant="secondary"
          className="gap-1 cursor-pointer"
          style={{
            backgroundColor: `${getTagColor(tagId)}20`,
            borderColor: getTagColor(tagId),
            color: getTagColor(tagId),
          }}
        >
          {getTagName(tagId)}
          <X
            className="h-3 w-3"
            onClick={() => toggleTag(tagId)}
          />
        </Badge>
      ))}

      {/* Add Tag Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2 h-7">
            <Tag className="h-3 w-3" />
            {selectedTags.length === 0 ? "Add Tag" : ""}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>Available Tags</DropdownMenuLabel>
          <DropdownMenuSeparator />

          {allTags && allTags.length > 0 ? (
            <>
              {allTags.map((tag) => {
                const isSelected = selectedTags.includes(tag.id);
                return (
                  <DropdownMenuItem
                    key={tag.id}
                    onClick={() => toggleTag(tag.id)}
                    className="cursor-pointer"
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: tag.color }}
                        />
                        <span>{tag.name}</span>
                      </div>
                      {isSelected && <Check className="h-4 w-4 text-primary" />}
                    </div>
                  </DropdownMenuItem>
                );
              })}
              <DropdownMenuSeparator />
            </>
          ) : (
            <div className="px-2 py-4 text-center text-sm text-muted-foreground">
              No tags available
            </div>
          )}

          <TagManagerDialog>
            <DropdownMenuItem
              onSelect={(e) => e.preventDefault()}
              className="cursor-pointer"
            >
              <Plus className="h-4 w-4 mr-2" />
              Manage Tags
            </DropdownMenuItem>
          </TagManagerDialog>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
