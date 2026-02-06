"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Settings, Home, ListTodo, Calendar, Lightbulb, FolderCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClawStatusBar } from "@/components/claw/claw-status-bar";
import { ClawStatCards } from "@/components/claw/claw-stat-cards";
import { ClawBriefingCard } from "@/components/claw/claw-briefing-card";
import { ClawLiveFeed } from "@/components/claw/claw-live-feed";
import { ClawTasksPanel } from "@/components/claw/claw-tasks-panel";
import { ClawSchedulesPanel } from "@/components/claw/claw-schedules-panel";
import { ClawInitiativesPanel } from "@/components/claw/claw-initiatives-panel";
import { ClawCodebasesPanel } from "@/components/claw/claw-codebases-panel";
import { useClawStore } from "@/stores/claw-store";

export default function ClawDashboardPage() {
  const isConnected = useClawStore((s) => s.isConnected);
  const initFromSettings = useClawStore((s) => s.initFromSettings);
  const refreshAll = useClawStore((s) => s.refreshAll);
  const [activeTab, setActiveTab] = useState("overview");

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
    <div className="mx-auto max-w-6xl px-4 py-4 lg:py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Link href="/">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-lg font-semibold">Claw Dashboard</h1>
        </div>
        <Link href="/settings?tab=claw">
          <Button variant="ghost" size="sm" className="h-8">
            <Settings className="h-4 w-4 lg:mr-1.5" />
            <span className="hidden lg:inline">Settings</span>
          </Button>
        </Link>
      </div>

      {/* Status bar */}
      <ClawStatusBar />

      {!isConnected ? (
        <div className="rounded-lg border bg-card py-16 text-center mt-4">
          <p className="text-sm text-muted-foreground">
            Not connected to Claw.{" "}
            <Link href="/settings?tab=claw" className="underline">
              Configure in Settings
            </Link>
          </p>
        </div>
      ) : (
        <>
          {/* Mobile: Tabbed interface */}
          <div className="lg:hidden mt-4">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="w-full grid grid-cols-5 h-10">
                <TabsTrigger value="overview" className="text-xs gap-1">
                  <Home className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Overview</span>
                </TabsTrigger>
                <TabsTrigger value="tasks" className="text-xs gap-1">
                  <ListTodo className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Tasks</span>
                </TabsTrigger>
                <TabsTrigger value="schedules" className="text-xs gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Schedules</span>
                </TabsTrigger>
                <TabsTrigger value="codebases" className="text-xs gap-1">
                  <FolderCode className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Code</span>
                </TabsTrigger>
                <TabsTrigger value="ideas" className="text-xs gap-1">
                  <Lightbulb className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Ideas</span>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4 mt-4">
                <ClawStatCards />
                <ClawBriefingCard />
                <ClawLiveFeed />
              </TabsContent>

              <TabsContent value="tasks" className="mt-4">
                <ClawTasksPanel />
              </TabsContent>

              <TabsContent value="schedules" className="mt-4">
                <ClawSchedulesPanel />
              </TabsContent>

              <TabsContent value="codebases" className="mt-4">
                <ClawCodebasesPanel />
              </TabsContent>

              <TabsContent value="ideas" className="mt-4">
                <ClawInitiativesPanel />
              </TabsContent>
            </Tabs>
          </div>

          {/* Desktop: Grid layout */}
          <div className="hidden lg:block space-y-4 mt-4">
            <ClawStatCards />

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-4">
                <ClawBriefingCard />
                <ClawLiveFeed />
              </div>
              <div className="space-y-4">
                <ClawTasksPanel />
                <ClawSchedulesPanel />
                <ClawCodebasesPanel />
              </div>
            </div>

            <ClawInitiativesPanel />
          </div>
        </>
      )}
    </div>
  );
}
