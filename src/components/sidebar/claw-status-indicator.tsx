"use client";

import { useState } from "react";
import Link from "next/link";
import { Bot, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useClawStore } from "@/stores/claw-store";
import { useSettingsStore } from "@/stores/settings-store";

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function ClawStatusIndicator() {
  const { clawEnabled } = useSettingsStore();
  const { isConnected, isConnecting, keysSynced, status, error, createTask } = useClawStore();
  const [taskInput, setTaskInput] = useState("");
  const [sending, setSending] = useState(false);

  if (!clawEnabled) return null;

  let tone = "text-muted-foreground";
  let label = "Disconnected";

  if (error) {
    tone = "text-red-600";
    label = "Error";
  } else if (isConnecting) {
    tone = "text-blue-600 animate-pulse";
    label = "Connecting";
  } else if (isConnected && keysSynced) {
    tone = "text-emerald-600";
    label = "Connected";
  } else if (isConnected && !keysSynced) {
    tone = "text-yellow-600";
    label = "Keys pending";
  }

  const handleSend = async () => {
    const trimmed = taskInput.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      await createTask(trimmed);
      setTaskInput("");
    } finally {
      setSending(false);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={`h-6 w-6 rounded-full p-0 ${tone}`}
          aria-label={`Claw: ${label}`}
        >
          {isConnecting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Bot className="h-4 w-4" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-64 p-3">
        <div className="text-xs font-medium">Claw Agent</div>

        <div className="mt-3 space-y-1 text-[11px] text-muted-foreground">
          <div>
            <span className="text-foreground">Status:</span> {label}
          </div>
          {status?.uptime != null && (
            <div>
              <span className="text-foreground">Uptime:</span> {formatUptime(status.uptime)}
            </div>
          )}
          <div>
            <span className="text-foreground">Keys:</span>{" "}
            {keysSynced ? "synced" : "pending"}
          </div>
          {error && <div className="text-red-600">Error: {error}</div>}
        </div>

        {isConnected && (
          <div className="mt-3 flex gap-1.5">
            <Input
              value={taskInput}
              onChange={(e) => setTaskInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Quick task…"
              className="h-7 text-xs"
            />
            <Button
              size="icon"
              variant="outline"
              className="h-7 w-7 shrink-0"
              disabled={!taskInput.trim() || sending}
              onClick={handleSend}
            >
              {sending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Send className="h-3 w-3" />
              )}
            </Button>
          </div>
        )}

        <div className="mt-3">
          <Link
            href="/settings?tab=claw"
            prefetch={false}
            className="text-[11px] font-medium text-foreground hover:underline"
          >
            Claw settings
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
