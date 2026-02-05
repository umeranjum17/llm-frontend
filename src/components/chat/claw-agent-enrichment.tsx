"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, Bot, CheckCheck, AlertTriangle, Activity, Calendar, Key, Loader2, Send, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useClawStore } from "@/stores/claw-store";
import { useSettingsStore } from "@/stores/settings-store";
import {
  useClawNotificationStore,
  useUnreadCount,
  type ClawNotification,
} from "@/stores/claw-notification-store";

const ICON_MAP: Record<ClawNotification["type"], { icon: typeof Bell; color: string }> = {
  "task:completed": { icon: CheckCheck, color: "text-green-500" },
  "task:failed": { icon: AlertTriangle, color: "text-red-500" },
  "activity:new": { icon: Activity, color: "text-blue-500" },
  "schedule:triggered": { icon: Calendar, color: "text-purple-500" },
  "keys:synced": { icon: Key, color: "text-emerald-500" },
  "initiative:proposed": { icon: Bell, color: "text-amber-500" },
  "initiative:approved": { icon: CheckCheck, color: "text-green-500" },
  "initiative:rejected": { icon: AlertTriangle, color: "text-red-500" },
  "initiative:deferred": { icon: Calendar, color: "text-muted-foreground" },
  "monitor:alert": { icon: AlertTriangle, color: "text-orange-500" },
};

function formatRelativeTime(timestamp: number) {
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/**
 * Claw enrichment that sits next to the agent selector button in the chat header.
 * Shows connection status dot + notification badge, with a popover for details.
 */
export function ClawAgentEnrichment() {
  const { clawEnabled } = useSettingsStore();
  const { isConnected, isConnecting, keysSynced, status, error, createTask } = useClawStore();
  const notifications = useClawNotificationStore((s) => s.notifications);
  const markAsRead = useClawNotificationStore((s) => s.markAsRead);
  const markAllAsRead = useClawNotificationStore((s) => s.markAllAsRead);
  const clearAll = useClawNotificationStore((s) => s.clearAll);
  const unreadCount = useUnreadCount();
  const [taskInput, setTaskInput] = useState("");
  const [sending, setSending] = useState(false);

  if (!clawEnabled) return null;

  let statusColor = "bg-muted-foreground";
  let statusLabel = "Disconnected";

  if (error) {
    statusColor = "bg-red-500";
    statusLabel = "Error";
  } else if (isConnecting) {
    statusColor = "bg-blue-500 animate-pulse";
    statusLabel = "Connecting";
  } else if (isConnected && keysSynced) {
    statusColor = "bg-emerald-500";
    statusLabel = "Connected";
  } else if (isConnected && !keysSynced) {
    statusColor = "bg-yellow-500";
    statusLabel = "Keys pending";
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
        <button
          className="hidden sm:flex items-center justify-center h-8 px-1.5 rounded-md hover:bg-accent/50 transition-colors relative"
          title="Claw notifications"
        >
          <div className="relative">
            <Bell className="h-3.5 w-3.5 text-muted-foreground" />
            <span className={`absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full ring-1 ring-background ${statusColor}`} />
          </div>
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0 flex items-center justify-center h-3.5 min-w-3.5 px-0.5 rounded-full bg-red-500 text-white text-[8px] font-bold leading-none">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-80 p-0">
        {/* Status header */}
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Bot className="h-4 w-4" />
              <span className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-1 ring-background ${statusColor}`} />
            </div>
            <div>
              <div className="text-xs font-medium">Claw Agent</div>
              <div className="text-[10px] text-muted-foreground">{statusLabel}{status?.uptime != null ? ` · ${formatUptime(status.uptime)}` : ""}</div>
            </div>
          </div>
          <div className="flex gap-0.5">
            <Link href="/claw" prefetch={false}>
              <Button variant="ghost" size="icon" className="h-6 w-6" title="Open Claw Dashboard">
                <Activity className="h-3 w-3" />
              </Button>
            </Link>
            <Link href="/settings?tab=claw" prefetch={false}>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <Settings className="h-3 w-3" />
              </Button>
            </Link>
          </div>
        </div>

        {/* Quick task input */}
        {isConnected && (
          <div className="flex gap-1.5 border-b px-3 py-2">
            <Input
              value={taskInput}
              onChange={(e) => setTaskInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Send task to Claw…"
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

        {error && (
          <div className="px-3 py-2 text-[11px] text-red-600 border-b">
            {error}
          </div>
        )}

        {/* Notifications */}
        <div className="flex items-center justify-between px-3 py-1.5">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Notifications</span>
          <div className="flex gap-1">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-auto px-1.5 py-0.5 text-[10px]"
                onClick={markAllAsRead}
              >
                Mark read
              </Button>
            )}
            {notifications.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-auto px-1.5 py-0.5 text-[10px] text-muted-foreground"
                onClick={clearAll}
              >
                Clear
              </Button>
            )}
          </div>
        </div>
        <ScrollArea className="max-h-64">
          {notifications.length === 0 ? (
            <p className="py-6 text-center text-[11px] text-muted-foreground">
              No notifications
            </p>
          ) : (
            <div className="divide-y">
              {notifications.map((n) => {
                const { icon: Icon, color } = ICON_MAP[n.type] || {
                  icon: Activity,
                  color: "text-muted-foreground",
                };
                return (
                  <button
                    key={n.id}
                    className={`flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-accent/40 ${
                      !n.read ? "bg-accent/20" : ""
                    }`}
                    onClick={() => markAsRead(n.id)}
                  >
                    <Icon className={`mt-0.5 h-3 w-3 shrink-0 ${color}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-medium leading-tight">{n.title}</p>
                      <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground line-clamp-2">{n.message}</p>
                      <p className="mt-0.5 text-[9px] text-muted-foreground/60">{formatRelativeTime(n.timestamp)}</p>
                    </div>
                    {!n.read && (
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
