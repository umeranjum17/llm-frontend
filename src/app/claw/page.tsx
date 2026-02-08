"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, Settings, LayoutDashboard, ListTodo, Calendar, Activity, Wrench, Lightbulb, Package, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LuminaSystemOverview } from "@/components/lumina/lumina-system-overview";
import { LuminaActionRequired } from "@/components/lumina/lumina-action-required";
import { LuminaIntelligence } from "@/components/lumina/lumina-intelligence";
import { LuminaLiveFeed } from "@/components/lumina/lumina-live-feed";
import { LuminaHistory } from "@/components/lumina/lumina-history";
import { LuminaTasksTab } from "@/components/lumina/lumina-tasks-tab";
import { LuminaSchedulesTab } from "@/components/lumina/lumina-schedules-tab";
import { LuminaTracesTab } from "@/components/lumina/lumina-traces-tab";
import { LuminaToolCallsTab } from "@/components/lumina/lumina-tool-calls-tab";
import { LuminaInitiativesTab } from "@/components/lumina/lumina-initiatives-tab";
import { LuminaControlTab } from "@/components/lumina/lumina-control-tab";
import { LuminaSkillsTab } from "@/components/lumina/lumina-skills-tab";
import LuminaConfigTab from "@/components/lumina/lumina-config-tab";
import { LuminaWorkspacesTab } from "@/components/lumina/lumina-workspaces-tab";
import { useLuminaStore } from "@/stores/lumina-store";

export default function LuminaDashboardPage() {
  const isConnected = useLuminaStore((s) => s.isConnected);
  const didInit = useRef(false);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    const { isConnected: connected, initFromSettings, refreshAll } = useLuminaStore.getState();
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
          <h1 className="text-lg font-semibold">Lumina</h1>
        </div>
        <Button variant="ghost" size="sm" className="h-8" asChild>
          <Link href="/settings?tab=lumina">
            <Settings className="h-4 w-4 lg:mr-1.5" />
            <span className="hidden lg:inline">Settings</span>
          </Link>
        </Button>
      </div>

      {!isConnected ? (
        <div className="rounded-lg border bg-card py-16 text-center">
          <p className="text-sm text-muted-foreground">
            Not connected to Lumina.{" "}
            <Link href="/settings?tab=lumina" className="underline">
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
            <TabsTrigger value="workspaces" className="gap-1.5 text-xs sm:text-sm">
              <FolderOpen className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Workspaces</span>
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
            <LuminaSystemOverview />
            <LuminaActionRequired />
            <LuminaIntelligence />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
              <LuminaLiveFeed />
              <LuminaHistory />
            </div>
          </TabsContent>

          <TabsContent value="workspaces">
            <LuminaWorkspacesTab />
          </TabsContent>

          <TabsContent value="tasks">
            <LuminaTasksTab />
          </TabsContent>

          <TabsContent value="schedules">
            <LuminaSchedulesTab />
          </TabsContent>

          <TabsContent value="traces">
            <LuminaTracesTab />
          </TabsContent>

          <TabsContent value="tool-calls">
            <LuminaToolCallsTab />
          </TabsContent>

          <TabsContent value="initiatives">
            <LuminaInitiativesTab />
          </TabsContent>

          <TabsContent value="skills">
            <LuminaSkillsTab />
          </TabsContent>

          <TabsContent value="control">
            <LuminaControlTab />
          </TabsContent>

          <TabsContent value="config">
            <LuminaConfigTab />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
