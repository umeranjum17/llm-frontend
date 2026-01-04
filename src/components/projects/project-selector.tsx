"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, FolderOpen, ChevronDown, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getAllProjects } from "@/lib/db/queries";
import { ProjectDialog } from "./project-dialog";
import { Badge } from "@/components/ui/badge";

interface ProjectSelectorProps {
  currentProjectId?: string;
  onProjectChange: (projectId: string | undefined) => void;
}

export function ProjectSelector({
  currentProjectId,
  onProjectChange,
}: ProjectSelectorProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | undefined>();

  const projects = useLiveQuery(() => getAllProjects(), []);

  const currentProject = projects?.find((p) => p.id === currentProjectId);

  const handleNewProject = () => {
    setEditingProjectId(undefined);
    setDialogOpen(true);
  };

  const handleEditProject = (projectId: string) => {
    setEditingProjectId(projectId);
    setDialogOpen(true);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2">
            <FolderOpen className="h-4 w-4" />
            <span className="text-sm">
              {currentProject?.name || "No Project"}
            </span>
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuItem onClick={() => onProjectChange(undefined)}>
            <span className="font-medium">No Project</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {projects && projects.length > 0 ? (
            projects.map((project) => (
              <DropdownMenuItem
                key={project.id}
                onClick={() => onProjectChange(project.id)}
                className="flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  {project.color && (
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: project.color }}
                    />
                  )}
                  <span>{project.name}</span>
                </div>
                {project.id === currentProjectId && (
                  <Badge variant="secondary" className="text-xs">
                    Active
                  </Badge>
                )}
              </DropdownMenuItem>
            ))
          ) : (
            <div className="px-2 py-4 text-center text-sm text-muted-foreground">
              No projects yet
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
