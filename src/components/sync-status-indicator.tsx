"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, CloudOff, Loader2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getAutoSyncMode, getDeviceName, type AutoSyncMode } from "@/lib/sync/device-id";
import { getSyncStatus, sync } from "@/lib/sync/sync-manager";

type SyncState = {
  configured: boolean;
  configLocked: boolean;
  deviceId: string;
  lastSyncAt: number;
  pendingChanges: number;
};

export function SyncStatusIndicator() {
  const [status, setStatus] = useState<SyncState>({
    configured: false,
    configLocked: false,
    deviceId: "",
    lastSyncAt: 0,
    pendingChanges: 0,
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState("Device");
  const [autoSyncMode, setAutoSyncModeState] = useState<AutoSyncMode>("5m");

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const next = await getSyncStatus();
      if (!mounted) return;
      setStatus(next);
    };

    const loadMeta = async () => {
      const [nextDeviceName, nextAutoSyncMode] = await Promise.all([
        getDeviceName(),
        getAutoSyncMode(),
      ]);
      if (!mounted) return;
      setDeviceName(nextDeviceName);
      setAutoSyncModeState(nextAutoSyncMode);
    };

    const handleSyncStart = () => setIsSyncing(true);
    const handleSyncComplete = (event: Event) => {
      setIsSyncing(false);
      const detail = (event as CustomEvent).detail as { success?: boolean; error?: string } | undefined;
      if (detail?.success === false) {
        setLastError(detail.error || "Sync failed");
      } else {
        setLastError(null);
      }
      load();
    };
    const handleAutoSyncUpdated = () => {
      loadMeta();
    };

    load();
    loadMeta();
    const interval = setInterval(load, 10000);
    window.addEventListener("lumina:sync-start", handleSyncStart);
    window.addEventListener("lumina:sync-complete", handleSyncComplete);
    window.addEventListener("lumina:auto-sync-updated", handleAutoSyncUpdated);

    return () => {
      mounted = false;
      clearInterval(interval);
      window.removeEventListener("lumina:sync-start", handleSyncStart);
      window.removeEventListener("lumina:sync-complete", handleSyncComplete);
      window.removeEventListener("lumina:auto-sync-updated", handleAutoSyncUpdated);
    };
  }, []);

  const formatLastSync = (timestamp: number) => {
    if (!timestamp) return "Never";
    const diffMs = Date.now() - timestamp;
    if (diffMs < 60 * 1000) return "Just now";
    if (diffMs < 60 * 60 * 1000) return `${Math.floor(diffMs / 60000)}m ago`;
    if (diffMs < 24 * 60 * 60 * 1000) return `${Math.floor(diffMs / 3600000)}h ago`;
    return `${Math.floor(diffMs / 86400000)}d ago`;
  };

  const isStale =
    status.configured &&
    status.lastSyncAt > 0 &&
    Date.now() - status.lastSyncAt > 5 * 60 * 1000 &&
    !isSyncing &&
    !lastError;

  let icon = <CloudOff className="h-4 w-4" />;
  let label = "Sync off";
  let tone = "text-muted-foreground";

  if (status.configured) {
    label = "Synced";
    icon = <CheckCircle2 className="h-4 w-4" />;
    tone = "text-emerald-600";
    if (status.pendingChanges > 0) {
      label = "Pending";
      tone = "text-yellow-600";
    }
    if (isSyncing) {
      label = "Syncing";
      tone = "text-blue-600";
      icon = <Loader2 className="h-4 w-4 animate-spin" />;
    }
    if (lastError) {
      label = "Sync error";
      tone = "text-red-600";
      icon = <AlertCircle className="h-4 w-4" />;
    }
    if (isStale) {
      label = "Sync stale";
      tone = "text-amber-600";
      icon = <Clock className="h-4 w-4" />;
    }
  }

  const handleSyncNow = async () => {
    if (!status.configured || status.configLocked || isSyncing) return;
    setIsSyncing(true);
    try {
      await sync();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sync failed";
      setLastError(message);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={`h-6 w-6 rounded-full p-0 ${tone}`}
          aria-label={label}
        >
          {icon}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-64 p-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium">Sync</div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleSyncNow}
            disabled={!status.configured || status.configLocked || isSyncing}
          >
            {isSyncing ? "Syncing" : "Sync now"}
          </Button>
        </div>
        <div className="mt-3 space-y-1 text-[11px] text-muted-foreground">
          <div>
            <span className="text-foreground">Status:</span>{" "}
            {status.configured ? (status.configLocked ? "Locked" : label) : "Not configured"}
          </div>
          <div>
            <span className="text-foreground">Last sync:</span> {formatLastSync(status.lastSyncAt)}
          </div>
          <div>
            <span className="text-foreground">Pending:</span> {status.pendingChanges}
          </div>
          <div>
            <span className="text-foreground">Auto-sync:</span> {autoSyncMode}
          </div>
          <div>
            <span className="text-foreground">Device:</span> {deviceName}
          </div>
          {lastError && (
            <div className="text-red-600">Error: {lastError}</div>
          )}
        </div>
        <div className="mt-3 flex items-center justify-between">
          <Link
            href="/settings?tab=sync"
            prefetch={false}
            className="text-[11px] font-medium text-foreground hover:underline"
          >
            Sync settings
          </Link>
          <div className="text-[10px] text-muted-foreground">
            {status.deviceId ? `ID ${status.deviceId.slice(0, 6)}…` : ""}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
