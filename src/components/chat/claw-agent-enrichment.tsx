"use client";

import { useLuminaStore } from "@/stores/lumina-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useLuminaSurface } from "@/hooks/use-lumina-surface";
import { cn } from "@/lib/utils";

/**
 * Minimal Claw status indicator for chat header.
 * Shows a small status dot with "Claw" label - full functionality
 * is handled by sidebar widget or floating notifications.
 */
export function ClawAgentEnrichment() {
  const { showChatEnrichment } = useLuminaSurface();
  const { clawEnabled } = useSettingsStore();
  const isConnected = useLuminaStore((s) => s.isConnected);

  if (!showChatEnrichment || !clawEnabled) return null;

  // Minimal: just a status dot
  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1 text-xs text-zinc-500"
      title={isConnected ? "Claw connected" : "Claw disconnected"}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          isConnected ? "bg-emerald-500" : "bg-zinc-600"
        )}
      />
      <span className="text-zinc-600 dark:text-zinc-400">Claw</span>
    </div>
  );
}
