"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useClawStore } from "@/stores/claw-store";
import type { LuminaConfig } from "@/lib/lumina/types";

interface EditableConfig {
  openrouterModel: string;
  pipelineIntervalMinutes: number;
  briefingEnabled: boolean;
  briefingTime: string;
  computerUseEnabled: boolean;
  playwrightBrowserEnabled: boolean;
  gitToolEnabled: boolean;
  systemToolEnabled: boolean;
  databaseToolEnabled: boolean;
  networkToolEnabled: boolean;
  mediaToolEnabled: boolean;
  dailyTokenBudget: number;
  emergencyStopEnabled: boolean;
}

interface ConfigFormState {
  openrouterModel: string;
  pipelineIntervalMinutes: string;
  briefingEnabled: boolean;
  briefingTime: string;
  computerUseEnabled: boolean;
  playwrightBrowserEnabled: boolean;
  gitToolEnabled: boolean;
  systemToolEnabled: boolean;
  databaseToolEnabled: boolean;
  networkToolEnabled: boolean;
  mediaToolEnabled: boolean;
  dailyTokenBudget: string;
  emergencyStopEnabled: boolean;
}

const EDITABLE_KEYS: Array<keyof EditableConfig> = [
  "openrouterModel",
  "pipelineIntervalMinutes",
  "briefingEnabled",
  "briefingTime",
  "computerUseEnabled",
  "playwrightBrowserEnabled",
  "gitToolEnabled",
  "systemToolEnabled",
  "databaseToolEnabled",
  "networkToolEnabled",
  "mediaToolEnabled",
  "dailyTokenBudget",
  "emergencyStopEnabled",
];

const DEFAULT_EDITABLE_CONFIG: EditableConfig = {
  openrouterModel: "",
  pipelineIntervalMinutes: 15,
  briefingEnabled: false,
  briefingTime: "",
  computerUseEnabled: false,
  playwrightBrowserEnabled: false,
  gitToolEnabled: false,
  systemToolEnabled: false,
  databaseToolEnabled: false,
  networkToolEnabled: false,
  mediaToolEnabled: false,
  dailyTokenBudget: 0,
  emergencyStopEnabled: false,
};

const toSafeNumber = (value: string | number | undefined, fallback: number) => {
  if (typeof value === "string" && value.trim() === "") return fallback;
  const next = typeof value === "number" ? value : Number(value);
  return Number.isFinite(next) ? next : fallback;
};

function normalizeConfig(config: LuminaConfig): EditableConfig {
  return {
    openrouterModel: config.openrouterModel ?? DEFAULT_EDITABLE_CONFIG.openrouterModel,
    pipelineIntervalMinutes: toSafeNumber(config.pipelineIntervalMinutes, DEFAULT_EDITABLE_CONFIG.pipelineIntervalMinutes),
    briefingEnabled: Boolean(config.briefingEnabled),
    briefingTime: typeof config.briefingTime === "string" ? config.briefingTime : DEFAULT_EDITABLE_CONFIG.briefingTime,
    computerUseEnabled: Boolean(config.computerUseEnabled),
    playwrightBrowserEnabled: Boolean(config.playwrightBrowserEnabled),
    gitToolEnabled: Boolean(config.gitToolEnabled),
    systemToolEnabled: Boolean(config.systemToolEnabled),
    databaseToolEnabled: Boolean(config.databaseToolEnabled),
    networkToolEnabled: Boolean(config.networkToolEnabled),
    mediaToolEnabled: Boolean(config.mediaToolEnabled),
    dailyTokenBudget: toSafeNumber(config.dailyTokenBudget, DEFAULT_EDITABLE_CONFIG.dailyTokenBudget),
    emergencyStopEnabled: Boolean(config.emergencyStopEnabled),
  };
}

function toFormState(config: EditableConfig): ConfigFormState {
  return {
    openrouterModel: config.openrouterModel,
    pipelineIntervalMinutes: String(config.pipelineIntervalMinutes),
    briefingEnabled: config.briefingEnabled,
    briefingTime: config.briefingTime,
    computerUseEnabled: config.computerUseEnabled,
    playwrightBrowserEnabled: config.playwrightBrowserEnabled,
    gitToolEnabled: config.gitToolEnabled,
    systemToolEnabled: config.systemToolEnabled,
    databaseToolEnabled: config.databaseToolEnabled,
    networkToolEnabled: config.networkToolEnabled,
    mediaToolEnabled: config.mediaToolEnabled,
    dailyTokenBudget: String(config.dailyTokenBudget),
    emergencyStopEnabled: config.emergencyStopEnabled,
  };
}

function toEditableConfig(form: ConfigFormState, initial: EditableConfig): EditableConfig {
  return {
    openrouterModel: form.openrouterModel,
    pipelineIntervalMinutes: toSafeNumber(form.pipelineIntervalMinutes, initial.pipelineIntervalMinutes),
    briefingEnabled: form.briefingEnabled,
    briefingTime: form.briefingTime,
    computerUseEnabled: form.computerUseEnabled,
    playwrightBrowserEnabled: form.playwrightBrowserEnabled,
    gitToolEnabled: form.gitToolEnabled,
    systemToolEnabled: form.systemToolEnabled,
    databaseToolEnabled: form.databaseToolEnabled,
    networkToolEnabled: form.networkToolEnabled,
    mediaToolEnabled: form.mediaToolEnabled,
    dailyTokenBudget: toSafeNumber(form.dailyTokenBudget, initial.dailyTokenBudget),
    emergencyStopEnabled: form.emergencyStopEnabled,
  };
}

export default function ClawConfigTab() {
  const client = useClawStore((s) => s.client);
  const isConnected = useClawStore((s) => s.isConnected);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [initialConfig, setInitialConfig] = useState<EditableConfig | null>(null);
  const [form, setForm] = useState<ConfigFormState>(toFormState(DEFAULT_EDITABLE_CONFIG));

  const loadConfig = useCallback(async () => {
    if (!client) return false;

    setLoading(true);
    try {
      const { config } = await client.getConfig();
      const normalized = normalizeConfig(config);
      setInitialConfig(normalized);
      setForm(toFormState(normalized));
      return true;
    } catch (error) {
      toast.error("Failed to load config", {
        description: (error as Error).message,
      });
      return false;
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    if (!client || !isConnected) return;
    void loadConfig();
  }, [client, isConnected, loadConfig]);

  const currentConfig = useMemo(() => {
    if (!initialConfig) return null;
    return toEditableConfig(form, initialConfig);
  }, [form, initialConfig]);

  const changedFields = useMemo(() => {
    if (!initialConfig || !currentConfig) return {} as Partial<LuminaConfig>;

    const changes: Partial<LuminaConfig> = {};
    for (const key of EDITABLE_KEYS) {
      if (currentConfig[key] !== initialConfig[key]) {
        changes[key] = currentConfig[key] as never;
      }
    }

    return changes;
  }, [currentConfig, initialConfig]);

  const hasChanges = Object.keys(changedFields).length > 0;

  const handleSave = async () => {
    if (!client || !currentConfig) return;

    if (!hasChanges) {
      toast.message("No changes to save");
      return;
    }

    setSaving(true);
    try {
      await client.updateConfig(changedFields);
      setInitialConfig(currentConfig);
      setForm(toFormState(currentConfig));
      toast.success("Config updated");
    } catch (error) {
      toast.error("Failed to update config", {
        description: (error as Error).message,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    const ok = await loadConfig();
    if (ok) {
      toast.success("Config reloaded");
    }
  };

  if (!isConnected || !client) {
    return (
      <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
        Connect to Claw first to edit configuration.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border bg-card p-4 sm:p-5 space-y-4">
        <div className="text-sm font-medium">Model</div>
        <div className="space-y-2">
          <Label htmlFor="claw-openrouter-model">OpenRouter Model</Label>
          <Input
            id="claw-openrouter-model"
            value={form.openrouterModel}
            onChange={(event) => setForm((prev) => ({ ...prev, openrouterModel: event.target.value }))}
            placeholder="openai/gpt-5-mini"
            disabled={loading || saving}
          />
        </div>
      </section>

      <section className="rounded-lg border bg-card p-4 sm:p-5 space-y-4">
        <div className="text-sm font-medium">Pipeline</div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="claw-pipeline-interval">Pipeline Interval (minutes)</Label>
            <Input
              id="claw-pipeline-interval"
              type="number"
              min={1}
              value={form.pipelineIntervalMinutes}
              onChange={(event) => setForm((prev) => ({ ...prev, pipelineIntervalMinutes: event.target.value }))}
              disabled={loading || saving}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="claw-briefing-time">Briefing Time</Label>
            <Input
              id="claw-briefing-time"
              value={form.briefingTime}
              onChange={(event) => setForm((prev) => ({ ...prev, briefingTime: event.target.value }))}
              placeholder="08:30"
              disabled={loading || saving}
            />
          </div>
        </div>
        <div className="flex items-center justify-between rounded-md border p-3">
          <Label htmlFor="claw-briefing-enabled" className="text-sm">Briefing Enabled</Label>
          <Switch
            id="claw-briefing-enabled"
            checked={form.briefingEnabled}
            onCheckedChange={(checked) => setForm((prev) => ({ ...prev, briefingEnabled: checked }))}
            disabled={loading || saving}
          />
        </div>
      </section>

      <section className="rounded-lg border bg-card p-4 sm:p-5 space-y-4">
        <div className="text-sm font-medium">Tools</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex items-center justify-between rounded-md border p-3">
            <Label htmlFor="claw-tool-computer-use" className="text-sm">Computer Use</Label>
            <Switch
              id="claw-tool-computer-use"
              checked={form.computerUseEnabled}
              onCheckedChange={(checked) => setForm((prev) => ({ ...prev, computerUseEnabled: checked }))}
              disabled={loading || saving}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <Label htmlFor="claw-tool-playwright" className="text-sm">Playwright Browser</Label>
            <Switch
              id="claw-tool-playwright"
              checked={form.playwrightBrowserEnabled}
              onCheckedChange={(checked) => setForm((prev) => ({ ...prev, playwrightBrowserEnabled: checked }))}
              disabled={loading || saving}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <Label htmlFor="claw-tool-git" className="text-sm">Git Tool</Label>
            <Switch
              id="claw-tool-git"
              checked={form.gitToolEnabled}
              onCheckedChange={(checked) => setForm((prev) => ({ ...prev, gitToolEnabled: checked }))}
              disabled={loading || saving}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <Label htmlFor="claw-tool-system" className="text-sm">System Tool</Label>
            <Switch
              id="claw-tool-system"
              checked={form.systemToolEnabled}
              onCheckedChange={(checked) => setForm((prev) => ({ ...prev, systemToolEnabled: checked }))}
              disabled={loading || saving}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <Label htmlFor="claw-tool-database" className="text-sm">Database Tool</Label>
            <Switch
              id="claw-tool-database"
              checked={form.databaseToolEnabled}
              onCheckedChange={(checked) => setForm((prev) => ({ ...prev, databaseToolEnabled: checked }))}
              disabled={loading || saving}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <Label htmlFor="claw-tool-network" className="text-sm">Network Tool</Label>
            <Switch
              id="claw-tool-network"
              checked={form.networkToolEnabled}
              onCheckedChange={(checked) => setForm((prev) => ({ ...prev, networkToolEnabled: checked }))}
              disabled={loading || saving}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3 sm:col-span-2">
            <Label htmlFor="claw-tool-media" className="text-sm">Media Tool</Label>
            <Switch
              id="claw-tool-media"
              checked={form.mediaToolEnabled}
              onCheckedChange={(checked) => setForm((prev) => ({ ...prev, mediaToolEnabled: checked }))}
              disabled={loading || saving}
            />
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-4 sm:p-5 space-y-4">
        <div className="text-sm font-medium">Guardrails</div>
        <div className="space-y-2">
          <Label htmlFor="claw-daily-token-budget">Daily Token Budget</Label>
          <Input
            id="claw-daily-token-budget"
            type="number"
            min={0}
            value={form.dailyTokenBudget}
            onChange={(event) => setForm((prev) => ({ ...prev, dailyTokenBudget: event.target.value }))}
            disabled={loading || saving}
          />
        </div>
        <div className="flex items-center justify-between rounded-md border p-3">
          <Label htmlFor="claw-emergency-stop" className="text-sm">Emergency Stop Enabled</Label>
          <Switch
            id="claw-emergency-stop"
            checked={form.emergencyStopEnabled}
            onCheckedChange={(checked) => setForm((prev) => ({ ...prev, emergencyStopEnabled: checked }))}
            disabled={loading || saving}
          />
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="outline" onClick={() => void handleReset()} disabled={loading || saving}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Reset
        </Button>
        <Button onClick={() => void handleSave()} disabled={loading || saving || !hasChanges}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save
        </Button>
      </div>
    </div>
  );
}
