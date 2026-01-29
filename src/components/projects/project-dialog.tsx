"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
  DEFAULT_PROJECT_ID,
} from "@/lib/db/queries";
import { DeleteProjectDialog } from "./delete-project-dialog";
import { ProjectSources } from "./project-sources";

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
] as const;

const projectSchema = z.object({
  name: z.string().min(1, "Project name is required").max(100, "Name too long"),
  systemPrompt: z.string().optional(),
  color: z.enum(PRESET_COLORS as any),
});

type ProjectFormData = z.infer<typeof projectSchema>;

export function ProjectDialog({
  open,
  onOpenChange,
  projectId,
  onSuccess,
}: ProjectDialogProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    watch,
    setValue,
  } = useForm<ProjectFormData>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      name: "",
      systemPrompt: "",
      color: PRESET_COLORS[0],
    },
  });

  const color = watch("color");

  const project = useLiveQuery(
    () => (projectId ? getProjectById(projectId) : undefined),
    [projectId]
  );

  const isDefaultProject = projectId === DEFAULT_PROJECT_ID;

  // Load project data when editing
  useEffect(() => {
    if (project) {
      reset({
        name: project.name,
        systemPrompt: project.systemPrompt || "",
        color: (project.color as any) || PRESET_COLORS[0],
      });
    } else {
      reset({
        name: "",
        systemPrompt: "",
        color: PRESET_COLORS[0],
      });
    }
  }, [project, reset]);

  const onSubmit = async (data: ProjectFormData) => {
    try {
      if (projectId) {
        // Update existing project
        await updateProject(projectId, {
          name: data.name.trim(),
          systemPrompt: data.systemPrompt?.trim() || undefined,
          color: data.color,
        });
        onSuccess?.(projectId);
      } else {
        // Create new project
        const newProject = await createProject({
          name: data.name.trim(),
          systemPrompt: data.systemPrompt?.trim() || undefined,
          color: data.color,
        });
        onSuccess?.(newProject.id);
      }
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to save project:", error);
    }
  };

  const handleDeleteClick = () => {
    setDeleteDialogOpen(true);
  };

  const handleDeleted = () => {
    setDeleteDialogOpen(false);
    onOpenChange(false);
  };

  return (
    <>
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

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Project Name</Label>
              <Input
                id="name"
                {...register("name")}
                placeholder="My Project"
                disabled={isDefaultProject}
              />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name.message}</p>
              )}
              {isDefaultProject && (
                <p className="text-xs text-muted-foreground">
                  The Personal project cannot be renamed or deleted
                </p>
              )}
            </div>

            {!isDefaultProject && (
              <div className="space-y-2">
                <Label>Project Color</Label>
                <div className="flex gap-2">
                  {PRESET_COLORS.map((presetColor) => (
                    <button
                      key={presetColor}
                      type="button"
                      onClick={() => setValue("color", presetColor)}
                      className="h-8 w-8 rounded-full border-2 transition-transform hover:scale-110"
                      style={{
                        backgroundColor: presetColor,
                        borderColor: color === presetColor ? "#000" : "transparent",
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="systemPrompt">
                System Prompt (Optional)
              </Label>
              <Textarea
                id="systemPrompt"
                {...register("systemPrompt")}
                placeholder="You are a helpful assistant..."
                rows={6}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                This prompt will be automatically included in all chats within this project
              </p>
            </div>

            {projectId && (
              <div className="space-y-2">
                <Label>Source Files</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Upload files to use with Knowledge Base mode
                </p>
                <ProjectSources projectId={projectId} />
              </div>
            )}

            <DialogFooter className="flex items-center justify-between">
              {projectId && !isDefaultProject && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDeleteClick}
                  disabled={isSubmitting}
                >
                  Delete Project
                </Button>
              )}
              <div className="flex gap-2 ml-auto">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Saving..." : projectId ? "Save" : "Create"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {projectId && project && (
        <DeleteProjectDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          projectId={projectId}
          projectName={project.name}
          onDeleted={handleDeleted}
        />
      )}
    </>
  );
}
