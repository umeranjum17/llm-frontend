"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { CheckCircle2, ChevronDown, ChevronRight, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
import { useClawStore } from "@/stores/claw-store";
import type { ClawToolCall } from "@/lib/claw/types";
import { cn } from "@/lib/utils";

type ToolCallSourceFilter = "all" | "chat" | "cron" | "heartbeat" | "ambient" | "reflection" | "watcher";

const SOURCE_FILTERS: ToolCallSourceFilter[] = [
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

function parseJson(value?: string) {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function prettyJson(value?: string) {
  if (!value) return "-";
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function sourceBadge(source: string) {
  return (
    <Badge variant="outline" className={cn("text-[10px]", SOURCE_STYLES[source] ?? "bg-zinc-500/10 text-zinc-400 border-zinc-500/20")}>
      {source}
    </Badge>
  );
}

function DetailSection({
  title,
  defaultOpen,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded border bg-muted/20">
      <CollapsibleTrigger asChild>
        <button type="button" className="flex w-full items-center justify-between p-3 text-left text-sm font-medium">
          <span>{title}</span>
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t p-3">{children}</CollapsibleContent>
    </Collapsible>
  );
}

function ToolCallDetail({ call }: { call: ClawToolCall }) {
  const sideEffects = parseJson(call.sideEffects) as
    | { fileChanges?: unknown; gitOps?: unknown; [key: string]: unknown }
    | null;

  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="font-mono text-amber-400">{call.toolName}</p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>Source: {call.source}</span>
          <span>Duration: {typeof call.durationMs === "number" ? `${call.durationMs}ms` : "-"}</span>
        </div>
      </div>

      <DetailSection title="Reasoning" defaultOpen>
        <pre className="whitespace-pre-wrap text-xs text-muted-foreground">{call.reasoning || "-"}</pre>
      </DetailSection>

      <DetailSection title="Arguments">
        <pre className="max-h-56 overflow-auto rounded border bg-card p-2 text-xs">{prettyJson(call.args)}</pre>
      </DetailSection>

      <DetailSection title="Side Effects">
        {sideEffects ? (
          <div className="space-y-3 text-xs">
            <div>
              <p className="mb-1 uppercase tracking-wide text-muted-foreground">File Changes</p>
              <pre className="max-h-40 overflow-auto rounded border bg-card p-2">
                {JSON.stringify(sideEffects.fileChanges ?? [], null, 2)}
              </pre>
            </div>
            <div>
              <p className="mb-1 uppercase tracking-wide text-muted-foreground">Git Ops</p>
              <pre className="max-h-40 overflow-auto rounded border bg-card p-2">
                {JSON.stringify(sideEffects.gitOps ?? [], null, 2)}
              </pre>
            </div>
          </div>
        ) : (
          <pre className="max-h-56 overflow-auto rounded border bg-card p-2 text-xs">{prettyJson(call.sideEffects)}</pre>
        )}
      </DetailSection>

      <DetailSection title="Result">
        <pre className="max-h-56 overflow-auto rounded border bg-card p-2 text-xs">{prettyJson(call.result)}</pre>
      </DetailSection>

      {call.error && (
        <DetailSection title="Error" defaultOpen>
          <pre className="max-h-56 overflow-auto rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300 whitespace-pre-wrap">
            {call.error}
          </pre>
        </DetailSection>
      )}
    </div>
  );
}

export function ClawToolCallsTab() {
  const isConnected = useClawStore((s) => s.isConnected);
  const toolCalls = useClawStore((s) => s.toolCalls);
  const toolCallsTotal = useClawStore((s) => s.toolCallsTotal);
  const toolCallStats = useClawStore((s) => s.toolCallStats);
  const refreshToolCalls = useClawStore((s) => s.refreshToolCalls);
  const refreshToolCallStats = useClawStore((s) => s.refreshToolCallStats);

  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<ToolCallSourceFilter>("all");
  const [selectedCall, setSelectedCall] = useState<ClawToolCall | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!isConnected) return;
    void refreshToolCallStats();
  }, [isConnected, refreshToolCallStats]);

  useEffect(() => {
    if (!isConnected) return;
    void refreshToolCalls({
      toolName: search.trim() || undefined,
      source: sourceFilter === "all" ? undefined : sourceFilter,
    });
  }, [isConnected, refreshToolCalls, search, sourceFilter]);

  const displayedCalls = useMemo(() => {
    if (!search.trim()) return toolCalls;
    const q = search.toLowerCase();
    return toolCalls.filter((call) => call.toolName.toLowerCase().includes(q));
  }, [search, toolCalls]);

  const handleSelectCall = (call: ClawToolCall) => {
    setSelectedCall(call);
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setMobileOpen(true);
    }
  };

  return (
    <div className="flex gap-4">
      <div className="min-w-0 flex-1 space-y-3 sm:space-y-4">
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
          <Card className="p-3 sm:p-4">
            <p className="text-[10px] sm:text-xs text-muted-foreground">Total Calls</p>
            <p className="mt-0.5 text-xl sm:text-2xl font-semibold tabular-nums">{toolCallStats?.total ?? toolCallsTotal}</p>
          </Card>
          <Card className="p-3 sm:p-4">
            <p className="text-[10px] sm:text-xs text-muted-foreground">Successful</p>
            <p className="mt-0.5 text-xl sm:text-2xl font-semibold text-green-500 tabular-nums">{toolCallStats?.success ?? 0}</p>
          </Card>
          <Card className="p-3 sm:p-4">
            <p className="text-[10px] sm:text-xs text-muted-foreground">Failed</p>
            <p className="mt-0.5 text-xl sm:text-2xl font-semibold text-red-500 tabular-nums">{toolCallStats?.failed ?? 0}</p>
          </Card>
          <Card className="p-3 sm:p-4">
            <p className="text-[10px] sm:text-xs text-muted-foreground">Avg Duration</p>
            <p className="mt-0.5 text-xl sm:text-2xl font-semibold tabular-nums">{toolCallStats?.avgDuration ? `${Math.round(toolCallStats.avgDuration)}ms` : "-"}</p>
          </Card>
        </div>

        <div className="space-y-2 sm:space-y-3 rounded-lg border bg-card p-3">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by tool name"
            className="h-8 text-sm"
          />
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            {SOURCE_FILTERS.map((source) => (
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
        </div>

        {/* Mobile: card list */}
        <div className="md:hidden space-y-2">
          {displayedCalls.map((call) => (
            <button
              key={call.id}
              type="button"
              className={cn(
                "w-full rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/30",
                selectedCall?.id === call.id && "border-primary/40"
              )}
              onClick={() => handleSelectCall(call)}
            >
              <div className="flex items-center gap-2">
                {call.success ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                )}
                <span className="font-mono text-sm text-amber-400 truncate">{call.toolName}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {sourceBadge(call.source)}
                {typeof call.durationMs === "number" && (
                  <span className="text-[10px] text-muted-foreground">{call.durationMs}ms</span>
                )}
                <span className="text-[10px] text-muted-foreground ml-auto">{formatRelativeTime(call.startedAt)}</span>
              </div>
            </button>
          ))}
          {displayedCalls.length === 0 && (
            <div className="rounded-lg border bg-card py-10 text-center text-sm text-muted-foreground">
              No tool calls found.
            </div>
          )}
        </div>

        {/* Desktop: table */}
        <div className="hidden md:block rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Tool</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayedCalls.map((call) => (
                <TableRow
                  key={call.id}
                  className={cn("cursor-pointer", selectedCall?.id === call.id && "bg-muted/50")}
                  onClick={() => handleSelectCall(call)}
                >
                  <TableCell>
                    {call.success ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-500" />
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-amber-400">{call.toolName}</TableCell>
                  <TableCell>{sourceBadge(call.source)}</TableCell>
                  <TableCell>{typeof call.durationMs === "number" ? `${call.durationMs}ms` : "-"}</TableCell>
                  <TableCell className="text-muted-foreground">{formatRelativeTime(call.startedAt)}</TableCell>
                </TableRow>
              ))}
              {displayedCalls.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                    No tool calls found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {selectedCall && (
        <div className="hidden lg:block w-[400px] shrink-0 rounded-lg border bg-card p-4">
          <ToolCallDetail call={selectedCall} />
        </div>
      )}

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Tool Call Details</SheetTitle>
          </SheetHeader>
          <div className="mt-4">{selectedCall ? <ToolCallDetail call={selectedCall} /> : null}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
