"use client";

import { useState } from "react";
import { Bot, Loader2, Send, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useClawStore } from "@/stores/claw-store";
import { useClawActivityStore } from "@/stores/claw-activity-store";

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function ClawStatusBar() {
  const { isConnected, status, createTask } = useClawStore();
  const currentTask = useClawActivityStore((s) => s.currentTask);
  const isAutonomousRunning = useClawActivityStore((s) => s.isAutonomousRunning);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      await createTask(trimmed);
      setInput("");
    } finally {
      setSending(false);
    }
  };

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

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
      <div className="flex items-center gap-2 shrink-0">
        {isConnected ? (
          <Wifi className="h-4 w-4 text-emerald-500" />
        ) : (
          <WifiOff className="h-4 w-4 text-muted-foreground" />
        )}
        <Bot className="h-5 w-5" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{statusText}</span>
          {currentTask?.status === "running" && (
            <Loader2 className="h-3 w-3 animate-spin text-blue-500 shrink-0" />
          )}
        </div>
        {isConnected && status?.uptime != null && (
          <p className="text-xs text-muted-foreground">
            Uptime: {formatUptime(status.uptime)}
          </p>
        )}
      </div>

      {isConnected && (
        <div className="flex gap-1.5 shrink-0">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Send instruction..."
            className="h-8 w-64 text-sm"
          />
          <Button
            size="icon"
            variant="outline"
            className="h-8 w-8"
            disabled={!input.trim() || sending}
            onClick={handleSend}
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
