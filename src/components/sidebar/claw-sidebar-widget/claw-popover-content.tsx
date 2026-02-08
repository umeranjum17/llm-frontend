"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  Bot,
  Check,
  Clock,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  X,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useLuminaStore } from "@/stores/lumina-store";
import { useLuminaActivityStore } from "@/stores/lumina-activity-store";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function formatRelativeTime(timestamp: number | string): string {
  const date = typeof timestamp === "string" ? new Date(timestamp) : new Date(timestamp);
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 60 * 1000) return "Just now";
  if (diffMs < 60 * 60 * 1000) return `${Math.floor(diffMs / 60000)}m ago`;
  if (diffMs < 24 * 60 * 60 * 1000) return `${Math.floor(diffMs / 3600000)}h ago`;
  return `${Math.floor(diffMs / 86400000)}d ago`;
}

function InitiativeItem({
  initiative,
  onApprove,
  onReject,
  onDefer,
}: {
  initiative: { id: string; title: string; description: string; priority: string };
  onApprove: () => void;
  onReject: () => void;
  onDefer: () => void;
}) {
  const [loading, setLoading] = useState<"approve" | "reject" | "defer" | null>(null);

  const handleAction = async (action: "approve" | "reject" | "defer", fn: () => void) => {
    setLoading(action);
    try {
      await fn();
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="py-2.5 border-b border-border/30 last:border-0 motion-safe:animate-slide-in-item">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-foreground truncate">{initiative.title}</div>
          <div className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">
            {initiative.description}
          </div>
        </div>
        <Badge
          variant="outline"
          className={cn(
            "text-[10px] shrink-0 font-medium",
            initiative.priority === "high" && "border-red-500/50 text-red-600 bg-red-500/5",
            initiative.priority === "medium" && "border-amber-500/50 text-amber-600 bg-amber-500/5",
            initiative.priority === "low" && "border-muted-foreground/30 text-muted-foreground"
          )}
        >
          {initiative.priority}
        </Badge>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="default"
          className="h-8 min-w-[8rem] flex-1 text-xs px-3 gap-1.5"
          onClick={() => handleAction("approve", onApprove)}
          disabled={loading !== null}
        >
          {loading === "approve" ? <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Approve
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="h-8 min-w-[6.5rem] text-xs px-3 gap-1.5"
          onClick={() => handleAction("defer", onDefer)}
          disabled={loading !== null}
        >
          {loading === "defer" ? <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" /> : <Clock className="h-3.5 w-3.5" />}
          Defer
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-8 min-w-[6.5rem] text-xs px-3 gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
          onClick={() => handleAction("reject", onReject)}
          disabled={loading !== null}
        >
          {loading === "reject" ? <Loader2 className="h-3.5 w-3.5 motion-safe:animate-spin" /> : <X className="h-3.5 w-3.5" />}
          Reject
        </Button>
      </div>
    </div>
  );
}

function StatCard({ value, label, highlight }: { value: string | number; label: string; highlight?: boolean }) {
  return (
    <div className={cn(
      "text-center rounded-lg py-2.5 px-2 transition-colors",
      highlight ? "bg-violet-500/10" : "bg-muted/40"
    )}>
      <div className={cn(
        "text-lg font-semibold tabular-nums",
        highlight ? "text-violet-600 dark:text-violet-400" : "text-foreground"
      )}>
        {value}
      </div>
      <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
        {label}
      </div>
    </div>
  );
}

function SkeletonLine({ width }: { width: string }) {
  return <div className={cn("h-3 bg-muted/60 rounded motion-safe:animate-pulse", width)} />;
}

export function ClawPopoverContent() {
  const router = useRouter();
  const isConnected = useLuminaStore((s) => s.isConnected);
  const isConnecting = useLuminaStore((s) => s.isConnecting);
  const error = useLuminaStore((s) => s.error);
  const tasks = useLuminaStore((s) => s.tasks);
  const schedules = useLuminaStore((s) => s.schedules);
  const initiatives = useLuminaStore((s) => s.initiatives);
  const questions = useLuminaStore((s) => s.questions);
  const createTask = useLuminaStore((s) => s.createTask);
  const updateInitiative = useLuminaStore((s) => s.updateInitiative);
  const connect = useLuminaStore((s) => s.connect);
  const isAutonomousRunning = useLuminaActivityStore((s) => s.isAutonomousRunning);

  const [taskInput, setTaskInput] = useState("");
  const [sending, setSending] = useState(false);
  const [taskCreated, setTaskCreated] = useState(false);
  const [showTaskInput, setShowTaskInput] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when shown
  useEffect(() => {
    if (showTaskInput && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showTaskInput]);

  // Stats
  const runningTasks = tasks.filter((t) => t.status === "running").length;
  const activeSchedules = schedules.filter((s) => s.enabled).length;
  const proposedInitiatives = initiatives.filter((i) => i.status === "proposed");

  const handleCreateTask = async () => {
    const trimmed = taskInput.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      await createTask(trimmed);
      setTaskInput("");
      setTaskCreated(true);
      setTimeout(() => {
        setTaskCreated(false);
        setShowTaskInput(false);
      }, 1500);
    } catch (e) {
      toast.error("Failed to create task");
    } finally {
      setSending(false);
    }
  };

  const handleRetry = async () => {
    setRetrying(true);
    try {
      const { useSettingsStore } = await import("@/stores/settings-store");
      const { clawUrl, clawSecret } = useSettingsStore.getState();
      if (clawUrl && clawSecret) {
        await connect(clawUrl, clawSecret);
      }
    } finally {
      setRetrying(false);
    }
  };

  // Error state
  if (error && !isConnecting) {
    return (
      <div className="p-4">
        <div className="flex items-center gap-2 text-red-500 mb-3">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm font-semibold">Connection Error</span>
        </div>
        <p className="text-xs text-muted-foreground mb-4 leading-relaxed">{error}</p>
        <Button
          size="sm"
          variant="outline"
          className="w-full h-9"
          onClick={handleRetry}
          disabled={retrying}
        >
          {retrying ? (
            <Loader2 className="h-3.5 w-3.5 mr-2 motion-safe:animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5 mr-2" />
          )}
          Retry Connection
        </Button>
        <div className="mt-4 pt-3 border-t border-border/50">
          <Link
            href="/settings?tab=claw"
            className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            Claw settings <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      </div>
    );
  }

  // Connecting state with skeleton
  if (isConnecting) {
    return (
      <div className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <Loader2 className="h-4 w-4 motion-safe:animate-spin text-blue-500" />
          <span className="text-sm font-medium">Connecting to Claw...</span>
        </div>
        <div className="space-y-3">
          <SkeletonLine width="w-3/4" />
          <SkeletonLine width="w-1/2" />
          <div className="grid grid-cols-2 gap-2 mt-4">
            <div className="h-14 bg-muted/40 rounded-lg" />
            <div className="h-14 bg-muted/40 rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  // Disconnected state (but enabled)
  if (!isConnected) {
    return (
      <div className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-3">
          <Bot className="h-4 w-4" />
          <span className="text-sm font-medium">Claw Disconnected</span>
        </div>
        <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
          Claw is enabled but not connected. Check your server settings.
        </p>
        <Button asChild size="sm" variant="outline" className="w-full h-9">
          <Link href="/settings?tab=claw">
            Configure Connection
            <ArrowRight className="h-3.5 w-3.5 ml-2" />
          </Link>
        </Button>
      </div>
    );
  }

  // Connected state - simplified dashboard
  return (
    <div className="flex min-h-0 max-h-[min(85vh,42rem)] flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 border-b border-border/50 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <Bot className="h-5 w-5 text-violet-500" />
              {isAutonomousRunning && (
                <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-violet-500 motion-safe:animate-pulse" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground">Claw Agent</span>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] font-medium h-5",
                    isAutonomousRunning
                      ? "border-violet-500/50 text-violet-600 bg-violet-500/10"
                      : "border-emerald-500/50 text-emerald-600 bg-emerald-500/10"
                  )}
                >
                  {isAutonomousRunning ? "Active" : "Ready"}
                </Badge>
              </div>
              <span className="text-[10px] text-muted-foreground">Autonomous workflow assistant</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 hover:bg-muted"
              onClick={() => setShowTaskInput(!showTaskInput)}
              aria-pressed={showTaskInput}
              aria-label={showTaskInput ? "Close task input" : "Add new task"}
            >
              <Plus className={cn(
                "h-4 w-4 transition-transform duration-200",
                showTaskInput && "rotate-45"
              )} />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 hover:bg-muted"
              title="Open Dashboard"
              onClick={() => router.push("/claw")}
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Quick Task Input (collapsible) */}
      {showTaskInput && (
        <div className="shrink-0 border-b border-border/50 bg-muted/30 px-4 py-3 motion-safe:animate-slide-in-item">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={taskInput}
              onChange={(e) => setTaskInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateTask()}
              placeholder="What should Claw do?"
              className="h-9 text-sm"
              disabled={sending || taskCreated}
            />
            <Button
              size="icon"
              variant="default"
              className={cn(
                "h-9 w-9 shrink-0 transition-colors",
                taskCreated && "bg-emerald-500 hover:bg-emerald-500"
              )}
              disabled={(!taskInput.trim() || sending) && !taskCreated}
              onClick={handleCreateTask}
            >
              {taskCreated ? (
                <Check className="h-4 w-4 text-white" />
              ) : sending ? (
                <Loader2 className="h-4 w-4 motion-safe:animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Quick Stats */}
      <div className="shrink-0 border-b border-border/50 px-4 py-3">
        <div className="grid grid-cols-3 gap-2">
        <StatCard value={runningTasks} label="Running" highlight={runningTasks > 0} />
        <StatCard value={activeSchedules} label="Schedules" />
        <StatCard value={questions.length} label="Needs Input" highlight={questions.length > 0} />
        </div>
      </div>

      {/* Attention Items (Questions + Proposed Initiatives) */}
      {(proposedInitiatives.length > 0 || questions.length > 0) && (
        <div className="flex min-h-0 flex-1 flex-col border-b border-border/50 bg-amber-500/5 px-4 py-3">
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-500" />
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">Needs Attention</span>
            <Badge variant="secondary" className="text-[10px] h-5 px-1.5 ml-auto font-medium">
              {proposedInitiatives.length + questions.length}
            </Badge>
          </div>
          <div className="min-h-0 max-h-72 overflow-x-hidden overflow-y-auto pr-1 scrollbar-thin">
            {/* Pending Questions (higher priority) */}
            {questions.slice(0, 2).map((q) => (
              <div key={q.id} className="py-2 border-b border-border/30 last:border-0">
                <div className="text-xs font-medium text-foreground break-words">{q.question}</div>
                <Link href="/claw" className="text-[10px] text-amber-600 hover:underline mt-1 inline-block">
                  Answer on dashboard
                </Link>
              </div>
            ))}
            {/* Initiatives */}
            {proposedInitiatives.slice(0, 3).map((initiative) => (
              <InitiativeItem
                key={initiative.id}
                initiative={initiative}
                onApprove={() => updateInitiative(initiative.id, "approved")}
                onReject={() => updateInitiative(initiative.id, "rejected")}
                onDefer={() => updateInitiative(initiative.id, "deferred")}
              />
            ))}
            {(proposedInitiatives.length > 3 || questions.length > 2) && (
              <Link
                href="/claw"
                className="flex items-center justify-center gap-1 py-2.5 text-[11px] text-amber-600 hover:text-amber-700 font-medium transition-colors"
              >
                View all on dashboard
                <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="shrink-0 bg-muted/20 px-4 py-2.5 flex items-center justify-between">
        <Link
          href="/settings?tab=claw"
          className="text-[11px] text-muted-foreground hover:text-foreground font-medium transition-colors"
        >
          Settings
        </Link>
        <button
          type="button"
          onClick={() => router.push("/claw")}
          className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 font-medium transition-colors"
        >
          Dashboard <ExternalLink className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
