"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Clock, ThumbsDown, ThumbsUp, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useLuminaStore } from "@/stores/lumina-store";
import type { LuminaInitiative } from "@/lib/lumina/types";
import { cn } from "@/lib/utils";

type InitiativeColumnKey = "proposed" | "approved" | "in_progress" | "completed" | "rejected";

const COLUMNS: Array<{ key: InitiativeColumnKey; title: string; borderClass: string; dotClass: string }> = [
  { key: "proposed", title: "Proposed", borderClass: "border-t-violet-500", dotClass: "bg-violet-500" },
  { key: "approved", title: "Approved", borderClass: "border-t-blue-500", dotClass: "bg-blue-500" },
  { key: "in_progress", title: "In Progress", borderClass: "border-t-amber-500", dotClass: "bg-amber-500" },
  { key: "completed", title: "Completed", borderClass: "border-t-green-500", dotClass: "bg-green-500" },
  { key: "rejected", title: "Rejected", borderClass: "border-t-red-500", dotClass: "bg-red-500" },
];

function formatRelativeTime(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return formatDistanceToNow(date, { addSuffix: true });
}

function priorityBadge(priority: LuminaInitiative["priority"]) {
  const cls =
    priority === "high"
      ? "border-red-500/20 bg-red-500/10 text-red-500"
      : priority === "medium"
        ? "border-amber-500/20 bg-amber-500/10 text-amber-500"
        : "border-zinc-500/20 bg-zinc-500/10 text-zinc-400";
  return (
    <Badge variant="outline" className={cn("text-[10px]", cls)}>
      {priority}
    </Badge>
  );
}

function DetailContent({ initiative }: { initiative: LuminaInitiative }) {
  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="text-lg font-semibold">{initiative.title}</p>
        <p className="mt-1 text-muted-foreground">Status: {initiative.status}</p>
      </div>
      <div>
        <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Description</p>
        <p className="text-muted-foreground">{initiative.description || "-"}</p>
      </div>
      <div>
        <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Rationale</p>
        <p className="text-muted-foreground">{initiative.rationale || "-"}</p>
      </div>
      {initiative.result && (
        <div>
          <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Result</p>
          <pre className="max-h-56 overflow-auto rounded border bg-muted/20 p-2 text-xs whitespace-pre-wrap">{initiative.result}</pre>
        </div>
      )}
    </div>
  );
}

function InitiativeCard({
  initiative,
  showActions,
  isSelected,
  onSelect,
  onAction,
}: {
  initiative: LuminaInitiative;
  showActions: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onAction: (status: "approved" | "rejected" | "deferred") => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "w-full rounded-lg border bg-muted/20 p-3 text-left transition-colors hover:bg-muted/35",
        isSelected && "border-primary/40 bg-muted/30"
      )}
      onClick={onSelect}
    >
      <p className="font-medium text-sm leading-snug">{initiative.title}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {priorityBadge(initiative.priority)}
        {initiative.category ? <Badge variant="outline" className="text-[10px]">{initiative.category}</Badge> : null}
      </div>
      <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{initiative.rationale || "No rationale"}</p>
      <p className="mt-1.5 text-[10px] text-muted-foreground/70">Created {formatRelativeTime(initiative.createdAt)}</p>

      {showActions && (
        <div className="mt-2.5 flex gap-1.5">
          <Button
            type="button"
            size="sm"
            className="h-7 text-xs flex-1"
            onClick={(e) => { e.stopPropagation(); onAction("approved"); }}
          >
            <ThumbsUp className="mr-1 h-3 w-3" />
            Approve
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={(e) => { e.stopPropagation(); onAction("rejected"); }}
          >
            <ThumbsDown className="mr-1 h-3 w-3" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-7 text-xs"
            onClick={(e) => { e.stopPropagation(); onAction("deferred"); }}
          >
            <Clock className="mr-1 h-3 w-3" />
            Defer
          </Button>
        </div>
      )}
    </button>
  );
}

export function LuminaInitiativesTab() {
  const isConnected = useLuminaStore((s) => s.isConnected);
  const initiatives = useLuminaStore((s) => s.initiatives);
  const refreshInitiatives = useLuminaStore((s) => s.refreshInitiatives);
  const updateInitiative = useLuminaStore((s) => s.updateInitiative);

  const [selectedInitiative, setSelectedInitiative] = useState<LuminaInitiative | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expandedColumn, setExpandedColumn] = useState<InitiativeColumnKey | null>("proposed");

  useEffect(() => {
    if (isConnected) {
      void refreshInitiatives();
    }
  }, [isConnected, refreshInitiatives]);

  const grouped = useMemo(() => {
    const initial: Record<InitiativeColumnKey, LuminaInitiative[]> = {
      proposed: [],
      approved: [],
      in_progress: [],
      completed: [],
      rejected: [],
    };

    for (const initiative of initiatives) {
      if (initiative.status === "deferred" || initiative.status === "failed") {
        initial.rejected.push(initiative);
        continue;
      }
      if (initiative.status in initial) {
        initial[initiative.status as InitiativeColumnKey].push(initiative);
      }
    }
    return initial;
  }, [initiatives]);

  const handleAction = async (id: string, status: "approved" | "rejected" | "deferred") => {
    await updateInitiative(id, status);
    await refreshInitiatives();
  };

  const handleSelect = (initiative: LuminaInitiative) => {
    setSelectedInitiative(initiative);
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setMobileOpen(true);
    }
  };

  return (
    <div className="flex gap-4">
      {/* Main content */}
      <div className="min-w-0 flex-1">
        {/* Mobile: accordion-style grouped list */}
        <div className="md:hidden space-y-2">
          {COLUMNS.map((column) => {
            const count = grouped[column.key].length;
            const isExpanded = expandedColumn === column.key;
            return (
              <div key={column.key} className={cn("rounded-lg border border-t-2 bg-card overflow-hidden", column.borderClass)}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between p-3"
                  onClick={() => setExpandedColumn(isExpanded ? null : column.key)}
                >
                  <div className="flex items-center gap-2">
                    <span className={cn("h-2 w-2 rounded-full", column.dotClass)} />
                    <span className="text-sm font-medium">{column.title}</span>
                    <Badge variant="secondary" className="text-[10px] h-5">{count}</Badge>
                  </div>
                  <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", isExpanded && "rotate-180")} />
                </button>
                {isExpanded && (
                  <div className="px-3 pb-3 space-y-2">
                    {count === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">No initiatives</p>
                    ) : (
                      grouped[column.key].map((initiative) => (
                        <InitiativeCard
                          key={initiative.id}
                          initiative={initiative}
                          showActions={column.key === "proposed"}
                          isSelected={selectedInitiative?.id === initiative.id}
                          onSelect={() => handleSelect(initiative)}
                          onAction={(status) => void handleAction(initiative.id, status)}
                        />
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Desktop: kanban columns */}
        <div className="hidden md:block">
          <ScrollArea className="w-full">
            <div className="flex gap-3 pb-2 min-w-max">
              {COLUMNS.map((column) => (
                <div
                  key={column.key}
                  className={cn("w-[240px] lg:w-[260px] xl:w-[280px] rounded-lg border border-t-4 bg-card p-3 shrink-0", column.borderClass)}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-semibold">{column.title}</p>
                    <Badge variant="secondary" className="text-[10px] h-5">{grouped[column.key].length}</Badge>
                  </div>

                  <div className="space-y-2">
                    {grouped[column.key].map((initiative) => (
                      <InitiativeCard
                        key={initiative.id}
                        initiative={initiative}
                        showActions={column.key === "proposed"}
                        isSelected={selectedInitiative?.id === initiative.id}
                        onSelect={() => handleSelect(initiative)}
                        onAction={(status) => void handleAction(initiative.id, status)}
                      />
                    ))}
                    {grouped[column.key].length === 0 && (
                      <div className="rounded border border-dashed p-4 text-center text-xs text-muted-foreground">
                        No initiatives
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Desktop detail panel */}
      {selectedInitiative && (
        <div className="hidden lg:block w-[360px] shrink-0 rounded-lg border bg-card p-4">
          <DetailContent initiative={selectedInitiative} />
        </div>
      )}

      {/* Mobile detail sheet */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Initiative Details</SheetTitle>
          </SheetHeader>
          <div className="mt-4">{selectedInitiative ? <DetailContent initiative={selectedInitiative} /> : null}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
