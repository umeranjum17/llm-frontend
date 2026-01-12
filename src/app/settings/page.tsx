"use client";

import { useEffect, useState, Suspense } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Key, Palette, Keyboard, Download, Settings as SettingsIcon, Bot, FileText, Server, Search, Brain, Shield, BarChart3, Plug, Loader2 } from "lucide-react";
import { useApiKeysStore } from "@/stores/api-keys-store";
import { useSettingsStore } from "@/stores/settings-store";

// Lazy load heavy settings components for faster initial page load
const LoadingSpinner = () => (
  <div className="flex items-center justify-center py-12">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

// Core settings (loaded immediately for fast initial view)
import { GeneralSettings } from "@/components/settings/general-settings";
import { ApiKeysSettings } from "@/components/settings/api-keys-settings";
import { ThemeSettings } from "@/components/settings/theme-settings";

// Heavy components (lazy loaded on demand)
const KeyboardShortcutsSettings = dynamic(() => import("@/components/settings/keyboard-shortcuts-settings").then(m => ({ default: m.KeyboardShortcutsSettings })), { loading: LoadingSpinner });
const ExportImportSettings = dynamic(() => import("@/components/settings/export-import-settings").then(m => ({ default: m.ExportImportSettings })), { loading: LoadingSpinner });
const AgentsSettings = dynamic(() => import("@/components/settings/agents-settings").then(m => ({ default: m.AgentsSettings })), { loading: LoadingSpinner });
const PromptsSettings = dynamic(() => import("@/components/settings/prompts-settings").then(m => ({ default: m.PromptsSettings })), { loading: LoadingSpinner });
const LocalModelsSettings = dynamic(() => import("@/components/settings/local-models-settings").then(m => ({ default: m.LocalModelsSettings })), { loading: LoadingSpinner });
const MemorySettings = dynamic(() => import("@/components/settings/memory-settings").then(m => ({ default: m.MemorySettings })), { loading: LoadingSpinner });
const TrustDashboard = dynamic(() => import("@/components/settings/trust-dashboard").then(m => ({ default: m.TrustDashboard })), { loading: LoadingSpinner });
const UsageAnalytics = dynamic(() => import("@/components/settings/usage-analytics").then(m => ({ default: m.UsageAnalytics })), { loading: LoadingSpinner });
const ConnectorsSettings = dynamic(() => import("@/components/settings/connectors-settings").then(m => ({ default: m.ConnectorsSettings })), { loading: LoadingSpinner });
const WorkflowSettings = dynamic(() => import("@/components/settings/workflow-settings").then(m => ({ default: m.WorkflowSettings })), { loading: LoadingSpinner });
const ModelAliasSettings = dynamic(() => import("@/components/settings/model-alias-settings").then(m => ({ default: m.ModelAliasSettings })), { loading: LoadingSpinner });
const McpMarketplace = dynamic(() => import("@/components/settings/mcp-marketplace").then(m => ({ default: m.McpMarketplace })), { loading: LoadingSpinner });

export default function SettingsPage() {
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
            <Link href="/" prefetch>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
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
      <div className="flex-1 overflow-y-scroll">
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
            <TabsList className="flex flex-wrap justify-start gap-1 h-auto p-1.5 mb-8 w-full">
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
