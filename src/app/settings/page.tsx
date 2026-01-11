"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Key, Palette, Keyboard, Download, Settings as SettingsIcon, Bot, FileText, Server, Search, Brain, Shield, BarChart3, Plug } from "lucide-react";
import { ApiKeysSettings } from "@/components/settings/api-keys-settings";
import { ThemeSettings } from "@/components/settings/theme-settings";
import { KeyboardShortcutsSettings } from "@/components/settings/keyboard-shortcuts-settings";
import { ExportImportSettings } from "@/components/settings/export-import-settings";
import { GeneralSettings } from "@/components/settings/general-settings";
import { AgentsSettings } from "@/components/settings/agents-settings";
import { PromptsSettings } from "@/components/settings/prompts-settings";
import { LocalModelsSettings } from "@/components/settings/local-models-settings";
import { MemorySettings } from "@/components/settings/memory-settings";
import { TrustDashboard } from "@/components/settings/trust-dashboard";
import { UsageAnalytics } from "@/components/settings/usage-analytics";
import { ConnectorsSettings } from "@/components/settings/connectors-settings";
import { WorkflowSettings } from "@/components/settings/workflow-settings";
import { ModelAliasSettings } from "@/components/settings/model-alias-settings";
import { McpMarketplace } from "@/components/settings/mcp-marketplace";
import { useApiKeysStore } from "@/stores/api-keys-store";
import { useSettingsStore } from "@/stores/settings-store";

export default function SettingsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("general");
  const [searchQuery, setSearchQuery] = useState("");
  const { loadKeys, isLoaded: keysLoaded } = useApiKeysStore();
  const { loadSettings, isLoaded: settingsLoaded } = useSettingsStore();

  useEffect(() => {
    if (!settingsLoaded) loadSettings();
    if (!keysLoaded) loadKeys();
  }, [settingsLoaded, keysLoaded, loadSettings, loadKeys]);

  useEffect(() => {
    const tabParam = new URLSearchParams(window.location.search).get("tab");
    if (!tabParam) return;
    const allowedTabs = ["general", "api-keys", "local-models", "memory", "theme", "shortcuts", "data", "agents", "prompts", "trust", "analytics", "connectors", "aliases"];
    if (allowedTabs.includes(tabParam)) setActiveTab(tabParam);
  }, []);

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="border-b">
        <div className="container max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push("/")}
              className="shrink-0"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Settings</h1>
              <p className="text-sm text-muted-foreground">
                Manage your preferences and configuration
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="container max-w-5xl mx-auto px-6 py-8">
          {/* Search */}
          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search settings..."
                className="pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="flex flex-wrap gap-1 h-auto p-1 mb-8">
              <TabsTrigger value="general" className="gap-1.5 text-xs">
                <SettingsIcon className="h-3.5 w-3.5" />
                General
              </TabsTrigger>
              <TabsTrigger value="connectors" className="gap-1.5 text-xs">
                <Plug className="h-3.5 w-3.5" />
                Connectors
              </TabsTrigger>
              <TabsTrigger value="mcp" className="gap-1.5 text-xs">
                <Plug className="h-3.5 w-3.5" />
                Plugins
              </TabsTrigger>
              <TabsTrigger value="api-keys" className="gap-1.5 text-xs">
                <Key className="h-3.5 w-3.5" />
                API Keys
              </TabsTrigger>
              <TabsTrigger value="local-models" className="gap-1.5 text-xs">
                <Server className="h-3.5 w-3.5" />
                Local
              </TabsTrigger>
              <TabsTrigger value="memory" className="gap-1.5 text-xs">
                <Brain className="h-3.5 w-3.5" />
                Memory
              </TabsTrigger>
              <TabsTrigger value="theme" className="gap-1.5 text-xs">
                <Palette className="h-3.5 w-3.5" />
                Theme
              </TabsTrigger>
              <TabsTrigger value="shortcuts" className="gap-1.5 text-xs">
                <Keyboard className="h-3.5 w-3.5" />
                Shortcuts
              </TabsTrigger>
              <TabsTrigger value="agents" className="gap-1.5 text-xs">
                <Bot className="h-3.5 w-3.5" />
                Agents
              </TabsTrigger>
              <TabsTrigger value="prompts" className="gap-1.5 text-xs">
                <FileText className="h-3.5 w-3.5" />
                Prompts
              </TabsTrigger>
              <TabsTrigger value="data" className="gap-1.5 text-xs">
                <Download className="h-3.5 w-3.5" />
                Data
              </TabsTrigger>
              <TabsTrigger value="trust" className="gap-1.5 text-xs">
                <Shield className="h-3.5 w-3.5" />
                Trust
              </TabsTrigger>
              <TabsTrigger value="analytics" className="gap-1.5 text-xs">
                <BarChart3 className="h-3.5 w-3.5" />
                Analytics
              </TabsTrigger>
              <TabsTrigger value="workflows" className="gap-1.5 text-xs">
                <div className="h-3.5 w-3.5 rounded bg-pink-500/20 text-pink-500 flex items-center justify-center text-[9px] font-bold">W</div>
                Workflows
              </TabsTrigger>
              <TabsTrigger value="aliases" className="gap-1.5 text-xs">
                <SettingsIcon className="h-3.5 w-3.5" />
                Aliases
              </TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="space-y-6">
              <GeneralSettings />
            </TabsContent>

            <TabsContent value="connectors" className="space-y-6">
              <ConnectorsSettings />
            </TabsContent>

            <TabsContent value="mcp" className="space-y-6">
              <McpMarketplace />
            </TabsContent>

            <TabsContent value="api-keys" className="space-y-6">
              <ApiKeysSettings />
            </TabsContent>

            <TabsContent value="local-models" className="space-y-6">
              <LocalModelsSettings />
            </TabsContent>

            <TabsContent value="memory" className="space-y-6">
              <MemorySettings />
            </TabsContent>

            <TabsContent value="theme" className="space-y-6">
              <ThemeSettings />
            </TabsContent>

            <TabsContent value="shortcuts" className="space-y-6">
              <KeyboardShortcutsSettings />
            </TabsContent>

            <TabsContent value="agents" className="space-y-6">
              <AgentsSettings />
            </TabsContent>

            <TabsContent value="prompts" className="space-y-6">
              <PromptsSettings />
            </TabsContent>

            <TabsContent value="data" className="space-y-6">
              <ExportImportSettings />
            </TabsContent>

            <TabsContent value="trust" className="space-y-6">
              <TrustDashboard />
            </TabsContent>

            <TabsContent value="analytics" className="space-y-6">
              <UsageAnalytics />
            </TabsContent>

            <TabsContent value="workflows" className="space-y-6">
              <WorkflowSettings />
            </TabsContent>

            <TabsContent value="aliases" className="space-y-6">
              <ModelAliasSettings />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
