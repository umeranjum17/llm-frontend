"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useClawStore } from "@/stores/claw-store";

const STATUS_STYLES: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
  proposed: { variant: "outline", label: "Proposed" },
  approved: { variant: "default", label: "Approved" },
  rejected: { variant: "destructive", label: "Rejected" },
  deferred: { variant: "secondary", label: "Deferred" },
  in_progress: { variant: "default", label: "In Progress" },
  completed: { variant: "default", label: "Completed" },
  failed: { variant: "destructive", label: "Failed" },
};

function formatRelativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function ClawInitiativesPanel() {
  const initiatives = useClawStore((s) => s.initiatives);
  const refreshInitiatives = useClawStore((s) => s.refreshInitiatives);
  const updateInitiative = useClawStore((s) => s.updateInitiative);
  const isConnected = useClawStore((s) => s.isConnected);

  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (isConnected) refreshInitiatives();
  }, [isConnected, refreshInitiatives]);

  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b px-4 py-3">
        <h3 className="text-sm font-medium">Initiatives</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Ideas proposed by Claw during reflection
        </p>
      </div>
      <div className="p-2">
        {initiatives.length === 0 ? (
          <p className="px-2 py-4 text-center text-sm text-muted-foreground">
            No initiatives yet.
          </p>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-1">
            {initiatives.map((ini) => {
              const style = STATUS_STYLES[ini.status] ?? { variant: "secondary" as const, label: ini.status };
              const isExpanded = expandedId === ini.id;
              return (
                <div
                  key={ini.id}
                  className="rounded-md border bg-card min-w-[260px] max-w-[320px] shrink-0"
                >
                  <button
                    type="button"
                    className="w-full text-left p-3 flex items-start gap-2 hover:bg-muted/30 transition-colors"
                    onClick={() => setExpandedId(isExpanded ? null : ini.id)}
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                    )}
                    <div className="flex-1 space-y-1 min-w-0">
                      <p className="text-sm font-medium leading-tight">{ini.title}</p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant={style.variant} className="text-[10px] px-1.5 py-0">
                          {style.label}
                        </Badge>
                        {ini.priority !== "medium" && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0">{ini.priority}</Badge>
                        )}
                        <span className="text-[10px] text-muted-foreground">
                          {formatRelativeTime(ini.createdAt)}
                        </span>
                      </div>
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="border-t px-3 pb-3 space-y-2">
                      <p className="text-sm pt-2">{ini.description}</p>
                      <p className="text-xs text-muted-foreground">
                        <strong>Rationale:</strong> {ini.rationale}
                      </p>
                      {ini.result && (
                        <div className="rounded border bg-muted/30 p-2">
                          <pre className="text-xs whitespace-pre-wrap break-words text-muted-foreground max-h-[150px] overflow-y-auto">
                            {ini.result}
                          </pre>
                        </div>
                      )}
                      {ini.status === "proposed" && (
                        <div className="flex gap-2 pt-1">
                          <Button size="sm" onClick={() => updateInitiative(ini.id, "approved")}>
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Approve
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => updateInitiative(ini.id, "deferred")}>
                            Defer
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => updateInitiative(ini.id, "rejected")}>
                            <XCircle className="h-3 w-3 mr-1" />
                            Reject
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
