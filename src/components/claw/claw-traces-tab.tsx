"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
import type { LuminaTrace } from "@/lib/lumina/types";
import { cn } from "@/lib/utils";

type TraceSourceFilter = "all" | "chat" | "cron" | "heartbeat" | "ambient" | "reflection" | "watcher";

const TRACE_SOURCE_FILTERS: TraceSourceFilter[] = [
  "all",
  "chat",
  "cron",
  "heartbeat",
  "ambient",
  "reflection",
  "watcher",
];

const SOURCE_STYLES: Record<string, string> = {
  chat: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  cron: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  heartbeat: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  ambient: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20",
  reflection: "bg-pink-500/10 text-pink-500 border-pink-500/20",
  watcher: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
};

function formatRelativeTime(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return formatDistanceToNow(date, { addSuffix: true });
}

function sourceBadge(source: string) {
  return (
    <Badge variant="outline" className={cn("text-[10px]", SOURCE_STYLES[source] ?? "bg-zinc-500/10 text-zinc-400 border-zinc-500/20")}>
      {source}
    </Badge>
  );
}

function truncate(value: string, length = 80) {
  if (value.length <= length) return value;
  return `${value.slice(0, length)}...`;
}

function TraceDetail({ trace }: { trace: LuminaTrace }) {
  const [openSteps, setOpenSteps] = useState<Record<string, boolean>>({});

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center gap-2">{sourceBadge(trace.source)}</div>
        <p className="text-sm text-muted-foreground">{trace.input}</p>
      </div>

      <div className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Steps</p>
        {trace.steps.length === 0 && <p className="text-sm text-muted-foreground">No tool steps.</p>}
        {trace.steps.map((step, index) => {
          const stepKey = `${trace.id}-${index}`;
          const isOpen = !!openSteps[stepKey];
          return (
            <Collapsible
              key={stepKey}
              open={isOpen}
              onOpenChange={(nextOpen) => setOpenSteps((prev) => ({ ...prev, [stepKey]: nextOpen }))}
              className="rounded border bg-muted/20"
            >
              <CollapsibleTrigger asChild>
                <button type="button" className="flex w-full items-center justify-between p-3 text-left text-sm">
                  <span className="font-mono text-amber-400">{step.toolName}</span>
                  {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-3 border-t p-3">
                <div>
                  <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Input</p>
                  <pre className="max-h-48 overflow-auto rounded border bg-card p-2 text-xs whitespace-pre-wrap">{step.input || "-"}</pre>
                </div>
                <div>
                  <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Result</p>
                  <pre className="max-h-48 overflow-auto rounded border bg-card p-2 text-xs whitespace-pre-wrap">{step.result || "-"}</pre>
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}

export function ClawTracesTab() {
  const isConnected = useClawStore((s) => s.isConnected);
  const traces = useClawStore((s) => s.traces);
  const refreshTraces = useClawStore((s) => s.refreshTraces);

  const [sourceFilter, setSourceFilter] = useState<TraceSourceFilter>("all");
  const [selectedTrace, setSelectedTrace] = useState<LuminaTrace | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!isConnected) return;
    const source = sourceFilter === "all" ? undefined : sourceFilter;
    void refreshTraces(source);
  }, [isConnected, refreshTraces, sourceFilter]);

  const filteredTraces = useMemo(() => {
    if (sourceFilter === "all") return traces;
    return traces.filter((trace) => trace.source === sourceFilter);
  }, [sourceFilter, traces]);

  const handleSelectTrace = (trace: LuminaTrace) => {
    setSelectedTrace(trace);
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setMobileOpen(true);
    }
  };

  return (
    <div className="flex gap-4">
      <div className="min-w-0 flex-1 space-y-3 sm:space-y-4">
        <div className="flex flex-wrap gap-1.5 sm:gap-2">
          {TRACE_SOURCE_FILTERS.map((source) => (
            <Button
              key={source}
              type="button"
              variant="ghost"
              className="h-7 sm:h-8 px-0"
              onClick={() => setSourceFilter(source)}
            >
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] sm:text-xs",
                  source === "all"
                    ? sourceFilter === "all"
                      ? "border-primary bg-primary/20 text-primary"
                      : "border-border bg-muted/20 text-muted-foreground"
                    : SOURCE_STYLES[source],
                  sourceFilter !== source && source !== "all" && "opacity-60"
                )}
              >
                {source}
              </Badge>
            </Button>
          ))}
        </div>

        {/* Mobile: card list */}
        <div className="md:hidden space-y-2">
          {filteredTraces.map((trace) => (
            <button
              key={trace.id}
              type="button"
              className={cn(
                "w-full rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/30",
                selectedTrace?.id === trace.id && "border-primary/40"
              )}
              onClick={() => handleSelectTrace(trace)}
            >
              <div className="flex items-center gap-2 mb-2">
                {sourceBadge(trace.source)}
                <span className="text-[10px] text-muted-foreground">{trace.toolCount} tools</span>
                {typeof trace.durationMs === "number" && (
                  <span className="text-[10px] text-muted-foreground">{trace.durationMs}ms</span>
                )}
              </div>
              <p className="text-sm text-muted-foreground line-clamp-2">{truncate(trace.input, 120)}</p>
              <p className="mt-1.5 text-[10px] text-muted-foreground/70">{formatRelativeTime(trace.startedAt)}</p>
            </button>
          ))}
          {filteredTraces.length === 0 && (
            <div className="rounded-lg border bg-card py-10 text-center text-sm text-muted-foreground">
              No traces found.
            </div>
          )}
        </div>

        {/* Desktop: table */}
        <div className="hidden md:block rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead>Input</TableHead>
                <TableHead>Tools</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTraces.map((trace) => (
                <TableRow
                  key={trace.id}
                  className={cn("cursor-pointer", selectedTrace?.id === trace.id && "bg-muted/50")}
                  onClick={() => handleSelectTrace(trace)}
                >
                  <TableCell>{sourceBadge(trace.source)}</TableCell>
                  <TableCell className="max-w-[360px] truncate text-muted-foreground">{truncate(trace.input, 80)}</TableCell>
                  <TableCell>{trace.toolCount}</TableCell>
                  <TableCell>{typeof trace.durationMs === "number" ? `${trace.durationMs}ms` : "-"}</TableCell>
                  <TableCell className="text-muted-foreground">{formatRelativeTime(trace.startedAt)}</TableCell>
                </TableRow>
              ))}
              {filteredTraces.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                    No traces found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {selectedTrace && (
        <div className="hidden lg:block w-[420px] shrink-0 rounded-lg border bg-card p-4">
          <TraceDetail trace={selectedTrace} />
        </div>
      )}

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Trace Details</SheetTitle>
          </SheetHeader>
          <div className="mt-4">{selectedTrace ? <TraceDetail trace={selectedTrace} /> : null}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
