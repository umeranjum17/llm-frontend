"use client";

import { useState } from "react";
import {
  ListTodo,
  Calendar,
  Eye,
  DollarSign,
  Loader2,
  Send,
  FolderOpen,
  GitBranch,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ClawEmergencyStop } from "@/components/claw/claw-emergency-stop";
import { useClawStore } from "@/stores/claw-store";
import { useClawActivityStore } from "@/stores/claw-activity-store";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function StatPill({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof ListTodo;
  label: string;
  value: string | number;
  accent: string;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-full bg-muted/50 px-3 py-1 text-xs">
      <Icon className={cn("h-3 w-3", accent)} />
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

export function ClawSystemOverview() {
  const isConnected = useClawStore((s) => s.isConnected);
  const status = useClawStore((s) => s.status);
  const tasks = useClawStore((s) => s.tasks);
  const schedules = useClawStore((s) => s.schedules);
  const monitors = useClawStore((s) => s.monitors);
  const cost = useClawStore((s) => s.cost);
  const openProjects = useClawStore((s) => s.openProjects);
  const focusedProject = useClawStore((s) => s.focusedProject);
  const focusProjectAction = useClawStore((s) => s.focusProject);
  const createTask = useClawStore((s) => s.createTask);
  const currentTask = useClawActivityStore((s) => s.currentTask);
  const isAutonomousRunning = useClawActivityStore(
    (s) => s.isAutonomousRunning
  );

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const running = tasks.filter((t) => t.status === "running").length;
  const activeSchedules = schedules.filter((s) => s.enabled).length;
  const activeMonitors = monitors.filter((m) => m.enabled).length;
  const budgetText =
    cost && cost.budgetUsd > 0
      ? `$${cost.totalUsd.toFixed(2)}/$${cost.budgetUsd.toFixed(0)}`
      : cost
        ? `$${cost.totalUsd.toFixed(2)}`
        : null;
  const budgetPct =
    cost && cost.budgetUsd > 0
      ? (cost.totalUsd / cost.budgetUsd) * 100
      : 0;

  let statusText = "Disconnected";
  if (isConnected) {
    if (currentTask?.status === "running") {
      statusText = `Working on: ${currentTask.title}`;
    } else if (isAutonomousRunning) {
      statusText = "Running autonomous task...";
    } else {
      statusText = "Idle";
    }
  }

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      await createTask(trimmed);
      setInput("");
    } catch {
      toast.error("Failed to send instruction");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-lg border bg-card">
      {/* Header row: status + emergency stop */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={cn(
              "h-2 w-2 rounded-full shrink-0",
              isConnected ? "bg-emerald-500" : "bg-red-500"
            )}
          />
          <span className="text-sm font-medium truncate">{statusText}</span>
          {currentTask?.status === "running" && (
            <Loader2 className="h-3 w-3 animate-spin text-blue-500 shrink-0" />
          )}
          {isConnected && status?.uptime != null && (
            <span className="text-xs text-muted-foreground shrink-0">
              {formatUptime(status.uptime)}
            </span>
          )}
        </div>
        {isConnected && <ClawEmergencyStop />}
      </div>

      {/* Stat pills */}
      {isConnected && (
        <div className="flex flex-wrap gap-2 px-4 pb-3">
          <StatPill
            icon={ListTodo}
            label="Running"
            value={running}
            accent="text-blue-500"
          />
          <StatPill
            icon={Calendar}
            label="Schedules"
            value={activeSchedules}
            accent="text-purple-500"
          />
          <StatPill
            icon={Eye}
            label="Monitors"
            value={activeMonitors}
            accent="text-orange-500"
          />
          {budgetText && (
            <StatPill
              icon={DollarSign}
              label="Budget"
              value={budgetText}
              accent={budgetPct > 80 ? "text-red-500" : "text-emerald-500"}
            />
          )}
        </div>
      )}

      {/* Workspace info */}
      {isConnected && openProjects.length > 0 && (
        <div className="px-4 pb-3 border-t pt-3">
          <div className="flex items-center gap-2 mb-2">
            <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">
              {openProjects.length} project{openProjects.length !== 1 ? "s" : ""} open
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {openProjects.map((p) => (
              <button
                key={p.id}
                onClick={() => !p.isFocused && focusProjectAction(p.id)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs transition-colors",
                  p.isFocused
                    ? "bg-primary/10 text-primary border border-primary/30 font-medium"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted cursor-pointer"
                )}
              >
                {p.isFocused && <span className="text-amber-500">★</span>}
                {p.name}
                {p.gitBranch && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] opacity-60">
                    <GitBranch className="h-2.5 w-2.5" />
                    {p.gitBranch}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Task input */}
      {isConnected && (
        <div className="flex gap-1.5 px-4 pb-3 border-t pt-3">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Send instruction..."
            aria-label="Send instruction to Claw"
            className="h-8 text-sm flex-1"
          />
          <Button
            size="icon"
            variant="outline"
            className="h-8 w-8 shrink-0"
            disabled={!input.trim() || sending}
            onClick={handleSend}
            aria-label="Send instruction"
          >
            {sending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
