"use client";

import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
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
import { useClawSurface } from "@/hooks/use-claw-surface";
import { useMediaQuery } from "@/hooks/use-media-query";
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
  "monitor:alert": { icon: AlertTriangle, color: "text-orange-500" },
};

function formatRelativeTime(timestamp: number) {
  const diff = Date.now() - timestamp;
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function NotificationItem({ notification }: { notification: ClawNotification }) {
  const markAsRead = useClawNotificationStore((s) => s.markAsRead);
  const { icon: Icon, color } = ICON_MAP[notification.type] || {
    icon: Activity,
    color: "text-muted-foreground",
  };

  return (
    <button
      className={cn(
        "flex w-full items-start gap-2.5 px-4 py-3 text-left transition-colors hover:bg-accent/40",
        !notification.read && "bg-accent/20"
      )}
      onClick={() => markAsRead(notification.id)}
    >
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${color}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-tight">{notification.title}</p>
        <p className="mt-0.5 text-xs leading-tight text-muted-foreground line-clamp-2">
          {notification.message}
        </p>
        <p className="mt-1 text-[10px] text-muted-foreground/60">
          {formatRelativeTime(notification.timestamp)}
        </p>
      </div>
      {!notification.read && (
        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-500" />
      )}
    </button>
  );
}

export function ClawFloatingNotifications() {
  const { showFloating } = useClawSurface();
  const isMobile = useMediaQuery("(max-width: 640px)");
  const { clawEnabled } = useSettingsStore();
  const isConnected = useClawStore((s) => s.isConnected);
  const notifications = useClawNotificationStore((s) => s.notifications);
  const markAllAsRead = useClawNotificationStore((s) => s.markAllAsRead);
  const clearAll = useClawNotificationStore((s) => s.clearAll);
  const unreadCount = useUnreadCount();
  const [isExpanded, setIsExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Reset dismissed state when new unread notifications come in
  useEffect(() => {
    if (unreadCount > 0) setDismissed(false);
  }, [unreadCount]);

  // Don't render if sidebar widget is handling it
  if (!showFloating) return null;

  if (!clawEnabled || !isConnected) return null;

  // Only show the bubble when there are unread notifications (unless expanded)
  if (unreadCount === 0 && !isExpanded) return null;

  // User swiped away / dismissed the bubble
  if (dismissed && !isExpanded) return null;

  return (
    <>
      {/* Backdrop for mobile */}
      <AnimatePresence>
        {isExpanded && isMobile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/50"
            onClick={() => setIsExpanded(false)}
          />
        )}
      </AnimatePresence>

      {/* Main container */}
      <div
        className={cn(
          "fixed z-50",
          isMobile
            ? "inset-x-0 bottom-0 pb-[env(safe-area-inset-bottom)]"
            : "bottom-4 right-4"
        )}
      >
        <AnimatePresence mode="wait">
          {isExpanded ? (
            <motion.div
              key="expanded"
              initial={isMobile ? { y: "100%" } : { opacity: 0, scale: 0.95 }}
              animate={isMobile ? { y: 0 } : { opacity: 1, scale: 1 }}
              exit={isMobile ? { y: "100%" } : { opacity: 0, scale: 0.95 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className={cn(
                "bg-background/95 backdrop-blur border-border/60 shadow-xl",
                isMobile
                  ? "w-full rounded-t-xl border-t"
                  : "w-80 rounded-lg border"
              )}
            >
              {/* Drag handle (mobile only) */}
              {isMobile && (
                <div className="flex justify-center py-2">
                  <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
                </div>
              )}

              {/* Header */}
              <div className="flex items-center justify-between border-b border-border/40 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Bot className="h-4 w-4" />
                    <span
                      className={cn(
                        "absolute -bottom-0.5 -right-0.5 h-1.5 w-1.5 rounded-full ring-1 ring-background",
                        isConnected ? "bg-emerald-500" : "bg-zinc-600"
                      )}
                    />
                  </div>
                  <span className="text-sm font-medium">Claw</span>
                  {unreadCount > 0 && (
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {unreadCount} new
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {unreadCount > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={markAllAsRead}
                    >
                      Mark read
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => setIsExpanded(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Content */}
              <ScrollArea className={cn(isMobile ? "max-h-[50vh]" : "max-h-64")}>
                {notifications.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    No notifications
                  </div>
                ) : (
                  <div className="divide-y divide-border/30">
                    {notifications.slice(0, 15).map((n) => (
                      <NotificationItem key={n.id} notification={n} />
                    ))}
                  </div>
                )}
              </ScrollArea>

              {/* Footer */}
              {notifications.length > 0 && (
                <div className="border-t border-border/40 p-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-full text-xs text-muted-foreground"
                    onClick={() => {
                      clearAll();
                      setIsExpanded(false);
                    }}
                  >
                    Clear all
                  </Button>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.button
              key="collapsed"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={() => setIsExpanded(true)}
              className={cn(
                "relative flex items-center justify-center rounded-full shadow-lg",
                "bg-background/95 backdrop-blur border border-border/60",
                "transition-transform hover:scale-105 active:scale-95",
                isMobile ? "mx-auto mb-4 h-12 w-12" : "h-10 w-10"
              )}
            >
              <Bell className={cn(isMobile ? "h-5 w-5" : "h-4 w-4")} />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
