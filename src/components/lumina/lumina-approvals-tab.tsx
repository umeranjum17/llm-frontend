"use client";

import { useEffect } from "react";
import { formatDistanceToNow } from "date-fns";
import { CheckCircle2, ShieldCheck, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLuminaStore } from "@/stores/lumina-store";

function formatTimestamp(ms: number) {
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return "-";
  return formatDistanceToNow(date, { addSuffix: true });
}

function truncateArgs(args: Record<string, unknown>, maxLen = 120): string {
  const str = JSON.stringify(args);
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + "...";
}

export function LuminaApprovalsTab() {
  const isConnected = useLuminaStore((s) => s.isConnected);
  const approvals = useLuminaStore((s) => s.approvals);
  const refreshApprovals = useLuminaStore((s) => s.refreshApprovals);
  const respondToApproval = useLuminaStore((s) => s.respondToApproval);

  useEffect(() => {
    if (isConnected) {
      void refreshApprovals();
    }
  }, [isConnected, refreshApprovals]);

  if (approvals.length === 0) {
    return (
      <div className="rounded-lg border bg-card py-16 text-center">
        <ShieldCheck className="mx-auto h-8 w-8 text-muted-foreground/50 mb-3" />
        <p className="text-sm text-muted-foreground">No pending approvals</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {approvals.map((approval) => (
        <div
          key={approval.id}
          className="rounded-lg border bg-card p-4 space-y-3"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-sm">{approval.toolName}</p>
                <Badge variant="outline" className="text-[10px]">
                  {approval.source}
                </Badge>
              </div>
              {approval.reason && (
                <p className="text-sm text-muted-foreground">{approval.reason}</p>
              )}
              <p className="text-xs text-muted-foreground font-mono break-all">
                {truncateArgs(approval.args)}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-muted-foreground/70">
              {formatTimestamp(approval.createdAt)}
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="destructive"
                className="h-7 text-xs"
                onClick={() => void respondToApproval(approval.id, false)}
              >
                <X className="mr-1 h-3 w-3" />
                Deny
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-7 text-xs"
                onClick={() => void respondToApproval(approval.id, true)}
              >
                <CheckCircle2 className="mr-1 h-3 w-3" />
                Approve
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
