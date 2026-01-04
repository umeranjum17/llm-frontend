"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Tag as TagIcon, Hash } from "lucide-react";
import { toast } from "sonner";
import {
  getAllTags,
  createTag,
  deleteTag,
  updateTag,
} from "@/lib/db/queries";
import { TAG_COLORS } from "@/lib/db/tag-schema";

interface TagManagerDialogProps {
  children?: React.ReactNode;
}

export function TagManagerDialog({ children }: TagManagerDialogProps) {
  const [open, setOpen] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0].id);
  const [newTagDescription, setNewTagDescription] = useState("");

  const tags = useLiveQuery(() => getAllTags(), []);

  const handleCreateTag = async () => {
    if (!newTagName.trim()) {
      toast.error("Please enter a tag name");
      return;
    }

    try {
      const colorObj = TAG_COLORS.find((c) => c.id === newTagColor);
      await createTag({
        name: newTagName.trim(),
        color: colorObj?.value || TAG_COLORS[0].value,
        description: newTagDescription.trim() || undefined,
      });

      toast.success("Tag created successfully");
      setNewTagName("");
      setNewTagColor(TAG_COLORS[0].id);
      setNewTagDescription("");
    } catch (error) {
      toast.error("Failed to create tag");
      console.error(error);
    }
  };

  const handleDeleteTag = async (id: string, name: string) => {
    if (!confirm(`Delete tag "${name}"? It will be removed from all chats.`)) {
      return;
    }

    try {
      await deleteTag(id);
      toast.success("Tag deleted");
    } catch (error) {
      toast.error("Failed to delete tag");
      console.error(error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button variant="outline" size="sm" className="gap-2">
            <TagIcon className="h-4 w-4" />
            Manage Tags
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Tag Management</DialogTitle>
          <DialogDescription>
            Create and organize tags for your chats
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Create New Tag */}
          <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
            <h4 className="font-medium flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Create New Tag
            </h4>

            <div className="grid gap-3">
              <div className="space-y-2">
                <Label htmlFor="tag-name">Tag Name</Label>
                <Input
                  id="tag-name"
                  placeholder="e.g., Work, Personal, Bug"
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleCreateTag();
                    }
                  }}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tag-color">Color</Label>
                <Select value={newTagColor} onValueChange={setNewTagColor}>
                  <SelectTrigger id="tag-color">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TAG_COLORS.map((color) => (
                      <SelectItem key={color.id} value={color.id}>
                        <div className="flex items-center gap-2">
                          <div
                            className="h-4 w-4 rounded-full"
                            style={{ backgroundColor: color.value }}
                          />
                          {color.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tag-description">Description (Optional)</Label>
                <Input
                  id="tag-description"
                  placeholder="Brief description"
                  value={newTagDescription}
                  onChange={(e) => setNewTagDescription(e.target.value)}
                />
              </div>

              <Button onClick={handleCreateTag} className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Create Tag
              </Button>
            </div>
          </div>

          {/* Existing Tags */}
          <div className="space-y-3">
            <Label>Your Tags ({tags?.length || 0})</Label>
            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {tags && tags.length > 0 ? (
                  tags.map((tag) => (
                    <div
                      key={tag.id}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent transition-colors"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div
                          className="h-3 w-3 rounded-full shrink-0"
                          style={{ backgroundColor: tag.color }}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{tag.name}</span>
                            {tag.usageCount && tag.usageCount > 0 && (
                              <Badge variant="secondary" className="text-xs">
                                <Hash className="h-3 w-3 mr-1" />
                                {tag.usageCount}
                              </Badge>
                            )}
                          </div>
                          {tag.description && (
                            <p className="text-xs text-muted-foreground truncate">
                              {tag.description}
                            </p>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteTag(tag.id, tag.name)}
                        title="Delete tag"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-sm text-muted-foreground">
                    No tags yet. Create your first tag above.
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
