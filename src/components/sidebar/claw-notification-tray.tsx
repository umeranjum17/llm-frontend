"use client";

import { Bell, CheckCheck, AlertTriangle, Activity, Calendar, Key } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useClawStore } from "@/stores/claw-store";
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
};

function formatRelativeTime(timestamp: number) {
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function ClawNotificationTray() {
  const isConnected = useClawStore((s) => s.isConnected);
  const notifications = useClawNotificationStore((s) => s.notifications);
  const markAsRead = useClawNotificationStore((s) => s.markAsRead);
  const markAllAsRead = useClawNotificationStore((s) => s.markAllAsRead);
  const clearAll = useClawNotificationStore((s) => s.clearAll);
  const unreadCount = useUnreadCount();

  if (!isConnected) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-6 w-6 rounded-full p-0 text-muted-foreground hover:text-foreground"
          aria-label="Claw notifications"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-red-500" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-72 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-xs font-medium">Notifications</span>
          <div className="flex gap-1">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-auto px-1.5 py-0.5 text-[10px]"
                onClick={markAllAsRead}
              >
                Mark all read
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
        <ScrollArea className="max-h-80">
          {notifications.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
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
                    className={`flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-accent/40 ${
                      !n.read ? "bg-accent/20" : ""
                    }`}
                    onClick={() => markAsRead(n.id)}
                  >
                    <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${color}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-medium leading-tight">
                        {n.title}
                      </p>
                      <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground line-clamp-2">
                        {n.message}
                      </p>
                      <p className="mt-1 text-[9px] text-muted-foreground/60">
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
      </PopoverContent>
    </Popover>
  );
}
