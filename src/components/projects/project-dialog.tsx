"use client";

import { useState, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createProject,
  updateProject,
  getProjectById,
  deleteProject,
} from "@/lib/db/queries";

interface ProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: string;
  onSuccess?: (projectId: string) => void;
}

const PRESET_COLORS = [
  "#3b82f6", // blue
  "#10b981", // green
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // purple
  "#ec4899", // pink
];

export function ProjectDialog({
  open,
  onOpenChange,
  projectId,
  onSuccess,
}: ProjectDialogProps) {
  const [name, setName] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [isLoading, setIsLoading] = useState(false);

  const project = useLiveQuery(
    () => (projectId ? getProjectById(projectId) : undefined),
    [projectId]
  );

  // Load project data when editing
  useEffect(() => {
    if (project) {
      setName(project.name);
      setSystemPrompt(project.systemPrompt || "");
      setColor(project.color || PRESET_COLORS[0]);
    } else {
      setName("");
      setSystemPrompt("");
      setColor(PRESET_COLORS[0]);
    }
  }, [project]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsLoading(true);
    try {
      if (projectId) {
        // Update existing project
        await updateProject(projectId, {
          name: name.trim(),
          systemPrompt: systemPrompt.trim() || undefined,
          color,
        });
        onSuccess?.(projectId);
      } else {
        // Create new project
        const newProject = await createProject({
          name: name.trim(),
          systemPrompt: systemPrompt.trim() || undefined,
          color,
        });
        onSuccess?.(newProject.id);
      }
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to save project:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!projectId) return;
    if (!confirm("Delete this project? All files will be removed.")) return;

    setIsLoading(true);
    try {
      await deleteProject(projectId);
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to delete project:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {projectId ? "Edit Project" : "New Project"}
          </DialogTitle>
          <DialogDescription>
            Projects help organize chats and provide default context
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Project Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Project"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Project Color</Label>
            <div className="flex gap-2">
              {PRESET_COLORS.map((presetColor) => (
                <button
                  key={presetColor}
                  type="button"
                  onClick={() => setColor(presetColor)}
                  className="h-8 w-8 rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    backgroundColor: presetColor,
                    borderColor: color === presetColor ? "#000" : "transparent",
                  }}
                />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="systemPrompt">
              System Prompt (Optional)
            </Label>
            <Textarea
              id="systemPrompt"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="You are a helpful assistant..."
              rows={6}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              This prompt will be automatically included in all chats within this project
            </p>
          </div>

          <DialogFooter className="flex items-center justify-between">
            {projectId && (
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={isLoading}
              >
                Delete Project
              </Button>
            )}
            <div className="flex gap-2 ml-auto">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isLoading || !name.trim()}>
                {isLoading ? "Saving..." : projectId ? "Save" : "Create"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
