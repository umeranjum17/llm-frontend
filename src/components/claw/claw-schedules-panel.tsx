"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, ChevronDown, ChevronRight, CheckCircle2, XCircle, Loader2 } from "lucide-react";
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

function formatRelativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatFutureTime(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff < 0) return "now";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "< 1m";
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `in ${hours}h`;
  return `in ${Math.floor(hours / 24)}d`;
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

function ScheduleRunHistory({ scheduleId }: { scheduleId: string }) {
  const { scheduleRuns, fetchScheduleRuns } = useClawStore();
  const runs = scheduleRuns[scheduleId];
  const [expandedRun, setExpandedRun] = useState<string | null>(null);

  useEffect(() => {
    fetchScheduleRuns(scheduleId);
  }, [scheduleId, fetchScheduleRuns]);

  if (!runs) {
    return (
      <div className="flex items-center gap-2 py-2 px-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Loading...
      </div>
    );
  }

  if (runs.length === 0) {
    return <p className="text-xs text-muted-foreground py-2 px-2">No runs yet.</p>;
  }

  return (
    <div className="space-y-1 pt-1">
      {runs.map((run) => (
        <div key={run.id} className="rounded border bg-muted/30">
          <button
            type="button"
            className="w-full flex items-center gap-2 px-2 py-1.5 text-xs hover:bg-muted/50 transition-colors"
            onClick={() => setExpandedRun(expandedRun === run.id ? null : run.id)}
          >
            {run.status === "success" && <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />}
            {run.status === "error" && <XCircle className="h-3 w-3 text-red-500 shrink-0" />}
            {run.status === "running" && <Loader2 className="h-3 w-3 text-blue-500 animate-spin shrink-0" />}
            <span className="text-muted-foreground">{formatRelativeTime(run.startedAt)}</span>
            {run.durationMs != null && (
              <span className="text-muted-foreground">({formatDuration(run.durationMs)})</span>
            )}
            <span className="ml-auto text-muted-foreground truncate max-w-[200px]">
              {run.status === "error" ? run.error : run.result?.slice(0, 60)}
            </span>
          </button>
          {expandedRun === run.id && (
            <div className="px-2 pb-2 pt-1 border-t">
              <pre className="text-xs whitespace-pre-wrap break-words text-muted-foreground max-h-[200px] overflow-y-auto">
                {run.status === "error" ? run.error : run.result || "No output"}
              </pre>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function ClawSchedulesPanel() {
  const schedules = useClawStore((s) => s.schedules);
  const createSchedule = useClawStore((s) => s.createSchedule);
  const deleteSchedule = useClawStore((s) => s.deleteSchedule);
  const isConnected = useClawStore((s) => s.isConnected);

  const [name, setName] = useState("");
  const [cron, setCron] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [expandedSchedule, setExpandedSchedule] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim() || !cron.trim()) return;
    try {
      await createSchedule(name.trim(), cron.trim());
      setName("");
      setCron("");
      setDialogOpen(false);
      toast.success("Schedule created");
    } catch {
      toast.error("Failed to create schedule");
    }
  };

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-sm font-medium">Schedules</h3>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" disabled={!isConnected}>
              <Plus className="h-3.5 w-3.5 mr-1" />
              New
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Schedule</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <Input
                placeholder="Schedule name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Input
                placeholder="Cron expression (e.g. 0 * * * *)"
                value={cron}
                onChange={(e) => setCron(e.target.value)}
              />
              <Button onClick={handleCreate} className="w-full">
                Submit
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      <div className="p-2 max-h-[400px] overflow-y-auto">
        {schedules.length === 0 ? (
          <p className="px-2 py-4 text-center text-sm text-muted-foreground">No schedules.</p>
        ) : (
          <div className="space-y-1">
            {schedules.map((sch) => (
              <div key={sch.id} className="rounded-md">
                <div className="flex items-center justify-between px-2 py-2 hover:bg-muted/40 transition-colors rounded-md">
                  <button
                    type="button"
                    className="flex-1 text-left flex items-start gap-2"
                    onClick={() => setExpandedSchedule(expandedSchedule === sch.id ? null : sch.id)}
                  >
                    {expandedSchedule === sch.id ? (
                      <ChevronDown className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                    )}
                    <div className="space-y-1 min-w-0">
                      <p className="text-sm">{sch.name}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <code className="text-[10px] font-mono bg-muted px-1 py-0.5 rounded">
                          {sch.cronExpression}
                        </code>
                        <Badge variant={sch.enabled ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
                          {sch.enabled ? "On" : "Off"}
                        </Badge>
                        {sch.lastRun && (
                          <span className="text-[10px] text-muted-foreground">
                            Last: {formatRelativeTime(sch.lastRun)}
                          </span>
                        )}
                        {sch.nextRun && (
                          <span className="text-[10px] text-muted-foreground">
                            Next: {formatFutureTime(sch.nextRun)}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0 h-7 w-7"
                    onClick={() => deleteSchedule(sch.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
                {expandedSchedule === sch.id && (
                  <div className="px-2 pb-2">
                    <ScheduleRunHistory scheduleId={sch.id} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
