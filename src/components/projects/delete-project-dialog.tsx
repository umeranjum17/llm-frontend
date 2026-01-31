"use client";

import { useState, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { AlertTriangle, Trash2, FolderInput } from "lucide-react";
import {
  getAllProjects,
  getProjectChatCount,
  deleteProject,
  DEFAULT_PROJECT_ID,
} from "@/lib/db/queries";
import { toast } from "sonner";

interface DeleteProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
  onDeleted?: () => void;
}

export function DeleteProjectDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  onDeleted,
}: DeleteProjectDialogProps) {
  const [action, setAction] = useState<"delete" | "move">("move");
  const [isDeleting, setIsDeleting] = useState(false);
  const [chatCount, setChatCount] = useState(0);

  const projects = useLiveQuery(() => getAllProjects(), []);
  const otherProjects = projects?.filter(
    (p: { id: string }) => p.id !== projectId
  );

  useEffect(() => {
    if (open && projectId) {
      getProjectChatCount(projectId).then(setChatCount);
    }
  }, [open, projectId]);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const cascadeDelete = action === "delete";
      const result = await deleteProject(projectId, cascadeDelete);

      if (cascadeDelete && result.deletedChats > 0) {
        toast.success(`Project deleted with ${result.deletedChats} chat${result.deletedChats > 1 ? "s" : ""}`);
      } else if (!cascadeDelete && chatCount > 0) {
        toast.success(`Project deleted. ${chatCount} chat${chatCount > 1 ? "s" : ""} moved to Personal`);
      } else {
        toast.success("Project deleted");
      }

      onDeleted?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to delete project:", error);
      toast.error("Failed to delete project");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Delete &quot;{projectName}&quot;?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              {chatCount > 0 ? (
                <>
                  <p>
                    This project contains <strong>{chatCount} chat{chatCount > 1 ? "s" : ""}</strong>.
                    What would you like to do with them?
                  </p>

                  <RadioGroup
                    value={action}
                    onValueChange={(v) => setAction(v as "delete" | "move")}
                    className="space-y-3"
                  >
                    <div className="flex items-start space-x-3 rounded-lg border p-3 cursor-pointer hover:bg-accent/50"
                      onClick={() => setAction("move")}>
                      <RadioGroupItem value="move" id="move" className="mt-0.5" />
                      <Label htmlFor="move" className="cursor-pointer flex-1">
                        <div className="flex items-center gap-2 font-medium">
                          <FolderInput className="h-4 w-4" />
                          Move chats to Personal
                        </div>
                        <p className="text-sm text-muted-foreground font-normal mt-1">
                          Keep your chats safe by moving them to your Personal project
                        </p>
                      </Label>
                    </div>

                    <div className="flex items-start space-x-3 rounded-lg border border-destructive/30 p-3 cursor-pointer hover:bg-destructive/5"
                      onClick={() => setAction("delete")}>
                      <RadioGroupItem value="delete" id="delete" className="mt-0.5" />
                      <Label htmlFor="delete" className="cursor-pointer flex-1">
                        <div className="flex items-center gap-2 font-medium text-destructive">
                          <Trash2 className="h-4 w-4" />
                          Delete all chats
                        </div>
                        <p className="text-sm text-muted-foreground font-normal mt-1">
                          Permanently delete all {chatCount} chat{chatCount > 1 ? "s" : ""} and their messages. This cannot be undone.
                        </p>
                      </Label>
                    </div>
                  </RadioGroup>
                </>
              ) : (
                <p>
                  This project has no chats. It will be permanently deleted.
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            variant={action === "delete" && chatCount > 0 ? "destructive" : "default"}
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting ? "Deleting..." : action === "delete" && chatCount > 0 ? "Delete All" : "Delete Project"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
