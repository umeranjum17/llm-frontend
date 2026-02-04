"use client";

import Link from "next/link";
import { Sparkles, Bot, Zap, Clock, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ClawDisabledCTA() {
  return (
    <div className="p-5 text-center">
      {/* Animated Icon */}
      <div className="relative mx-auto mb-4 h-14 w-14">
        <div className={cn(
          "absolute inset-0 rounded-full bg-gradient-to-br from-violet-500/20 to-purple-500/20",
          "motion-safe:animate-pulse-subtle"
        )} />
        <div className={cn(
          "absolute inset-1 rounded-full bg-gradient-to-br from-violet-500/10 to-purple-500/10",
          "motion-safe:animate-pulse-subtle motion-safe:animation-delay-150"
        )} />
        <div className="absolute inset-0 flex items-center justify-center">
          <Sparkles className={cn(
            "h-7 w-7 text-violet-500",
            "motion-safe:animate-pulse-subtle"
          )} />
        </div>
      </div>

      {/* Title */}
      <h3 className="text-sm font-semibold text-foreground mb-1.5">
        Unlock Your AI Agent
      </h3>

      {/* Value Prop */}
      <p className="text-xs text-muted-foreground mb-5 leading-relaxed max-w-[220px] mx-auto">
        Let Claw handle background tasks, monitor topics, and keep you briefed automatically.
      </p>

      {/* Features Preview - stacks on small screens */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-5">
        <div className="flex sm:flex-col items-center gap-2 sm:gap-1 p-2.5 rounded-lg bg-muted/50 hover:bg-muted/70 transition-colors">
          <Bot className="h-4 w-4 text-violet-500 shrink-0" />
          <span className="text-[11px] text-muted-foreground font-medium">Auto Tasks</span>
        </div>
        <div className="flex sm:flex-col items-center gap-2 sm:gap-1 p-2.5 rounded-lg bg-muted/50 hover:bg-muted/70 transition-colors">
          <Zap className="h-4 w-4 text-amber-500 shrink-0" />
          <span className="text-[11px] text-muted-foreground font-medium">Monitoring</span>
        </div>
        <div className="flex sm:flex-col items-center gap-2 sm:gap-1 p-2.5 rounded-lg bg-muted/50 hover:bg-muted/70 transition-colors">
          <Clock className="h-4 w-4 text-blue-500 shrink-0" />
          <span className="text-[11px] text-muted-foreground font-medium">Schedules</span>
        </div>
      </div>

      {/* Enable Button */}
      <Button
        asChild
        size="sm"
        className={cn(
          "w-full h-9 bg-violet-600 hover:bg-violet-700",
          "shadow-sm hover:shadow-md transition-all"
        )}
      >
        <Link href="/settings?tab=claw">
          Enable Claw
          <ArrowRight className="h-3.5 w-3.5 ml-2" />
        </Link>
      </Button>

      {/* Learn more link */}
      <p className="mt-3 text-[10px] text-muted-foreground">
        <Link href="/claw" className="hover:text-foreground underline-offset-2 hover:underline transition-colors">
          Learn more about Claw
        </Link>
      </p>
    </div>
  );
}
