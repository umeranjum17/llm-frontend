"use client";

import { useState } from "react";
import { Loader2, Newspaper, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useClawStore } from "@/stores/claw-store";
import { toast } from "sonner";

function formatRelativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function ClawBriefingCard() {
  const briefing = useClawStore((s) => s.briefing);
  const generateBriefing = useClawStore((s) => s.generateBriefing);
  const [generating, setGenerating] = useState(false);

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
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Newspaper className="h-4 w-4 text-purple-500" />
          <h3 className="text-sm font-medium">Briefing</h3>
          {briefing && (
            <span className="text-xs text-muted-foreground">
              {formatRelativeTime(briefing.createdAt)}
            </span>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={handleGenerate} disabled={generating}>
          {generating ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5 mr-1.5" />
          )}
          Generate Now
        </Button>
      </div>
      <div className="p-4">
        {!briefing ? (
          <p className="text-sm text-muted-foreground">
            No briefing yet. Generate one to get an overview of current activity.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm whitespace-pre-wrap">{briefing.content}</p>
            {briefing.sections?.length > 0 && (
              <div className="space-y-2">
                {briefing.sections.map((section, i) => (
                  <div key={i}>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                      {section.title}
                    </h4>
                    <ul className="space-y-1">
                      {section.items.map((item, j) => (
                        <li key={j} className="text-sm">
                          <span className="font-medium">{item.title}</span>
                          {item.summary && (
                            <span className="text-muted-foreground"> — {item.summary}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
