"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, Settings, LayoutDashboard, ListTodo, Calendar, Activity, Wrench, Lightbulb, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClawSystemOverview } from "@/components/claw/claw-system-overview";
import { ClawActionRequired } from "@/components/claw/claw-action-required";
import { ClawIntelligence } from "@/components/claw/claw-intelligence";
import { ClawLiveFeed } from "@/components/claw/claw-live-feed";
import { ClawHistory } from "@/components/claw/claw-history";
import { ClawTasksTab } from "@/components/claw/claw-tasks-tab";
import { ClawSchedulesTab } from "@/components/claw/claw-schedules-tab";
import { ClawTracesTab } from "@/components/claw/claw-traces-tab";
import { ClawToolCallsTab } from "@/components/claw/claw-tool-calls-tab";
import { ClawInitiativesTab } from "@/components/claw/claw-initiatives-tab";
import { ClawControlTab } from "@/components/claw/claw-control-tab";
import { ClawSkillsTab } from "@/components/claw/claw-skills-tab";
import ClawConfigTab from "@/components/claw/claw-config-tab";
import { useClawStore } from "@/stores/claw-store";

export default function ClawDashboardPage() {
  const isConnected = useClawStore((s) => s.isConnected);
  const didInit = useRef(false);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    const { isConnected: connected, initFromSettings, refreshAll } = useClawStore.getState();
    if (!connected) {
      void initFromSettings();
    } else {
      void refreshAll();
    }
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-3 sm:px-4 py-3 sm:py-4 lg:py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
            <Link href="/">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-lg font-semibold">Claw</h1>
        </div>
        <Button variant="ghost" size="sm" className="h-8" asChild>
          <Link href="/settings?tab=claw">
            <Settings className="h-4 w-4 lg:mr-1.5" />
            <span className="hidden lg:inline">Settings</span>
          </Link>
        </Button>
      </div>

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
        <Tabs defaultValue="overview" className="space-y-3 sm:space-y-4">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="overview" className="gap-1.5 text-xs sm:text-sm">
              <LayoutDashboard className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Overview</span>
            </TabsTrigger>
            <TabsTrigger value="tasks" className="gap-1.5 text-xs sm:text-sm">
              <ListTodo className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Tasks</span>
            </TabsTrigger>
            <TabsTrigger value="schedules" className="gap-1.5 text-xs sm:text-sm">
              <Calendar className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Schedules</span>
            </TabsTrigger>
            <TabsTrigger value="traces" className="gap-1.5 text-xs sm:text-sm">
              <Activity className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Traces</span>
            </TabsTrigger>
            <TabsTrigger value="tool-calls" className="gap-1.5 text-xs sm:text-sm">
              <Wrench className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Tool Calls</span>
            </TabsTrigger>
            <TabsTrigger value="initiatives" className="gap-1.5 text-xs sm:text-sm">
              <Lightbulb className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Initiatives</span>
            </TabsTrigger>
            <TabsTrigger value="skills" className="gap-1.5 text-xs sm:text-sm">
              <Package className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Skills</span>
            </TabsTrigger>
            <TabsTrigger value="control" className="gap-1.5 text-xs sm:text-sm">
              <Wrench className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Control</span>
            </TabsTrigger>
            <TabsTrigger value="config" className="gap-1.5 text-xs sm:text-sm">
              <Settings className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Config</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-3 sm:space-y-4">
            <ClawSystemOverview />
            <ClawActionRequired />
            <ClawIntelligence />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
              <ClawLiveFeed />
              <ClawHistory />
            </div>
          </TabsContent>

          <TabsContent value="tasks">
            <ClawTasksTab />
          </TabsContent>

          <TabsContent value="schedules">
            <ClawSchedulesTab />
          </TabsContent>

          <TabsContent value="traces">
            <ClawTracesTab />
          </TabsContent>

          <TabsContent value="tool-calls">
            <ClawToolCallsTab />
          </TabsContent>

          <TabsContent value="initiatives">
            <ClawInitiativesTab />
          </TabsContent>

          <TabsContent value="skills">
            <ClawSkillsTab />
          </TabsContent>

          <TabsContent value="control">
            <ClawControlTab />
          </TabsContent>

          <TabsContent value="config">
            <ClawConfigTab />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
