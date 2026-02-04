"use client";

import { useState, useEffect } from "react";
import {
  Bell,
  CheckCheck,
  AlertTriangle,
  Activity,
  Calendar,
  Key,
  X,
  Bot,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSettingsStore } from "@/stores/settings-store";
import { useClawStore } from "@/stores/claw-store";
import {
  useClawNotificationStore,
  useUnreadCount,
  type ClawNotification,
} from "@/stores/claw-notification-store";
import { cn } from "@/lib/utils";

const ICON_MAP: Record<
  ClawNotification["type"],
  { icon: typeof Bell; color: string }
> = {
  "task:completed": { icon: CheckCheck, color: "text-green-500" },
  "task:failed": { icon: AlertTriangle, color: "text-red-500" },
  "activity:new": { icon: Activity, color: "text-blue-500" },
  "schedule:triggered": { icon: Calendar, color: "text-purple-500" },
  "keys:synced": { icon: Key, color: "text-emerald-500" },
  "initiative:proposed": { icon: Bell, color: "text-amber-500" },
  "initiative:approved": { icon: CheckCheck, color: "text-green-500" },
  "initiative:rejected": { icon: AlertTriangle, color: "text-red-500" },
  "initiative:deferred": { icon: Calendar, color: "text-muted-foreground" },
};

function formatRelativeTime(timestamp: number) {
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function ClawFloatingNotifications() {
  const { clawEnabled } = useSettingsStore();
  const isConnected = useClawStore((s) => s.isConnected);
  const notifications = useClawNotificationStore((s) => s.notifications);
  const markAsRead = useClawNotificationStore((s) => s.markAsRead);
  const markAllAsRead = useClawNotificationStore((s) => s.markAllAsRead);
  const clearAll = useClawNotificationStore((s) => s.clearAll);
  const unreadCount = useUnreadCount();
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Reset dismissed state when new unread notifications come in
  useEffect(() => {
    if (unreadCount > 0) setDismissed(false);
  }, [unreadCount]);

  if (!clawEnabled || !isConnected) return null;

  // Only show the bubble when there are unread notifications (unless expanded)
  if (unreadCount === 0 && !expanded) return null;

  // User swiped away / dismissed the bubble
  if (dismissed && !expanded) return null;

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className={cn(
          "fixed bottom-5 right-5 z-50",
          "flex items-center gap-2 px-3 py-2 rounded-full",
          "bg-background/95 backdrop-blur border border-border/60 shadow-lg",
          "hover:shadow-xl hover:border-border transition-all",
          "sm:bottom-6 sm:right-6"
        )}
      >
        <div className="relative">
          <Bot className="h-4 w-4 text-muted-foreground" />
          <span className="absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500 ring-1 ring-background" />
        </div>
        <span className="flex items-center justify-center h-5 min-w-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      </button>
    );
  }

  return (
    <div
      className={cn(
        "fixed bottom-5 right-5 z-50",
        "w-80 max-w-[calc(100vw-2.5rem)] rounded-xl",
        "bg-background/95 backdrop-blur border border-border/60 shadow-xl",
        "sm:bottom-6 sm:right-6",
        "animate-in slide-in-from-bottom-2 fade-in duration-200"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/40">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Bot className="h-4 w-4" />
            <span className="absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500 ring-1 ring-background" />
          </div>
          <span className="text-xs font-medium">Claw</span>
          {unreadCount > 0 && (
            <span className="flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold leading-none">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
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
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground"
            onClick={() => setExpanded(false)}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Notification list */}
      <ScrollArea className="max-h-64">
        {notifications.length === 0 ? (
          <p className="py-6 text-center text-[11px] text-muted-foreground">
            No notifications
          </p>
        ) : (
          <div className="divide-y divide-border/30">
            {notifications.map((n) => {
              const { icon: Icon, color } = ICON_MAP[n.type] || {
                icon: Activity,
                color: "text-muted-foreground",
              };
              return (
                <button
                  key={n.id}
                  className={cn(
                    "flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-accent/40",
                    !n.read && "bg-accent/20"
                  )}
                  onClick={() => markAsRead(n.id)}
                >
                  <Icon
                    className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${color}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium leading-tight">
                      {n.title}
                    </p>
                    <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground line-clamp-2">
                      {n.message}
                    </p>
                    <p className="mt-0.5 text-[9px] text-muted-foreground/60">
                      {formatRelativeTime(n.timestamp)}
                    </p>
                  </div>
                  {!n.read && (
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
