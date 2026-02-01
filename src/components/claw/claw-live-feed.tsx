"use client";

import { useRef, useEffect, useState } from "react";
import {
  Brain,
  Wrench,
  CheckCircle2,
  XCircle,
  Heart,
  Clock,
  Lightbulb,
  ArrowRight,
  Pause,
  Play,
  Trash2,
  Eye,
  Sparkles,
  Workflow,
  Search,
  Zap,
  FileText,
  AlertTriangle,
  Radio,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { useClawActivityStore, type ClawLiveEvent } from "@/stores/claw-activity-store";

const EVENT_CONFIG: Record<
  string,
  { icon: typeof Brain; color: string; label: (data: Record<string, any>) => string }
> = {
  "brain:started": {
    icon: Brain,
    color: "text-blue-500",
    label: (d) => `Processing: ${d.message || "..."}`,
  },
  "brain:tool_call": {
    icon: Wrench,
    color: "text-amber-500",
    label: (d) => d.toolLabel || d.toolName || "Calling tool",
  },
  "brain:tool_result": {
    icon: ArrowRight,
    color: "text-cyan-500",
    label: (d) => `Result: ${d.summary || "done"}`,
  },
  "brain:completed": {
    icon: CheckCircle2,
    color: "text-green-500",
    label: (d) => `Completed${d.response ? `: ${d.response.slice(0, 100)}` : ""}`,
  },
  "brain:error": {
    icon: XCircle,
    color: "text-red-500",
    label: (d) => `Error: ${d.error || "unknown"}`,
  },
  "heartbeat:started": {
    icon: Heart,
    color: "text-purple-500",
    label: () => "Heartbeat check starting...",
  },
  "heartbeat:completed": {
    icon: Heart,
    color: "text-purple-400",
    label: (d) => `Heartbeat: ${d.result || "done"}`,
  },
  "schedule:executing": {
    icon: Clock,
    color: "text-purple-500",
    label: (d) => `Cron firing: ${d.name || d.scheduleId || ""}`,
  },
  "schedule:completed": {
    icon: Clock,
    color: "text-purple-400",
    label: (d) => `Cron done: ${d.name || d.scheduleId || ""}`,
  },
  "reflection:started": {
    icon: Lightbulb,
    color: "text-purple-500",
    label: () => "Reflection cycle starting...",
  },
  "reflection:completed": {
    icon: Lightbulb,
    color: "text-purple-400",
    label: (d) =>
      `Reflection done${d.initiativeCount ? ` (${d.initiativeCount} initiative${d.initiativeCount !== 1 ? "s" : ""})` : ""}`,
  },
  "ambient:started": {
    icon: Eye,
    color: "text-indigo-500",
    label: () => "Looking around...",
  },
  "ambient:thought": {
    icon: Sparkles,
    color: "text-yellow-500",
    label: (d) => d.thought || "Found something interesting",
  },
  "ambient:completed": {
    icon: Eye,
    color: "text-indigo-400",
    label: (d) => d.found ? "Ambient scan complete — found something" : "Ambient scan complete — nothing notable",
  },
  "pipeline:started": {
    icon: Workflow,
    color: "text-violet-500",
    label: () => "Pipeline starting...",
  },
  "pipeline:findings": {
    icon: Search,
    color: "text-cyan-500",
    label: (d) => `Found ${d.count || 0} item(s)`,
  },
  "pipeline:completed": {
    icon: CheckCircle2,
    color: "text-green-500",
    label: (d) => `Pipeline done (${d.findings || 0} found, ${d.actions || 0} actions)`,
  },
  "pipeline:action": {
    icon: Zap,
    color: "text-amber-500",
    label: (d) => `Action: ${d.title || "..."}`,
  },
  "briefing:started": {
    icon: FileText,
    color: "text-blue-400",
    label: () => "Generating briefing...",
  },
  "briefing:generated": {
    icon: FileText,
    color: "text-blue-500",
    label: (d) => `Briefing ready (${d.type || "on_demand"})`,
  },
  "briefing:delivered": {
    icon: FileText,
    color: "text-blue-400",
    label: () => "Briefing delivered",
  },
  "monitor:checked": {
    icon: Radio,
    color: "text-indigo-500",
    label: (d) => `Checked: ${d.name || "monitor"}`,
  },
  "monitor:alert": {
    icon: AlertTriangle,
    color: "text-red-500",
    label: (d) => `Alert: ${d.name || "monitor triggered"}`,
  },
};

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function LiveEventRow({ event }: { event: ClawLiveEvent }) {
  const config = EVENT_CONFIG[event.type] || {
    icon: Brain,
    color: "text-muted-foreground",
    label: () => event.type,
  };
  const Icon = config.icon;

  return (
    <div className="flex items-start gap-2 px-3 py-1.5 hover:bg-accent/30 transition-colors">
      <span className="text-[10px] text-muted-foreground/70 tabular-nums shrink-0 mt-0.5">
        {formatTime(event.timestamp)}
      </span>
      <Icon className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${config.color}`} />
      <span className="text-xs leading-snug break-all">
        {config.label(event.data)}
      </span>
    </div>
  );
}

export function ClawLiveFeed() {
  const liveEvents = useClawActivityStore((s) => s.liveEvents);
  const clearEvents = useClawActivityStore((s) => s.clearEvents);
  const [paused, setPaused] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to top (newest first) unless paused
  useEffect(() => {
    if (!paused && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [liveEvents, paused]);

  return (
    <div className="flex flex-col rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h3 className="text-sm font-medium">Live Activity</h3>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setPaused(!paused)}
            title={paused ? "Resume auto-scroll" : "Pause auto-scroll"}
          >
            {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={clearEvents}
            title="Clear feed"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
      <ScrollArea className="h-[400px]" ref={scrollRef}>
        {liveEvents.length === 0 ? (
          <p className="py-12 text-center text-xs text-muted-foreground">
            No activity yet. Events will appear here in real-time.
          </p>
        ) : (
          <div className="divide-y divide-border/50">
            {liveEvents.map((event) => (
              <LiveEventRow key={event.id} event={event} />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
