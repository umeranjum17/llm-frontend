"use client";

import { useEffect, useState, Suspense } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Key, Palette, Keyboard, Download, Settings as SettingsIcon, Bot, Search, Brain, BarChart3, Loader2, Wand2, Cloud, Shield } from "lucide-react";
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
const SkillsSettings = dynamic(() => import("@/components/settings/skills-settings").then(m => ({ default: m.SkillsSettings })), { loading: LoadingSpinner });
const MemorySettings = dynamic(() => import("@/components/settings/memory-settings").then(m => ({ default: m.MemorySettings })), { loading: LoadingSpinner });
const TrustDashboard = dynamic(() => import("@/components/settings/trust-dashboard").then(m => ({ default: m.TrustDashboard })), { loading: LoadingSpinner });
const UsageAnalytics = dynamic(() => import("@/components/settings/usage-analytics").then(m => ({ default: m.UsageAnalytics })), { loading: LoadingSpinner });
const ModelAliasSettings = dynamic(() => import("@/components/settings/model-alias-settings").then(m => ({ default: m.ModelAliasSettings })), { loading: LoadingSpinner });
const ComposioAppsSection = dynamic(() => import("@/components/settings/composio-apps-section").then(m => ({ default: m.ComposioAppsSection })), { loading: LoadingSpinner });
const SyncSettings = dynamic(() => import("@/components/settings/sync-settings").then(m => ({ default: m.SyncSettings })), { loading: LoadingSpinner });
const ClawSettings = dynamic(() => import("@/components/settings/claw-settings").then(m => ({ default: m.ClawSettings })), { loading: LoadingSpinner });

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState("general");
  const [searchQuery, setSearchQuery] = useState("");
  const { loadKeys, isLoaded: keysLoaded } = useApiKeysStore();
  const { loadSettings, isLoaded: settingsLoaded } = useSettingsStore();

  useEffect(() => {
    const initAndLoad = async () => {
      // Initialize device secret first (ensures encryption key is in IndexedDB)
      try {
        const { initializeDeviceSecret } = await import("@/lib/crypto/api-key-crypto");
        await initializeDeviceSecret();
      } catch (error) {
        console.warn("[Settings] Error initializing device secret:", error);
      }

      if (!settingsLoaded) loadSettings();
      if (!keysLoaded) loadKeys();
    };

    initAndLoad();
  }, [settingsLoaded, keysLoaded, loadSettings, loadKeys]);

  useEffect(() => {
    const tabParam = new URLSearchParams(window.location.search).get("tab");
    if (!tabParam) return;
    const allowedTabs = ["general", "mcp", "api-keys", "memory", "theme", "shortcuts", "data", "sync", "agents", "skills", "trust", "analytics", "aliases", "claw"];
    if (allowedTabs.includes(tabParam)) setActiveTab(tabParam);
  }, []);

  return (
    <div className="h-[100dvh] flex flex-col">
      {/* Header */}
      <div className="border-b">
        <div className="container max-w-5xl mx-auto px-3 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center gap-3 sm:gap-4">
            <Link href="/" prefetch>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 h-8 w-8 sm:h-10 sm:w-10"
              >
                <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold">Settings</h1>
              <p className="text-xs sm:text-sm text-muted-foreground">
                Manage your preferences and configuration
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-scroll">
        <div className="container max-w-5xl mx-auto px-3 sm:px-6 py-4 sm:py-8 pb-20 sm:pb-8">
          {/* Search */}
          <div className="mb-4 sm:mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search settings..."
                className="pl-9 h-9 sm:h-10 text-sm"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="relative flex overflow-x-auto sm:flex-wrap sm:justify-start gap-1 h-auto p-1 sm:p-1.5 mb-4 sm:mb-8 w-full scrollbar-none z-10">
              <TabsTrigger value="general" className="gap-1.5 text-xs shrink-0 px-2 sm:px-3">
                <SettingsIcon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">General</span>
              </TabsTrigger>
              <TabsTrigger value="mcp" className="gap-1.5 text-xs shrink-0 px-2 sm:px-3">
                <SettingsIcon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Plugins</span>
              </TabsTrigger>
              <TabsTrigger value="api-keys" className="gap-1.5 text-xs shrink-0 px-2 sm:px-3">
                <Key className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">API Keys</span>
              </TabsTrigger>
              <TabsTrigger value="memory" className="gap-1.5 text-xs shrink-0 px-2 sm:px-3">
                <Brain className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Memory</span>
              </TabsTrigger>
              <TabsTrigger value="theme" className="gap-1.5 text-xs shrink-0 px-2 sm:px-3">
                <Palette className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Theme</span>
              </TabsTrigger>
              <TabsTrigger value="shortcuts" className="gap-1.5 text-xs shrink-0 px-2 sm:px-3">
                <Keyboard className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Shortcuts</span>
              </TabsTrigger>
              <TabsTrigger value="agents" className="gap-1.5 text-xs shrink-0 px-2 sm:px-3">
                <Bot className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Agents</span>
              </TabsTrigger>
              <TabsTrigger value="skills" className="gap-1.5 text-xs shrink-0 px-2 sm:px-3">
                <Wand2 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Skills</span>
              </TabsTrigger>
              <TabsTrigger value="data" className="gap-1.5 text-xs shrink-0 px-2 sm:px-3">
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Data</span>
              </TabsTrigger>
              <TabsTrigger value="sync" className="gap-1.5 text-xs shrink-0 px-2 sm:px-3">
                <Cloud className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Sync</span>
              </TabsTrigger>
              <TabsTrigger value="trust" className="gap-1.5 text-xs shrink-0 px-2 sm:px-3">
                <Shield className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Trust</span>
              </TabsTrigger>
              <TabsTrigger value="analytics" className="gap-1.5 text-xs shrink-0 px-2 sm:px-3">
                <BarChart3 className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Analytics</span>
              </TabsTrigger>
              <TabsTrigger value="aliases" className="gap-1.5 text-xs shrink-0 px-2 sm:px-3">
                <SettingsIcon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Aliases</span>
              </TabsTrigger>
              <TabsTrigger value="claw" className="gap-1.5 text-xs shrink-0 px-2 sm:px-3">
                <Bot className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Claw</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="space-y-6">
              <GeneralSettings />
            </TabsContent>

            <TabsContent value="mcp" className="space-y-6">
              <ComposioAppsSection />
            </TabsContent>

            <TabsContent value="api-keys" className="space-y-6">
              <ApiKeysSettings />
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

            <TabsContent value="skills" className="space-y-6">
              <SkillsSettings />
            </TabsContent>

            <TabsContent value="data" className="space-y-6">
              <ExportImportSettings />
            </TabsContent>

            <TabsContent value="sync" className="space-y-6">
              <SyncSettings />
            </TabsContent>

            <TabsContent value="trust" className="space-y-6">
              <TrustDashboard />
            </TabsContent>

            <TabsContent value="analytics" className="space-y-6">
              <UsageAnalytics />
            </TabsContent>

            <TabsContent value="aliases" className="space-y-6">
              <ModelAliasSettings />
            </TabsContent>

            <TabsContent value="claw" className="space-y-6">
              <ClawSettings />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
