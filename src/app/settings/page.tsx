"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Key, Palette, Keyboard, Download, Settings as SettingsIcon } from "lucide-react";
import { ApiKeysSettings } from "@/components/settings/api-keys-settings";
import { ThemeSettings } from "@/components/settings/theme-settings";
import { KeyboardShortcutsSettings } from "@/components/settings/keyboard-shortcuts-settings";
import { ExportImportSettings } from "@/components/settings/export-import-settings";
import { GeneralSettings } from "@/components/settings/general-settings";
import { useApiKeysStore } from "@/stores/api-keys-store";
import { useSettingsStore } from "@/stores/settings-store";

export default function SettingsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("general");
  const { loadKeys, isLoaded: keysLoaded } = useApiKeysStore();
  const { loadSettings, isLoaded: settingsLoaded } = useSettingsStore();

  useEffect(() => {
    if (!settingsLoaded) loadSettings();
    if (!keysLoaded) loadKeys();
  }, [settingsLoaded, keysLoaded, loadSettings, loadKeys]);

  useEffect(() => {
    const tabParam = new URLSearchParams(window.location.search).get("tab");
    if (!tabParam) return;
    const allowedTabs = ["general", "api-keys", "theme", "shortcuts", "data"];
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
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-5 mb-8">
              <TabsTrigger value="general" className="gap-2">
                <SettingsIcon className="h-4 w-4" />
                General
              </TabsTrigger>
              <TabsTrigger value="api-keys" className="gap-2">
                <Key className="h-4 w-4" />
                API Keys
              </TabsTrigger>
              <TabsTrigger value="theme" className="gap-2">
                <Palette className="h-4 w-4" />
                Theme
              </TabsTrigger>
              <TabsTrigger value="shortcuts" className="gap-2">
                <Keyboard className="h-4 w-4" />
                Shortcuts
              </TabsTrigger>
              <TabsTrigger value="data" className="gap-2">
                <Download className="h-4 w-4" />
                Data
              </TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="space-y-6">
              <GeneralSettings />
            </TabsContent>

            <TabsContent value="api-keys" className="space-y-6">
              <ApiKeysSettings />
            </TabsContent>

            <TabsContent value="theme" className="space-y-6">
              <ThemeSettings />
            </TabsContent>

            <TabsContent value="shortcuts" className="space-y-6">
              <KeyboardShortcutsSettings />
            </TabsContent>

            <TabsContent value="data" className="space-y-6">
              <ExportImportSettings />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
