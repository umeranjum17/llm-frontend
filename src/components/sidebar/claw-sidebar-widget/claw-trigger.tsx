"use client";

import { forwardRef } from "react";
import { Bot, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useClawStore } from "@/stores/claw-store";
import { useClawActivityStore } from "@/stores/claw-activity-store";
import { cn } from "@/lib/utils";

interface ClawTriggerProps {
  disabled?: boolean;
  isConnected?: boolean;
  isConnecting?: boolean;
  hasError?: boolean;
}

export const ClawTrigger = forwardRef<HTMLButtonElement, ClawTriggerProps>(
  ({ disabled, isConnected, isConnecting, hasError, ...props }, ref) => {
    const isAutonomousRunning = useClawActivityStore((s) => s.isAutonomousRunning);
    const currentTask = useClawActivityStore((s) => s.currentTask);
    const initiatives = useClawStore((s) => s.initiatives);
    const tasks = useClawStore((s) => s.tasks);

    // Count items needing attention (proposed initiatives)
    const attentionCount = initiatives.filter((i) => i.status === "proposed").length;

    // Count running tasks
    const runningCount = tasks.filter((t) => t.status === "running").length;

    // Determine visual state
    const isActive = isAutonomousRunning || currentTask?.status === "running" || runningCount > 0;

    // Build ARIA label with full context
    let ariaLabel = "Claw Agent";
    if (disabled) {
      ariaLabel = "Claw: Disabled - Click to learn more";
    } else if (hasError) {
      ariaLabel = "Claw: Connection error - Click to retry";
    } else if (isConnecting) {
      ariaLabel = "Claw: Connecting to server";
    } else if (isConnected) {
      const parts: string[] = ["Claw: Connected"];
      if (runningCount > 0) parts.push(`${runningCount} task${runningCount > 1 ? "s" : ""} running`);
      if (attentionCount > 0) parts.push(`${attentionCount} initiative${attentionCount > 1 ? "s" : ""} need${attentionCount === 1 ? "s" : ""} attention`);
      ariaLabel = parts.join(", ");
    } else {
      ariaLabel = "Claw: Disconnected - Click to configure";
    }

    return (
      <Button
        ref={ref}
        variant="ghost"
        size="icon"
        className={cn(
          "relative h-8 w-8 rounded-full p-0 overflow-visible",
          "transition-all duration-200 ease-out",
          "hover:scale-105 focus-visible:scale-105 active:scale-95",
          // Color states
          disabled && "text-muted-foreground/50",
          hasError && "text-red-500 ring-1 ring-red-500/30",
          isConnecting && "text-blue-500",
          isConnected && !hasError && "text-violet-500",
          !isConnected && !isConnecting && !hasError && !disabled && "text-muted-foreground"
        )}
        aria-label={ariaLabel}
        {...props}
      >
        {/* Status Orb Background - violet glow when connected */}
        {isConnected && !hasError && (
          <span
            className={cn(
              "absolute inset-0 rounded-full",
              isActive
                ? "motion-safe:animate-orb-glow bg-violet-500/20"
                : "bg-violet-500/10"
            )}
            aria-hidden="true"
          />
        )}

        {/* Activity Ring - pulsing when tasks are running */}
        {isActive && isConnected && (
          <span
            className="absolute inset-0 rounded-full border-2 border-violet-500/60 motion-safe:animate-activity-ring"
            aria-hidden="true"
          />
        )}

        {/* Error state ring indicator (non-color indication) */}
        {hasError && (
          <span
            className="absolute inset-0 rounded-full border border-red-500/40"
            aria-hidden="true"
          />
        )}

        {/* Icon - slightly larger for better visibility */}
        {isConnecting ? (
          <Loader2 className="h-[18px] w-[18px] motion-safe:animate-spin" />
        ) : hasError ? (
          <AlertCircle className={cn(
            "h-[18px] w-[18px] relative z-10",
            "motion-safe:animate-shake"
          )} />
        ) : (
          <Bot className="h-[18px] w-[18px] relative z-10" />
        )}

        {/* Attention Badge */}
        {attentionCount > 0 && isConnected && !hasError && (
          <span
            className={cn(
              "absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center",
              "rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white",
              "shadow-sm ring-2 ring-background",
              "motion-safe:animate-pulse-subtle"
            )}
            role="status"
            aria-label={`${attentionCount} items need attention`}
          >
            {attentionCount > 9 ? "9+" : attentionCount}
          </span>
        )}
      </Button>
    );
  }
);

ClawTrigger.displayName = "ClawTrigger";
