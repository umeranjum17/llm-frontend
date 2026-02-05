"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  Bot,
  Calendar,
  Check,
  Clock,
  ExternalLink,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Send,
  X,
  XCircle,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useClawStore } from "@/stores/claw-store";
import { useClawActivityStore, type ClawLiveEvent } from "@/stores/claw-activity-store";
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

function formatEventType(type: string): string {
  const typeMap: Record<string, string> = {
    "brain:started": "Processing started",
    "brain:tool_call": "Tool call",
    "brain:tool_result": "Tool result",
    "brain:completed": "Processing complete",
    "brain:error": "Error occurred",
    "heartbeat:started": "Heartbeat",
    "heartbeat:completed": "Heartbeat done",
    "schedule:executing": "Schedule running",
    "schedule:completed": "Schedule done",
    "reflection:started": "Reflecting",
    "reflection:completed": "Reflection done",
    "ambient:started": "Ambient thinking",
    "ambient:thought": "Thought",
    "ambient:completed": "Ambient done",
    "pipeline:started": "Pipeline started",
    "pipeline:findings": "Findings",
    "pipeline:completed": "Pipeline done",
    "pipeline:action": "Action taken",
    "briefing:started": "Briefing started",
    "briefing:generated": "Briefing ready",
    "briefing:delivered": "Briefing delivered",
    "monitor:checked": "Monitor checked",
    "monitor:alert": "Alert",
  };
  return typeMap[type] || type.replace(/:/g, " ");
}

function getEventIcon(type: string) {
  if (type.includes("error")) return <XCircle className="h-3 w-3 text-red-500" />;
  if (type.includes("completed") || type.includes("done")) return <Check className="h-3 w-3 text-emerald-500" />;
  if (type.includes("started") || type.includes("executing")) return <Play className="h-3 w-3 text-blue-500" />;
  if (type.includes("alert")) return <AlertCircle className="h-3 w-3 text-amber-500" />;
  return <Clock className="h-3 w-3 text-muted-foreground" />;
}

function ActivityItem({ event, isNew }: { event: ClawLiveEvent; isNew?: boolean }) {
  return (
    <div className={cn(
      "flex items-start gap-2 py-1.5 rounded-md px-1 -mx-1",
      "hover:bg-muted/50 transition-colors",
      isNew && "motion-safe:animate-slide-in-item"
    )}>
      <span className="mt-0.5 shrink-0">{getEventIcon(event.type)}</span>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-foreground truncate">{formatEventType(event.type)}</div>
        {event.data?.message && (
          <div className="text-[11px] text-muted-foreground truncate">
            {event.data.message}
          </div>
        )}
      </div>
      <span className="text-[10px] text-muted-foreground/70 shrink-0 tabular-nums">
        {formatRelativeTime(event.timestamp)}
      </span>
    </div>
  );
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
      <div className="flex items-center gap-1.5 mt-2.5">
        <Button
          size="sm"
          variant="default"
          className="h-7 text-[11px] px-2.5 gap-1"
          onClick={() => handleAction("approve", onApprove)}
          disabled={loading !== null}
        >
          {loading === "approve" ? <Loader2 className="h-3 w-3 motion-safe:animate-spin" /> : <Check className="h-3 w-3" />}
          Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[11px] px-2.5 gap-1"
          onClick={() => handleAction("reject", onReject)}
          disabled={loading !== null}
        >
          {loading === "reject" ? <Loader2 className="h-3 w-3 motion-safe:animate-spin" /> : <X className="h-3 w-3" />}
          Reject
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-[11px] px-2.5 gap-1 text-muted-foreground"
          onClick={() => handleAction("defer", onDefer)}
          disabled={loading !== null}
        >
          {loading === "defer" ? <Loader2 className="h-3 w-3 motion-safe:animate-spin" /> : <Clock className="h-3 w-3" />}
          Later
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
  const { isConnected, isConnecting, error, tasks, schedules, initiatives, createTask, updateInitiative, connect } = useClawStore();
  const liveEvents = useClawActivityStore((s) => s.liveEvents);
  const isAutonomousRunning = useClawActivityStore((s) => s.isAutonomousRunning);

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
  const pendingTasks = tasks.filter((t) => t.status === "pending").length;
  const proposedInitiatives = initiatives.filter((i) => i.status === "proposed");

  // Find next schedule
  const nextSchedule = schedules
    .filter((s) => s.enabled && s.nextRun)
    .sort((a, b) => new Date(a.nextRun!).getTime() - new Date(b.nextRun!).getTime())[0];

  // Get last 5 events
  const recentEvents = liveEvents.slice(0, 5);

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
          <div className="grid grid-cols-3 gap-2 mt-4">
            <div className="h-14 bg-muted/40 rounded-lg" />
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

  // Connected state - full dashboard
  return (
    <div>
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/50">
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
            <Button asChild size="icon" variant="ghost" className="h-7 w-7 hover:bg-muted" title="Open Dashboard">
              <Link href="/claw">
                <ExternalLink className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Quick Task Input (collapsible) */}
      {showTaskInput && (
        <div className="px-4 py-3 border-b border-border/50 bg-muted/30 motion-safe:animate-slide-in-item">
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
      <div className="px-4 py-3 grid grid-cols-3 gap-2 border-b border-border/50">
        <StatCard value={runningTasks} label="Running" highlight={runningTasks > 0} />
        <StatCard value={pendingTasks} label="Pending" />
        <StatCard
          value={nextSchedule ? formatRelativeTime(nextSchedule.nextRun!) : "—"}
          label="Next Run"
        />
      </div>

      {/* Attention Items (Proposed Initiatives) */}
      {proposedInitiatives.length > 0 && (
        <div className="px-4 py-3 border-b border-border/50 bg-amber-500/5">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-4 w-4 text-amber-500" />
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">Needs Attention</span>
            <Badge variant="secondary" className="text-[10px] h-5 px-1.5 ml-auto font-medium">
              {proposedInitiatives.length}
            </Badge>
          </div>
          <div className="max-h-44 overflow-y-auto">
            {proposedInitiatives.slice(0, 3).map((initiative) => (
              <InitiativeItem
                key={initiative.id}
                initiative={initiative}
                onApprove={() => updateInitiative(initiative.id, "approved")}
                onReject={() => updateInitiative(initiative.id, "rejected")}
                onDefer={() => updateInitiative(initiative.id, "deferred")}
              />
            ))}
            {proposedInitiatives.length > 3 && (
              <Link
                href="/claw?tab=initiatives"
                className="flex items-center justify-center gap-1 py-2.5 text-[11px] text-amber-600 hover:text-amber-700 font-medium transition-colors"
              >
                View {proposedInitiatives.length - 3} more
                <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Activity Preview */}
      <div className="px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-foreground">Recent Activity</span>
          {recentEvents.length > 0 && (
            <Link
              href="/claw?tab=activity"
              className="text-[10px] text-muted-foreground hover:text-foreground font-medium transition-colors"
            >
              View all
            </Link>
          )}
        </div>
        {recentEvents.length > 0 ? (
          <div className="space-y-0.5" aria-live="polite" aria-label="Recent Claw activity">
            {recentEvents.map((event, idx) => (
              <ActivityItem key={event.id} event={event} isNew={idx === 0} />
            ))}
          </div>
        ) : (
          <div className="py-6 text-center">
            <Clock className="h-6 w-6 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">
              Claw is ready. Create a task to see activity.
            </p>
            <Button
              size="sm"
              variant="ghost"
              className="mt-2 text-xs h-7"
              onClick={() => setShowTaskInput(true)}
            >
              <Plus className="h-3 w-3 mr-1" />
              Add a task
            </Button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-border/50 flex items-center justify-between bg-muted/20">
        <Link
          href="/settings?tab=claw"
          className="text-[11px] text-muted-foreground hover:text-foreground font-medium transition-colors"
        >
          Settings
        </Link>
        <Link
          href="/claw"
          className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 font-medium transition-colors"
        >
          Dashboard <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
