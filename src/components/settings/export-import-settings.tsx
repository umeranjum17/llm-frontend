"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, Upload, AlertTriangle, FileJson, FileText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { db } from "@/lib/db/schema";
import { deleteAllChats } from "@/lib/db/queries";

export function ExportImportSettings() {
  const [exportFormat, setExportFormat] = useState<"json" | "csv">("json");
  const [exportScope, setExportScope] = useState<"all" | "chats" | "settings">("all");
  const [importing, setImporting] = useState(false);

  const handleExport = async () => {
    try {
      let data: any = {};

      // Export based on scope
      if (exportScope === "all" || exportScope === "chats") {
        const chats = await db.chats.toArray();
        const messages = await db.messages.toArray();
        const projects = await db.projects.toArray();
        const projectFiles = await db.projectFiles.toArray();
        const agents = await db.agents.toArray();
        const prompts = await db.prompts.toArray();

        data.chats = chats;
        data.messages = messages;
        data.projects = projects;
        data.projectFiles = projectFiles;
        data.agents = agents;
        data.prompts = prompts;
      }

      if (exportScope === "all" || exportScope === "settings") {
        const settings = await db.settings.toArray();
        const modelFavorites = await db.modelFavorites.toArray();
        const folders = await db.folders.toArray();

        data.settings = settings;
        data.modelFavorites = modelFavorites;
        data.folders = folders;
      }

      // Create blob and download
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lumina-export-${Date.now()}.${exportFormat}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Data exported successfully");
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Failed to export data");
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      // Validate data structure
      if (!data || typeof data !== "object") {
        throw new Error("Invalid data format");
      }

      // Import data
      if (data.chats) await db.chats.bulkPut(data.chats);
      if (data.messages) await db.messages.bulkPut(data.messages);
      if (data.projects) await db.projects.bulkPut(data.projects);
      if (data.projectFiles) await db.projectFiles.bulkPut(data.projectFiles);
      if (data.agents) await db.agents.bulkPut(data.agents);
      if (data.prompts) await db.prompts.bulkPut(data.prompts);
      if (data.settings) await db.settings.bulkPut(data.settings);
      if (data.modelFavorites) await db.modelFavorites.bulkPut(data.modelFavorites);
      if (data.folders) await db.folders.bulkPut(data.folders);

      toast.success("Data imported successfully");

      // Reload page to refresh all data
      setTimeout(() => window.location.reload(), 1000);
    } catch (error) {
      console.error("Import error:", error);
      toast.error("Failed to import data. Please check the file format.");
    } finally {
      setImporting(false);
    }
  };

  const handleDeleteAllChats = async () => {
    if (
      !confirm(
        "Are you sure you want to delete all chats? This will remove all conversations but keep your settings."
      )
    ) {
      return;
    }

    try {
      await deleteAllChats();
      toast.success("All chats deleted");
      setTimeout(() => window.location.reload(), 1000);
    } catch (error) {
      console.error("Delete chats error:", error);
      toast.error("Failed to delete chats");
    }
  };

  const handleClearAllData = async () => {
    if (
      !confirm(
        "Are you sure you want to delete ALL data? This action cannot be undone!"
      )
    ) {
      return;
    }

    try {
      await db.delete();
      await db.open();
      toast.success("All data cleared");
      setTimeout(() => window.location.reload(), 1000);
    } catch (error) {
      console.error("Clear data error:", error);
      toast.error("Failed to clear data");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Export & Import</h3>
        <p className="text-sm text-muted-foreground">
          Backup your data or import from another device
        </p>
      </div>

      {/* Export Section */}
      <div className="space-y-4 p-4 border rounded-lg">
        <h4 className="font-medium flex items-center gap-2">
          <Download className="h-4 w-4" />
          Export Data
        </h4>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="export-scope">What to export</Label>
            <Select value={exportScope} onValueChange={(v: any) => setExportScope(v)}>
              <SelectTrigger id="export-scope">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Everything</SelectItem>
                <SelectItem value="chats">Chats & Messages only</SelectItem>
                <SelectItem value="settings">Settings only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="export-format">Format</Label>
            <Select value={exportFormat} onValueChange={(v: any) => setExportFormat(v)}>
              <SelectTrigger id="export-format">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="json">
                  <div className="flex items-center gap-2">
                    <FileJson className="h-4 w-4" />
                    JSON (Recommended)
                  </div>
                </SelectItem>
                <SelectItem value="csv" disabled>
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    CSV (Coming soon)
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button onClick={handleExport} className="w-full">
            <Download className="h-4 w-4 mr-2" />
            Export Data
          </Button>
        </div>
      </div>

      {/* Import Section */}
      <div className="space-y-4 p-4 border rounded-lg">
        <h4 className="font-medium flex items-center gap-2">
          <Upload className="h-4 w-4" />
          Import Data
        </h4>

        <div className="space-y-3">
          <div className="flex items-start gap-2 p-3 border rounded-md bg-muted/50">
            <AlertTriangle className="h-4 w-4 mt-0.5 text-yellow-600" />
            <p className="text-xs text-muted-foreground">
              Importing will merge with existing data. Duplicate IDs will be replaced.
            </p>
          </div>

          <Label
            htmlFor="import-file"
            className="flex items-center justify-center gap-2 p-4 border-2 border-dashed rounded-lg cursor-pointer hover:bg-accent transition-colors"
          >
            <Upload className="h-5 w-5" />
            <span>{importing ? "Importing..." : "Click to select file"}</span>
            <Input
              id="import-file"
              type="file"
              accept=".json"
              onChange={handleImport}
              disabled={importing}
              className="hidden"
            />
          </Label>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="space-y-4 p-4 border border-destructive rounded-lg">
        <h4 className="font-medium flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-4 w-4" />
          Danger Zone
        </h4>

        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Delete all chat conversations but keep your settings and preferences.
            </p>
            <Button
              variant="outline"
              onClick={handleDeleteAllChats}
              className="w-full border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete All Chats
            </Button>
          </div>

          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Permanently delete all data from this device. This action cannot be undone.
            </p>
            <Button
              variant="destructive"
              onClick={handleClearAllData}
              className="w-full"
            >
              Clear All Data
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
