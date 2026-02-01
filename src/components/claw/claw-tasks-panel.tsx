"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useClawStore } from "@/stores/claw-store";
import { toast } from "sonner";

const statusColor: Record<string, string> = {
  pending: "bg-yellow-500/20 text-yellow-600",
  running: "bg-blue-500/20 text-blue-600",
  completed: "bg-green-500/20 text-green-600",
  failed: "bg-red-500/20 text-red-600",
};

export function ClawTasksPanel() {
  const tasks = useClawStore((s) => s.tasks);
  const createTask = useClawStore((s) => s.createTask);
  const deleteTask = useClawStore((s) => s.deleteTask);
  const isConnected = useClawStore((s) => s.isConnected);

  const [instruction, setInstruction] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const truncate = (text: string, max = 80) =>
    text.length > max ? text.slice(0, max).trimEnd() + "..." : text;

  const handleCreate = async () => {
    if (!instruction.trim()) return;
    try {
      await createTask(instruction.trim());
      setInstruction("");
      setDialogOpen(false);
      toast.success("Task created");
    } catch {
      toast.error("Failed to create task");
    }
  };

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-sm font-medium">Recent Tasks</h3>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" disabled={!isConnected}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              New
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Task</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <Input
                placeholder="Task instruction..."
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
              <Button onClick={handleCreate} className="w-full">
                Submit
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <div className="p-2">
        {tasks.length === 0 ? (
          <p className="px-2 py-4 text-center text-sm text-muted-foreground">No tasks yet.</p>
        ) : (
          <div className="space-y-1">
            {tasks.slice(0, 10).map((task) => {
              const isLong = task.title.length > 80;
              const isExpanded = expandedTasks.has(task.id);
              return (
                <div
                  key={task.id}
                  className="flex items-start justify-between rounded-md px-2 py-2 hover:bg-muted/40 transition-colors"
                >
                  <div className="space-y-1 min-w-0 flex-1 mr-2">
                    <p
                      className={`text-sm ${isLong ? "cursor-pointer hover:text-foreground/80" : ""}`}
                      onClick={() => isLong && toggleExpand(task.id)}
                    >
                      {isExpanded ? task.title : truncate(task.title)}
                    </p>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${statusColor[task.status]}`}>
                        {task.status}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {task.priority}
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 h-7 w-7"
                    onClick={() => deleteTask(task.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
