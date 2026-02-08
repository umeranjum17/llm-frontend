"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
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
import { useLuminaStore } from "@/stores/lumina-store";
import type { LuminaSchedule } from "@/lib/lumina/types";
import { cn } from "@/lib/utils";

function formatRelativeTime(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return formatDistanceToNow(date, { addSuffix: true });
}

function statusBadge(status: "running" | "success" | "error") {
  if (status === "success") return <Badge className="bg-green-500/10 text-green-500 text-[10px]">success</Badge>;
  if (status === "error") return <Badge className="bg-red-500/10 text-red-500 text-[10px]">error</Badge>;
  return <Badge className="bg-amber-500/10 text-amber-500 text-[10px]">running</Badge>;
}

function SchedulesRunHistory({ scheduleId }: { scheduleId: string }) {
  const runs = useLuminaStore((s) => s.scheduleRuns[scheduleId] ?? []);

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Run History</p>
      {runs.length === 0 && <p className="text-sm text-muted-foreground">No runs yet.</p>}
      {runs.map((run) => (
        <div key={run.id} className="rounded border bg-muted/20 p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            {statusBadge(run.status)}
            <span className="text-xs text-muted-foreground">{formatRelativeTime(run.startedAt)}</span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Duration: {typeof run.durationMs === "number" ? `${run.durationMs}ms` : "-"}
          </p>
          {(run.result || run.error) && (
            <p className={cn("mt-2 line-clamp-3 text-xs", run.error ? "text-red-400" : "text-muted-foreground")}>
              {run.error || run.result}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

export function ClawSchedulesTab() {
  const isConnected = useLuminaStore((s) => s.isConnected);
  const schedules = useLuminaStore((s) => s.schedules);
  const refreshSchedules = useLuminaStore((s) => s.refreshSchedules);
  const createSchedule = useLuminaStore((s) => s.createSchedule);
  const deleteSchedule = useLuminaStore((s) => s.deleteSchedule);
  const fetchScheduleRuns = useLuminaStore((s) => s.fetchScheduleRuns);

  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [cronExpression, setCronExpression] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (isConnected) {
      void refreshSchedules();
    }
  }, [isConnected, refreshSchedules]);

  const selectedSchedule = useMemo(
    () => schedules.find((schedule) => schedule.id === selectedScheduleId) ?? null,
    [schedules, selectedScheduleId]
  );

  const handleCreateSchedule = async () => {
    if (!instruction.trim() || !cronExpression.trim()) return;
    await createSchedule(instruction.trim(), cronExpression.trim());
    setInstruction("");
    setCronExpression("");
    setIsCreateOpen(false);
  };

  const handleSelectSchedule = async (schedule: LuminaSchedule) => {
    setSelectedScheduleId(schedule.id);
    await fetchScheduleRuns(schedule.id);
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setMobileOpen(true);
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    await deleteSchedule(id);
    setSelectedScheduleId((prev) => (prev === id ? null : prev));
  };

  return (
    <div className="flex gap-4">
      <div className="min-w-0 flex-1 space-y-3 sm:space-y-4">
        <div className="flex items-center justify-end">
          <Button type="button" size="sm" onClick={() => setIsCreateOpen((prev) => !prev)}>
            New Schedule
          </Button>
        </div>

        <Collapsible open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <CollapsibleContent className="rounded-lg border bg-card p-4">
            <div className="grid gap-3">
              <div className="grid gap-1.5">
                <p className="text-sm text-muted-foreground">Instruction</p>
                <Input
                  value={instruction}
                  onChange={(event) => setInstruction(event.target.value)}
                  placeholder="Daily inbox triage"
                />
              </div>
              <div className="grid gap-1.5">
                <p className="text-sm text-muted-foreground">Cron Expression</p>
                <Input
                  value={cronExpression}
                  onChange={(event) => setCronExpression(event.target.value)}
                  placeholder="0 * * * *"
                  className="font-mono"
                />
              </div>
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={() => void handleCreateSchedule()}>
                  Create
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setIsCreateOpen(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Mobile: card list */}
        <div className="md:hidden space-y-2">
          {schedules.map((schedule) => (
            <button
              key={schedule.id}
              type="button"
              className={cn(
                "w-full rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/30",
                selectedScheduleId === schedule.id && "border-primary/40"
              )}
              onClick={() => void handleSelectSchedule(schedule)}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium">{schedule.name}</p>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-red-500"
                  onClick={(e) => { e.stopPropagation(); void handleDeleteSchedule(schedule.id); }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <p className="mt-1 font-mono text-[10px] text-muted-foreground">{schedule.cronExpression}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px]",
                    schedule.enabled
                      ? "border-green-500/20 bg-green-500/10 text-green-500"
                      : "border-zinc-500/20 bg-zinc-500/10 text-zinc-400"
                  )}
                >
                  {schedule.enabled ? "Active" : "Paused"}
                </Badge>
                <span className="text-[10px] text-muted-foreground">Last: {formatRelativeTime(schedule.lastRun)}</span>
                <span className="text-[10px] text-muted-foreground">Next: {formatRelativeTime(schedule.nextRun)}</span>
              </div>
            </button>
          ))}
          {schedules.length === 0 && (
            <div className="rounded-lg border bg-card py-10 text-center text-sm text-muted-foreground">
              No schedules found.
            </div>
          )}
        </div>

        {/* Desktop: table */}
        <div className="hidden md:block rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Cron</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Run</TableHead>
                <TableHead>Next Run</TableHead>
                <TableHead className="w-[52px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {schedules.map((schedule) => (
                <TableRow
                  key={schedule.id}
                  className={cn("cursor-pointer", selectedScheduleId === schedule.id && "bg-muted/50")}
                  onClick={() => void handleSelectSchedule(schedule)}
                >
                  <TableCell className="font-medium">{schedule.name}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{schedule.cronExpression}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px]",
                        schedule.enabled
                          ? "border-green-500/20 bg-green-500/10 text-green-500"
                          : "border-zinc-500/20 bg-zinc-500/10 text-zinc-400"
                      )}
                    >
                      {schedule.enabled ? "Active" : "Paused"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatRelativeTime(schedule.lastRun)}</TableCell>
                  <TableCell className="text-muted-foreground">{formatRelativeTime(schedule.nextRun)}</TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground hover:text-red-500"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleDeleteSchedule(schedule.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {schedules.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    No schedules found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {selectedSchedule && (
        <div className="hidden lg:block w-[360px] shrink-0 rounded-lg border bg-card p-4">
          <p className="mb-3 text-sm font-semibold">{selectedSchedule.name}</p>
          <SchedulesRunHistory scheduleId={selectedSchedule.id} />
        </div>
      )}

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>{selectedSchedule?.name ?? "Schedule"}</SheetTitle>
          </SheetHeader>
          <div className="mt-4">{selectedSchedule ? <SchedulesRunHistory scheduleId={selectedSchedule.id} /> : null}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
