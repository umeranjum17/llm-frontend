"use client";

import { useState, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, FolderOpen, ChevronDown, Settings2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getAllProjects, ensureDefaultProject, DEFAULT_PROJECT_ID } from "@/lib/db/queries";
import { ProjectDialog } from "./project-dialog";
import { Badge } from "@/components/ui/badge";
import { SkeletonLoader } from "@/components/ui/skeleton";

interface ProjectSelectorProps {
  currentProjectId?: string;
  onProjectChange: (projectId: string | undefined) => void;
  compact?: boolean;
}

export function ProjectSelector({
  currentProjectId,
  onProjectChange,
  compact = false,
}: ProjectSelectorProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | undefined>();

  const projects = useLiveQuery(() => getAllProjects(), []);

  // Ensure default project exists on mount
  useEffect(() => {
    ensureDefaultProject();
  }, []);

  const currentProject = projects?.find((p: { id: string }) => p.id === currentProjectId);

  // If no project selected, default to Personal
  useEffect(() => {
    if (!projects) return;
    if (!currentProjectId) {
      onProjectChange(DEFAULT_PROJECT_ID);
    } else if (!currentProject) {
      onProjectChange(DEFAULT_PROJECT_ID);
    }
  }, [projects, currentProjectId, currentProject, onProjectChange]);

  const handleNewProject = () => {
    setEditingProjectId(undefined);
    setDialogOpen(true);
  };

  const handleEditProject = (projectId: string) => {
    setEditingProjectId(projectId);
    setDialogOpen(true);
  };

  // Sort projects: Personal first, then by updatedAt
  const sortedProjects = projects?.slice().sort((a: { id: string; updatedAt: number }, b: { id: string; updatedAt: number }) => {
    if (a.id === DEFAULT_PROJECT_ID) return -1;
    if (b.id === DEFAULT_PROJECT_ID) return 1;
    return b.updatedAt - a.updatedAt;
  });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className={compact ? "gap-1.5 h-7 px-2 text-xs" : "gap-2 h-8 px-2"}>
            {currentProjectId === DEFAULT_PROJECT_ID ? (
              <User className={compact ? "h-3.5 w-3.5 text-muted-foreground" : "h-4 w-4 text-muted-foreground"} />
            ) : currentProject?.color ? (
              <div
                className={compact ? "h-2.5 w-2.5 rounded-full" : "h-3 w-3 rounded-full"}
                style={{ backgroundColor: currentProject.color }}
              />
            ) : (
              <FolderOpen className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
            )}
            <span className={compact ? "text-xs truncate max-w-[80px]" : "text-sm truncate max-w-[120px]"}>
              {currentProject?.name || "Personal"}
            </span>
            <ChevronDown className={compact ? "h-2.5 w-2.5 text-muted-foreground" : "h-3 w-3 text-muted-foreground"} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {sortedProjects && sortedProjects.length > 0 ? (
            sortedProjects.map((project: { id: string; name: string; color?: string }) => (
              <DropdownMenuItem
                key={project.id}
                onClick={() => onProjectChange(project.id)}
                className="flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  {project.id === DEFAULT_PROJECT_ID ? (
                    <User className="h-4 w-4 text-muted-foreground" />
                  ) : project.color ? (
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: project.color }}
                    />
                  ) : (
                    <FolderOpen className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span>{project.name}</span>
                </div>
                {project.id === currentProjectId && (
                  <Badge variant="secondary" className="text-xs h-5">
                    Active
                  </Badge>
                )}
              </DropdownMenuItem>
            ))
          ) : (
            <div className="px-2 py-2">
              <SkeletonLoader variant="list" count={3} />
            </div>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleNewProject}>
            <Plus className="h-4 w-4 mr-2" />
            <span>New Project</span>
          </DropdownMenuItem>
          {currentProject && (
            <DropdownMenuItem
              onClick={() => handleEditProject(currentProject.id)}
            >
              <Settings2 className="h-4 w-4 mr-2" />
              <span>Project Settings</span>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ProjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projectId={editingProjectId}
        onSuccess={(projectId) => {
          onProjectChange(projectId);
          setDialogOpen(false);
        }}
      />
    </>
  );
}
