"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { CheckCircle2, Clock, Loader2, Trash2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useClawStore } from "@/stores/claw-store";
import type { LuminaTask } from "@/lib/lumina/types";
import { cn } from "@/lib/utils";

type TaskStatusFilter = "all" | LuminaTask["status"];

const STATUS_FILTERS: TaskStatusFilter[] = [
  "all",
  "pending",
  "running",
  "completed",
  "failed",
];

function formatRelativeTime(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return formatDistanceToNow(date, { addSuffix: true });
}

function statusIcon(status: LuminaTask["status"]) {
  if (status === "pending") return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
  if (status === "running") return <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />;
  if (status === "completed") return <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />;
  return <XCircle className="h-3.5 w-3.5 text-red-500" />;
}

function statusBadge(status: LuminaTask["status"]) {
  const cls =
    status === "completed"
      ? "bg-green-500/10 text-green-500 border-green-500/20"
      : status === "failed"
        ? "bg-red-500/10 text-red-500 border-red-500/20"
        : status === "running"
          ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
          : "bg-zinc-500/10 text-zinc-400 border-zinc-500/20";
  return (
    <Badge variant="outline" className={cn("text-[10px]", cls)}>
      {status}
    </Badge>
  );
}

function priorityBadge(priority: LuminaTask["priority"]) {
  const cls =
    priority === "high"
      ? "bg-red-500/10 text-red-500 border-red-500/20"
      : priority === "medium"
        ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
        : "bg-zinc-500/10 text-zinc-400 border-zinc-500/20";
  return (
    <Badge variant="outline" className={cn("text-[10px]", cls)}>
      {priority}
    </Badge>
  );
}

function prettyJson(value?: string) {
  if (!value) return "{}";
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function TaskDetail({ task }: { task: LuminaTask }) {
  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-center gap-2">{statusBadge(task.status)}</div>
      <div>
        <p className="text-lg font-semibold">{task.title}</p>
        <p className="mt-1 text-muted-foreground">{task.description || "No description"}</p>
      </div>
      <div className="grid gap-2 text-muted-foreground">
        <p>
          <span className="text-foreground">Priority:</span> {task.priority}
        </p>
        <p>
          <span className="text-foreground">Created:</span> {task.createdAt}
        </p>
        <p>
          <span className="text-foreground">Updated:</span> {task.updatedAt}
        </p>
      </div>
      <div>
        <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Metadata</p>
        <pre className="max-h-64 overflow-auto rounded border bg-muted/30 p-3 text-xs">{prettyJson(task.metadata)}</pre>
      </div>
    </div>
  );
}

export function ClawTasksTab() {
  const isConnected = useClawStore((s) => s.isConnected);
  const tasks = useClawStore((s) => s.tasks);
  const refreshTasks = useClawStore((s) => s.refreshTasks);
  const deleteTask = useClawStore((s) => s.deleteTask);

  const [selectedTask, setSelectedTask] = useState<LuminaTask | null>(null);
  const [statusFilter, setStatusFilter] = useState<TaskStatusFilter>("all");
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (isConnected) {
      void refreshTasks();
    }
  }, [isConnected, refreshTasks]);

  const filteredTasks = useMemo(() => {
    if (statusFilter === "all") return tasks;
    return tasks.filter((task) => task.status === statusFilter);
  }, [statusFilter, tasks]);

  const handleSelectTask = (task: LuminaTask) => {
    setSelectedTask(task);
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setMobileOpen(true);
    }
  };

  const handleDeleteTask = async (id: string) => {
    await deleteTask(id);
    setSelectedTask((prev) => (prev?.id === id ? null : prev));
  };

  return (
    <div className="flex gap-4">
      <div className="min-w-0 flex-1 space-y-3 sm:space-y-4">
        <div className="flex flex-wrap gap-1.5 sm:gap-2">
          {STATUS_FILTERS.map((filter) => (
            <Button
              key={filter}
              type="button"
              variant="ghost"
              className="h-7 sm:h-8 px-0"
              onClick={() => setStatusFilter(filter)}
            >
              <Badge
                variant="outline"
                className={cn(
                  "capitalize text-[10px] sm:text-xs",
                  statusFilter === filter
                    ? "border-primary bg-primary/20 text-primary"
                    : "border-border bg-muted/20 text-muted-foreground"
                )}
              >
                {filter}
              </Badge>
            </Button>
          ))}
        </div>

        {/* Mobile: card list */}
        <div className="md:hidden space-y-2">
          {filteredTasks.map((task) => (
            <button
              key={task.id}
              type="button"
              className={cn(
                "w-full rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/30",
                selectedTask?.id === task.id && "border-primary/40"
              )}
              onClick={() => handleSelectTask(task)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {statusIcon(task.status)}
                  <p className="text-sm font-medium truncate">{task.title}</p>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-red-500"
                  onClick={(e) => { e.stopPropagation(); void handleDeleteTask(task.id); }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {statusBadge(task.status)}
                {priorityBadge(task.priority)}
                <span className="text-[10px] text-muted-foreground ml-auto">{formatRelativeTime(task.createdAt)}</span>
              </div>
            </button>
          ))}
          {filteredTasks.length === 0 && (
            <div className="rounded-lg border bg-card py-10 text-center text-sm text-muted-foreground">
              No tasks found.
            </div>
          )}
        </div>

        {/* Desktop: table */}
        <div className="hidden md:block rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-[52px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTasks.map((task) => (
                <TableRow
                  key={task.id}
                  onClick={() => handleSelectTask(task)}
                  className={cn("cursor-pointer", selectedTask?.id === task.id && "bg-muted/50")}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {statusIcon(task.status)}
                      <span className="capitalize">{task.status}</span>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[320px] truncate font-medium">{task.title}</TableCell>
                  <TableCell>{priorityBadge(task.priority)}</TableCell>
                  <TableCell className="text-muted-foreground">{formatRelativeTime(task.createdAt)}</TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground hover:text-red-500"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleDeleteTask(task.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filteredTasks.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                    No tasks found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {selectedTask && (
        <div className="hidden lg:block w-[360px] shrink-0 rounded-lg border bg-card p-4">
          <TaskDetail task={selectedTask} />
        </div>
      )}

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Task Details</SheetTitle>
          </SheetHeader>
          <div className="mt-4">{selectedTask ? <TaskDetail task={selectedTask} /> : null}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
