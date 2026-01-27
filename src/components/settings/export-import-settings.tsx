"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Upload,
  AlertTriangle,
  Trash2,
  Download,
  Loader2,
  CheckCircle2,
  Database,
  RefreshCw,
  FileJson,
} from "lucide-react";
import { toast } from "sonner";
import { deleteAllChats } from "@/lib/db/queries";
import { checkMigration, forceMigration } from "@/lib/db/migration";
import { exportAllSettings, getExportSummary } from "@/lib/db/export-settings";
import {
  importSettings,
  validateSettingsExport,
  readFileAsText,
  getImportPreview,
  type ImportMode,
} from "@/lib/db/import-settings";

// Plain JSON Import Dialog
function JsonImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [isImporting, setIsImporting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ReturnType<typeof getImportPreview> | null>(null);
  const [importOptions, setImportOptions] = useState({
    importMcpServers: true,
    importAgents: true,
    importPrompts: true,
    importSettings: true,
    importModelFavorites: true,
    importModelAliases: true,
    importParameterPresets: true,
    importTags: true,
    importTagRules: true,
  });
  const [step, setStep] = useState<"select" | "configure">("select");
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setSelectedFile(null);
    setPreview(null);
    setStep("select");
    setError(null);
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const content = await readFileAsText(file);
      const parsed = JSON.parse(content);

      if (!validateSettingsExport(parsed)) {
        setError("Invalid file format. Please select a valid Lumina data export.");
        return;
      }

      const previewData = getImportPreview(parsed);
      setPreview(previewData);
      setSelectedFile(file);
      setStep("configure");
      setError(null);
    } catch {
      setError("Failed to read file. Make sure it's a valid JSON file.");
    }
  };

  const handleImport = async () => {
    if (!selectedFile) return;

    setIsImporting(true);
    try {
      const content = await readFileAsText(selectedFile);
      const parsed = JSON.parse(content);

      if (!validateSettingsExport(parsed)) {
        setError("Invalid file format");
        setIsImporting(false);
        return;
      }

      const result = await importSettings(parsed, {
        mode: "merge" as ImportMode,
        importApiKeys: false, // API keys are handled separately
        ...importOptions,
      });

      if (result.success) {
        const totalImported =
          result.imported.mcpServers +
          result.imported.agents +
          result.imported.prompts +
          result.imported.modelFavorites +
          result.imported.tags +
          (result.imported.settings ? 1 : 0);

        toast.success(`Successfully imported ${totalImported} items`);
        onOpenChange(false);
        resetState();
        window.location.reload();
      } else {
        toast.error(`Import completed with ${result.errors.length} errors`);
        console.error("Import errors:", result.errors);
      }
    } catch (error) {
      toast.error("Failed to import data");
      console.error(error);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) resetState();
        onOpenChange(isOpen);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Import Data
          </DialogTitle>
          <DialogDescription>
            {step === "select" && "Select a JSON export file"}
            {step === "configure" && "Choose what to import"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">
              {error}
            </div>
          )}

          {step === "select" && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileSelect}
                className="hidden"
              />
              <Button
                variant="outline"
                className="w-full h-20 border-dashed"
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="flex flex-col items-center gap-2">
                  <Upload className="h-6 w-6 text-muted-foreground" />
                  <span className="text-sm">Select JSON file</span>
                </div>
              </Button>
              <p className="text-xs text-muted-foreground">
                Import settings, agents, prompts, and MCP servers from a previous export.
                API keys are not included in data exports.
              </p>
            </>
          )}

          {step === "configure" && preview && (
            <>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                {selectedFile?.name}
              </div>

              <div className="rounded-lg border bg-muted/50 p-3 text-sm">
                <div className="font-medium mb-2">File contains:</div>
                <div className="grid grid-cols-2 gap-1 text-muted-foreground">
                  {preview.mcpServers > 0 && <div>{preview.mcpServers} MCP servers</div>}
                  {preview.agents > 0 && <div>{preview.agents} agents</div>}
                  {preview.prompts > 0 && <div>{preview.prompts} prompts</div>}
                  {preview.modelFavorites > 0 && <div>{preview.modelFavorites} favorites</div>}
                  {preview.tags > 0 && <div>{preview.tags} tags</div>}
                  {preview.hasSettings && <div>Settings</div>}
                </div>
                <div className="text-xs text-muted-foreground mt-2">
                  Exported {preview.exportedAt.toLocaleDateString()}
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium">Import:</div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={importOptions.importMcpServers}
                      onCheckedChange={(c) =>
                        setImportOptions((o) => ({ ...o, importMcpServers: !!c }))
                      }
                    />
                    MCP Servers
                  </label>
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={importOptions.importAgents}
                      onCheckedChange={(c) =>
                        setImportOptions((o) => ({ ...o, importAgents: !!c }))
                      }
                    />
                    Agents
                  </label>
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={importOptions.importPrompts}
                      onCheckedChange={(c) =>
                        setImportOptions((o) => ({ ...o, importPrompts: !!c }))
                      }
                    />
                    Prompts
                  </label>
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={importOptions.importSettings}
                      onCheckedChange={(c) =>
                        setImportOptions((o) => ({ ...o, importSettings: !!c }))
                      }
                    />
                    Settings
                  </label>
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={importOptions.importModelFavorites}
                      onCheckedChange={(c) =>
                        setImportOptions((o) => ({ ...o, importModelFavorites: !!c }))
                      }
                    />
                    Model Favorites
                  </label>
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={importOptions.importTags}
                      onCheckedChange={(c) =>
                        setImportOptions((o) => ({ ...o, importTags: !!c }))
                      }
                    />
                    Tags
                  </label>
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          {step === "select" && (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          )}
          {step === "configure" && (
            <>
              <Button variant="outline" onClick={() => setStep("select")}>
                Back
              </Button>
              <Button onClick={handleImport} disabled={isImporting}>
                {isImporting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                Import
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ExportImportSettings() {
  const [importOpen, setImportOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof getExportSummary>> | null>(null);

  // Migration state
  const [migrationStatus, setMigrationStatus] = useState<{
    needsMigration: boolean;
    currentVersion: number;
    targetVersion: number;
    message?: string;
  } | null>(null);
  const [isMigrating, setIsMigrating] = useState(false);

  useEffect(() => {
    checkMigrationStatus();
    loadSummary();
  }, []);

  const checkMigrationStatus = async () => {
    const status = await checkMigration();
    setMigrationStatus(status);
  };

  const loadSummary = async () => {
    const data = await getExportSummary();
    setSummary(data);
  };

  const handleMigration = async () => {
    setIsMigrating(true);
    try {
      await forceMigration();
      toast.success("Database migrated successfully! Reloading...");
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      toast.error("Migration failed. Please refresh the page manually.");
      console.error("[Migration] Error:", error);
      setIsMigrating(false);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      // Export WITHOUT API keys (plain JSON)
      const settings = await exportAllSettings({ includeApiKeys: false });
      const json = JSON.stringify(settings, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lumina-data-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Data exported successfully");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to export data");
    } finally {
      setIsExporting(false);
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

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Data Management</h3>
        <p className="text-sm text-muted-foreground">
          Export or import your settings and data
        </p>
      </div>

      {/* Database Migration Status - only show when needed */}
      {migrationStatus?.needsMigration && (
        <div className="space-y-4 p-4 border rounded-lg border-yellow-500/50 bg-yellow-500/5">
          <h4 className="font-medium flex items-center gap-2">
            <Database className="h-4 w-4 text-yellow-500" />
            Database Update Required
          </h4>

          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {migrationStatus.message || "A database update is available."}
            </p>
            <Button
              onClick={handleMigration}
              disabled={isMigrating}
              className="w-full"
              size="sm"
            >
              {isMigrating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Update Database
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Export Section */}
      <div className="space-y-4 p-4 border rounded-lg">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 shrink-0">
            <Download className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-medium">Export Data</h4>
            <p className="text-sm text-muted-foreground">
              Download your settings, agents, prompts, and MCP servers
            </p>
          </div>
        </div>
        {summary && (
          <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
            <span className="font-medium">Includes:</span>{" "}
            {[
              summary.agents > 0 && `${summary.agents} agents`,
              summary.prompts > 0 && `${summary.prompts} prompts`,
              summary.mcpServers > 0 && `${summary.mcpServers} MCP servers`,
              summary.modelFavorites > 0 && `${summary.modelFavorites} favorites`,
              summary.tags > 0 && `${summary.tags} tags`,
              summary.hasSettings && "settings",
            ]
              .filter(Boolean)
              .join(", ") || "No data to export"}
            <div className="mt-1 text-muted-foreground/70">
              API keys are not included. Transfer them separately from Settings &gt; API Keys.
            </div>
          </div>
        )}
        <Button onClick={handleExport} disabled={isExporting} className="w-full">
          {isExporting ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <FileJson className="h-4 w-4 mr-2" />
          )}
          Download JSON
        </Button>
      </div>

      {/* Import Section */}
      <div className="space-y-4 p-4 border rounded-lg">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted shrink-0">
            <Upload className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-medium">Import Data</h4>
            <p className="text-sm text-muted-foreground">
              Restore from a JSON export file
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={() => setImportOpen(true)} className="w-full">
          <Upload className="h-4 w-4 mr-2" />
          Select JSON File
        </Button>
      </div>

      <JsonImportDialog open={importOpen} onOpenChange={setImportOpen} />

      {/* Danger Zone */}
      <div className="space-y-4 p-4 border border-destructive/50 rounded-lg">
        <h4 className="font-medium flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-4 w-4" />
          Danger Zone
        </h4>

        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Delete all chat conversations. This cannot be undone.
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
      </div>
    </div>
  );
}
