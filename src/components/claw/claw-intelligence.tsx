"use client";

import { useState } from "react";
import {
  Newspaper,
  Sparkles,
  Loader2,
  Radio,
  Eye,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useClawStore } from "@/stores/claw-store";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { toast } from "sonner";

function formatRelativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return "unknown";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatTimeUntil(iso: string) {
  const diff = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(diff)) return "unknown";
  if (diff <= 0) return "now";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `in ${hours}h`;
  return `in ${Math.floor(hours / 24)}d`;
}

export function ClawIntelligence() {
  const briefing = useClawStore((s) => s.briefing);
  const generateBriefing = useClawStore((s) => s.generateBriefing);
  const monitors = useClawStore((s) => s.monitors);
  const pipelineRuns = useClawStore((s) => s.pipelineRuns);
  const schedules = useClawStore((s) => s.schedules);

  const [generating, setGenerating] = useState(false);

  const enabledMonitors = monitors.filter((m) => m.enabled).length;
  const latestPipeline = pipelineRuns[0];
  const activeSchedules = schedules.filter((s) => s.enabled);
  const nextRun = activeSchedules
    .filter((s) => s.nextRun)
    .sort(
      (a, b) =>
        new Date(a.nextRun!).getTime() - new Date(b.nextRun!).getTime()
    )[0];
  const lastChecked = monitors
    .filter((m) => m.lastChecked)
    .sort(
      (a, b) =>
        new Date(b.lastChecked!).getTime() -
        new Date(a.lastChecked!).getTime()
    )[0];

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const result = await generateBriefing();
      if (result) toast.success("Briefing generated");
      else toast.error("Failed to generate briefing");
    } catch {
      toast.error("Failed to generate briefing");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="rounded-lg border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Newspaper className="h-4 w-4 text-purple-500" />
          <h3 className="text-sm font-medium">Intelligence</h3>
          {briefing && (
            <span className="text-xs text-muted-foreground">
              {formatRelativeTime(briefing.createdAt)}
            </span>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleGenerate}
          disabled={generating}
        >
          {generating ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
          )}
          Generate
        </Button>
      </div>

      {/* Briefing content */}
      <div className="p-4 max-h-[400px] overflow-y-auto">
        {!briefing ? (
          <div className="py-8 text-center">
            <Newspaper className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No briefing yet.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Generate one to get an overview of current activity.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-sm prose-sm prose-invert max-w-none">
              <MarkdownRenderer content={briefing.content} />
            </div>
            {briefing.sections?.length > 0 && (
              <div className="space-y-2">
                {briefing.sections.map(
                  (section, i) => (
                    <div key={i}>
                      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                        {section.title}
                      </h4>
                      <ul className="space-y-1">
                        {section.items.map((item, j) => (
                          <li key={j} className="text-sm">
                            <span className="font-medium">{item.title}</span>
                            {item.summary && (
                              <span className="text-muted-foreground">
                                {" "}
                                — {item.summary}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* System health footer */}
      <div className="border-t px-3 sm:px-4 py-2 sm:py-2.5 flex flex-col sm:flex-row flex-wrap gap-x-4 gap-y-1 text-[10px] sm:text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Radio className="h-3 w-3 text-indigo-500 shrink-0" />
          Pipeline:{" "}
          {latestPipeline
            ? `${latestPipeline.findingsCount} findings, ${formatRelativeTime(latestPipeline.createdAt)}`
            : "no runs"}
        </span>
        <span className="flex items-center gap-1.5">
          <Eye className="h-3 w-3 text-orange-500 shrink-0" />
          {enabledMonitors} monitor{enabledMonitors !== 1 ? "s" : ""} active
          {lastChecked?.lastChecked &&
            `, checked ${formatRelativeTime(lastChecked.lastChecked)}`}
        </span>
        <span className="flex items-center gap-1.5">
          <Calendar className="h-3 w-3 text-purple-500 shrink-0" />
          {nextRun?.nextRun
            ? `Next: ${nextRun.name} ${formatTimeUntil(nextRun.nextRun)}`
            : "No upcoming runs"}
        </span>
      </div>
    </div>
  );
}
