"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, ShieldAlert, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useLuminaStore } from "@/stores/lumina-store";
import { cn } from "@/lib/utils";

const DEFAULT_APPROVAL_TIMEOUT_MS = 5 * 60 * 1000;

export interface InlineApprovalData {
  id: string;
  toolName: string;
  toolLabel?: string;
  args: Record<string, unknown>;
  source?: string;
  taskId: string;
  reason?: string;
  createdAt: number;
  timeoutMs?: number;
}

function formatRemaining(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const mins = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return `${mins}:${String(rem).padStart(2, "0")}`;
}

function stringifyArgs(args: Record<string, unknown>): string {
  try {
    const json = JSON.stringify(args, null, 2);
    if (json.length <= 600) return json;
    return `${json.slice(0, 600)}\n...`;
  } catch {
    return "[unable to serialize args]";
  }
}

export function InlineApprovalCard({
  approval,
  onResolved,
}: {
  approval: InlineApprovalData;
  onResolved?: (approvalId: string) => void;
}) {
  const respondToApproval = useLuminaStore((s) => s.respondToApproval);
  const [now, setNow] = useState(() => Date.now());
  const [submitting, setSubmitting] = useState<"approve" | "deny" | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const timeoutMs = approval.timeoutMs ?? DEFAULT_APPROVAL_TIMEOUT_MS;
  const deadline = approval.createdAt + timeoutMs;
  const remainingMs = Math.max(0, deadline - now);
  const elapsedPercent = Math.min(100, Math.max(0, ((timeoutMs - remainingMs) / timeoutMs) * 100));
  const urgency = useMemo(() => {
    if (remainingMs <= 60_000) return "critical";
    if (remainingMs <= 180_000) return "warning";
    return "normal";
  }, [remainingMs]);
  const argsPreview = useMemo(() => stringifyArgs(approval.args), [approval.args]);

  const handleRespond = async (approved: boolean) => {
    setSubmitting(approved ? "approve" : "deny");
    try {
      await respondToApproval(approval.id, approved);
      onResolved?.(approval.id);
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div
      className={cn(
        "mt-2 rounded-md border p-3",
        urgency === "normal" && "border-amber-300/60 bg-amber-50/40 dark:border-amber-900/40 dark:bg-amber-950/20",
        urgency === "warning" && "border-orange-400/70 bg-orange-50/50 dark:border-orange-900/50 dark:bg-orange-950/20",
        urgency === "critical" && "border-red-400/80 bg-red-50/60 dark:border-red-900/60 dark:bg-red-950/30",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <ShieldAlert className={cn("h-4 w-4 shrink-0", urgency === "critical" ? "text-red-500" : "text-amber-500")} />
            <p className="text-sm font-semibold truncate">{approval.toolLabel || approval.toolName}</p>
            {approval.toolLabel && (
              <Badge variant="outline" className="text-[10px]">
                {approval.toolName}
              </Badge>
            )}
            {approval.source && (
              <Badge variant="outline" className="text-[10px]">
                {approval.source}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground whitespace-pre-wrap">
            {approval.reason || "This action requires approval before execution can continue."}
          </p>
        </div>
        <Badge
          variant="outline"
          className={cn(
            "shrink-0 text-[10px] tabular-nums",
            urgency === "warning" && "border-orange-400/70 text-orange-600 dark:text-orange-300",
            urgency === "critical" && "border-red-500/70 text-red-600 dark:text-red-300",
            urgency === "critical" && remainingMs > 0 && "animate-pulse",
          )}
        >
          <Clock3 className="mr-1 h-3 w-3" />
          {formatRemaining(remainingMs)}
        </Badge>
      </div>

      <div className="mt-2">
        <Progress value={elapsedPercent} className="h-1.5 bg-background/60" />
      </div>

      <details className="mt-2 group">
        <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
          View arguments
        </summary>
        <pre className="mt-2 max-h-48 overflow-auto rounded border bg-background/70 p-2 text-[11px] text-muted-foreground">
          {argsPreview}
        </pre>
      </details>

      <div className="mt-3 flex justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="destructive"
          className="h-7 text-xs"
          disabled={submitting !== null || remainingMs <= 0}
          onClick={() => void handleRespond(false)}
        >
          <X className="mr-1 h-3 w-3" />
          {submitting === "deny" ? "Denying..." : "Deny"}
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-7 text-xs"
          disabled={submitting !== null || remainingMs <= 0}
          onClick={() => void handleRespond(true)}
        >
          <CheckCircle2 className="mr-1 h-3 w-3" />
          {submitting === "approve" ? "Approving..." : "Approve"}
        </Button>
      </div>
    </div>
  );
}
