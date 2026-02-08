"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useLuminaStore } from "@/stores/lumina-store";

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return (
        <Badge variant="secondary" className="gap-1 text-green-600 bg-green-500/10">
          <CheckCircle2 className="h-3 w-3" /> Completed
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="secondary" className="gap-1 text-red-600 bg-red-500/10">
          <XCircle className="h-3 w-3" /> Failed
        </Badge>
      );
    case "running":
      return (
        <Badge variant="secondary" className="gap-1 text-blue-600 bg-blue-500/10">
          <Loader2 className="h-3 w-3 animate-spin" /> Running
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

export function LuminaHistory() {
  const tasks = useLuminaStore((s) => s.tasks);
  const activity = useLuminaStore((s) => s.activity);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);

  // Sort tasks newest first
  const sortedTasks = [...tasks].sort((a, b) => {
    const da = a.createdAt || "";
    const db = b.createdAt || "";
    return db.localeCompare(da);
  });

  return (
    <div className="flex flex-col rounded-lg border bg-card">
      <div className="border-b px-3 py-2">
        <h3 className="text-sm font-medium">Recent Tasks</h3>
      </div>
      <ScrollArea className="h-[300px]">
        {sortedTasks.length === 0 ? (
          <p className="py-12 text-center text-xs text-muted-foreground">No tasks yet.</p>
        ) : (
          <div className="divide-y">
            {sortedTasks.map((task) => {
              const isExpanded = expandedTask === task.id;
              return (
                <div key={task.id}>
                  <button
                    className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent/30 transition-colors"
                    onClick={() => setExpandedTask(isExpanded ? null : task.id)}
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{task.title}</p>
                      {task.createdAt && (
                        <p className="text-[10px] text-muted-foreground">{formatDate(task.createdAt)}</p>
                      )}
                    </div>
                    <StatusBadge status={task.status} />
                  </button>
                  {isExpanded && task.description && (
                    <div className="px-8 pb-2">
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                        {task.description}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {activity.length > 0 && (
        <>
          <div className="border-t border-b px-3 py-2">
            <h3 className="text-sm font-medium">Recent Activity</h3>
          </div>
          <ScrollArea className="h-[200px]">
            <div className="divide-y divide-border/50">
              {activity.slice(0, 30).map((a, i) => (
                <div key={i} className="flex items-start gap-2 px-3 py-1.5">
                  <span className="text-[10px] text-muted-foreground/70 shrink-0 mt-0.5">
                    {a.timestamp ? formatDate(a.timestamp) : ""}
                  </span>
                  <div className="min-w-0">
                    <span className="text-xs font-medium">{a.action}</span>
                    {a.details && (
                      <p className="text-[10px] text-muted-foreground truncate">{a.details}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </>
      )}
    </div>
  );
}
