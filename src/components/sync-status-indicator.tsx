"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, CloudOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSyncStatus } from "@/lib/sync/sync-manager";

type SyncState = {
  configured: boolean;
  deviceId: string;
  lastSyncAt: number;
  pendingChanges: number;
};

export function SyncStatusIndicator() {
  const [status, setStatus] = useState<SyncState>({
    configured: false,
    deviceId: "",
    lastSyncAt: 0,
    pendingChanges: 0,
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const next = await getSyncStatus();
      if (!mounted) return;
      setStatus(next);
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

    load();
    const interval = setInterval(load, 10000);
    window.addEventListener("lumina:sync-start", handleSyncStart);
    window.addEventListener("lumina:sync-complete", handleSyncComplete);

    return () => {
      mounted = false;
      clearInterval(interval);
      window.removeEventListener("lumina:sync-start", handleSyncStart);
      window.removeEventListener("lumina:sync-complete", handleSyncComplete);
    };
  }, []);

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
  }

  return (
    <Link href="/settings?tab=sync" prefetch={false} title={lastError || "Sync settings"}>
      <Button variant="ghost" size="sm" className={`gap-2 ${tone}`}>
        {icon}
        <span className="hidden sm:inline text-xs font-medium">{label}</span>
      </Button>
    </Link>
  );
}
