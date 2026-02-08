"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, ChevronDown, ChevronRight, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLuminaStore } from "@/stores/lumina-store";

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

export function LuminaInitiativesPanel() {
  const initiatives = useLuminaStore((s) => s.initiatives);
  const refreshInitiatives = useLuminaStore((s) => s.refreshInitiatives);
  const updateInitiative = useLuminaStore((s) => s.updateInitiative);
  const isConnected = useLuminaStore((s) => s.isConnected);

  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (isConnected) refreshInitiatives();
  }, [isConnected, refreshInitiatives]);

  if (initiatives.length === 0) {
    return (
      <div className="rounded-lg border bg-card">
        <div className="border-b px-4 py-3">
          <h3 className="text-sm font-medium">Initiatives</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Ideas proposed by Lumina during reflection
          </p>
        </div>
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          No initiatives yet.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="border-b px-4 py-3">
        <h3 className="text-sm font-medium">Initiatives</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Ideas proposed by Lumina during reflection
        </p>
      </div>
      <div className="divide-y divide-border">
        {initiatives.map((ini) => {
          const style = STATUS_STYLES[ini.status] ?? { variant: "secondary" as const, label: ini.status };
          const isExpanded = expandedId === ini.id;
          return (
            <div key={ini.id} className="overflow-hidden">
              <button
                type="button"
                className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-muted/30 transition-colors"
                onClick={() => setExpandedId(isExpanded ? null : ini.id)}
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-snug">{ini.title}</p>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <Badge variant={style.variant} className="text-[10px] px-1.5 py-0">
                      {style.label}
                    </Badge>
                    {ini.priority !== "medium" && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">{ini.priority}</Badge>
                    )}
                    <span className="text-[10px] text-muted-foreground">
                      {formatRelativeTime(ini.createdAt)}
                    </span>
                  </div>
                </div>
              </button>
              {isExpanded && (
                <div className="px-4 pb-4 pt-0 pl-11 space-y-3">
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {ini.description}
                  </p>
                  {ini.rationale && (
                    <p className="text-xs text-muted-foreground/80 italic">
                      {ini.rationale}
                    </p>
                  )}
                  {ini.result && (
                    <div className="rounded border bg-muted/30 p-2 overflow-hidden">
                      <pre className="text-xs whitespace-pre-wrap break-words text-muted-foreground max-h-[100px] overflow-y-auto">
                        {ini.result}
                      </pre>
                    </div>
                  )}
                  {ini.status === "proposed" && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        size="sm"
                        className="h-8 text-xs flex-1 min-w-[80px]"
                        onClick={() => updateInitiative(ini.id, "approved")}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="h-8 text-xs"
                        onClick={() => updateInitiative(ini.id, "deferred")}
                      >
                        <Clock className="h-3.5 w-3.5 mr-1.5" />
                        Defer
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                        onClick={() => updateInitiative(ini.id, "rejected")}
                      >
                        <XCircle className="h-3.5 w-3.5 mr-1.5" />
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
    </div>
  );
}
