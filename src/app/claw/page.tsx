"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClawStatusBar } from "@/components/claw/claw-status-bar";
import { ClawStatCards } from "@/components/claw/claw-stat-cards";
import { ClawBriefingCard } from "@/components/claw/claw-briefing-card";
import { ClawLiveFeed } from "@/components/claw/claw-live-feed";
import { ClawTasksPanel } from "@/components/claw/claw-tasks-panel";
import { ClawSchedulesPanel } from "@/components/claw/claw-schedules-panel";
import { ClawInitiativesPanel } from "@/components/claw/claw-initiatives-panel";
import { useClawStore } from "@/stores/claw-store";

export default function ClawDashboardPage() {
  const isConnected = useClawStore((s) => s.isConnected);
  const initFromSettings = useClawStore((s) => s.initFromSettings);
  const refreshAll = useClawStore((s) => s.refreshAll);

  useEffect(() => {
    if (!isConnected) {
      initFromSettings();
    }
  }, []);

  useEffect(() => {
    if (isConnected) {
      refreshAll();
    }
  }, [isConnected]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-lg font-semibold">Claw Dashboard</h1>
        </div>
        <Link href="/settings?tab=claw">
          <Button variant="ghost" size="sm">
            <Settings className="h-4 w-4 mr-1.5" />
            Settings
          </Button>
        </Link>
      </div>

      {/* Status bar */}
      <ClawStatusBar />

      {!isConnected ? (
        <div className="rounded-lg border bg-card py-16 text-center">
          <p className="text-sm text-muted-foreground">
            Not connected to Claw.{" "}
            <Link href="/settings?tab=claw" className="underline">
              Configure in Settings
            </Link>
          </p>
        </div>
      ) : (
        <>
          {/* Stat cards */}
          <ClawStatCards />

          {/* Main 2-column grid */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Left column */}
            <div className="space-y-4">
              <ClawBriefingCard />
              <ClawLiveFeed />
            </div>

            {/* Right column */}
            <div className="space-y-4">
              <ClawTasksPanel />
              <ClawSchedulesPanel />
            </div>
          </div>

          {/* Bottom full-width: Initiatives */}
          <ClawInitiativesPanel />
        </>
      )}
    </div>
  );
}
