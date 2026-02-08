"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ChevronDown, Loader2, Play, RefreshCw, Search, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useLuminaStore } from "@/stores/lumina-store";
import { useLuminaControlStore } from "@/stores/lumina-control-store";
import type { LuminaControlCapability } from "@/lib/lumina/types";

const ARG_TEMPLATES: Record<string, string> = {
  list_directory: '{\n  "path": "."\n}',
  read_file: '{\n  "path": "README.md",\n  "maxLength": 10000\n}',
  file_info: '{\n  "path": "README.md"\n}',
  run_shell_safe: '{\n  "command": "ls -la"\n}',
  write_file: '{\n  "path": "notes.txt",\n  "content": "hello"\n}',
  run_shell: '{\n  "command": "npm test"\n}',
  claude_code: '{\n  "prompt": "Summarize this repo",\n  "maxTurns": 4\n}',
};

type ToolCategory = "Files" | "Shell" | "Git" | "Database" | "Network" | "MCP" | "Claude Code" | "Other";

interface HistoryEntry {
  id: string;
  timestamp: string;
  toolName: string;
  dryRun: boolean;
  success: boolean;
  result: unknown;
  error?: string;
}

const CATEGORY_ORDER: ToolCategory[] = ["Files", "Shell", "Git", "Database", "Network", "MCP", "Claude Code", "Other"];

const tokenize = (value: string) => value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

const hasKeyword = (tokens: string[], raw: string, keywords: string[]) =>
  keywords.some((keyword) => tokens.includes(keyword) || raw.includes(keyword));

const getToolCategory = (toolName: string): ToolCategory => {
  const raw = toolName.toLowerCase();
  const tokens = tokenize(toolName);

  if (hasKeyword(tokens, raw, ["claude"])) return "Claude Code";
  if (hasKeyword(tokens, raw, ["mcp"])) return "MCP";
  if (hasKeyword(tokens, raw, ["git", "commit", "branch", "merge", "rebase", "clone", "push", "pull"])) return "Git";
  if (hasKeyword(tokens, raw, ["db", "sql", "query", "postgres", "mysql", "sqlite", "mongo", "redis", "supabase"])) return "Database";
  if (hasKeyword(tokens, raw, ["http", "https", "api", "curl", "fetch", "request", "network", "dns", "url", "socket"])) return "Network";
  if (hasKeyword(tokens, raw, ["shell", "bash", "terminal", "command", "exec", "sh", "run"])) return "Shell";
  if (hasKeyword(tokens, raw, ["file", "files", "directory", "dir", "path", "read", "write", "list", "copy", "move", "delete", "mkdir"])) return "Files";
  return "Other";
};

const formatTimestamp = (value: string) => new Date(value).toLocaleString(undefined, { hour12: false });

export function ClawControlTab() {
  const client = useLuminaStore((s) => s.client);
  const isConnected = useLuminaStore((s) => s.isConnected);
  const loading = useLuminaControlStore((s) => s.loading);
  const executing = useLuminaControlStore((s) => s.executing);
  const error = useLuminaControlStore((s) => s.error);
  const capabilities = useLuminaControlStore((s) => s.capabilities);
  const refreshCapabilities = useLuminaControlStore((s) => s.refreshCapabilities);
  const executeTool = useLuminaControlStore((s) => s.executeTool);

  const [toolName, setToolName] = useState("");
  const [toolFilter, setToolFilter] = useState("");
  const [argsText, setArgsText] = useState("{}");
  const [dryRun, setDryRun] = useState(true);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [lastAttempt, setLastAttempt] = useState<{
    toolName: string;
    argsText: string;
    dryRun: boolean;
  } | null>(null);

  useEffect(() => {
    if (client && isConnected) {
      void refreshCapabilities();
    }
  }, [client, isConnected, refreshCapabilities]);

  const selected = useMemo(() => capabilities.find((c) => c.name === toolName) ?? null, [capabilities, toolName]);
  const isControlDisabled = error?.toLowerCase().includes("not found");
  const filteredCapabilities = useMemo(
    () => capabilities.filter((cap) => cap.name.toLowerCase().includes(toolFilter.trim().toLowerCase())),
    [capabilities, toolFilter]
  );

  const groupedCapabilities = useMemo(() => {
    const grouped = CATEGORY_ORDER.reduce((acc, category) => ((acc[category] = []), acc), {} as Record<ToolCategory, LuminaControlCapability[]>);

    for (const cap of filteredCapabilities) {
      grouped[getToolCategory(cap.name)].push(cap);
    }

    for (const category of CATEGORY_ORDER) {
      grouped[category].sort((a, b) => a.name.localeCompare(b.name));
    }

    return grouped;
  }, [filteredCapabilities]);

  const execute = async (payload?: { toolName: string; argsText: string; dryRun: boolean }) => {
    const next = payload ?? { toolName, argsText, dryRun };
    const normalizedTool = next.toolName.trim();
    if (!normalizedTool) {
      toast.error("Select a tool");
      return;
    }

    let parsedArgs: Record<string, unknown>;
    try {
      parsedArgs = JSON.parse(next.argsText || "{}");
    } catch {
      toast.error("Arguments must be valid JSON");
      return;
    }

    setLastAttempt(next);
    const res = await executeTool(normalizedTool, parsedArgs, { dryRun: next.dryRun });
    const latestError = useLuminaControlStore.getState().error;
    const success = Boolean(res?.ok);
    const errorMessage = success ? undefined : res?.error ?? latestError ?? "Tool execution failed";

    setHistory((prev) => [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: new Date().toISOString(),
        toolName: normalizedTool,
        dryRun: next.dryRun,
        success,
        error: errorMessage,
        result: res ?? { error: errorMessage },
      },
      ...prev,
    ].slice(0, 12));

    if (res?.ok) {
      toast.success(next.dryRun ? "Dry-run succeeded" : "Tool executed");
      return;
    }

    toast.error("Execution failed", { description: errorMessage });
  };

  const retryFromError = async () => {
    if (lastAttempt && !executing) {
      await execute(lastAttempt);
      return;
    }
    await refreshCapabilities();
  };

  if (!client || !isConnected) {
    return (
      <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
        Connect to Claw first to use Control.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-medium">Control Plane</div>
          <Button variant="outline" size="sm" onClick={() => void refreshCapabilities()} disabled={loading || executing}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </Button>
        </div>

        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span className="whitespace-pre-wrap">{error}</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="border-red-500/40 text-red-700 hover:text-red-800 dark:text-red-300 dark:hover:text-red-200"
                onClick={() => void retryFromError()}
                disabled={loading || executing}
              >
                Retry
              </Button>
            </div>
          </div>
        )}

        {isControlDisabled && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
            Control API is disabled on backend. Set:
            <div className="mt-1 font-mono">TOOL_CONTROL_ENABLED=true</div>
            <div className="mt-1 font-mono">TOOL_CONTROL_ALLOWLIST=read_file,list_directory,file_info,run_shell_safe</div>
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={toolFilter}
            onChange={(e) => setToolFilter(e.target.value)}
            placeholder="Find tools by name..."
            className="pl-8"
          />
        </div>

        <div className="space-y-3">
          {!capabilities.length && !loading && (
            <div className="text-xs text-muted-foreground">No tools reported by backend.</div>
          )}
          {!!capabilities.length && !filteredCapabilities.length && (
            <div className="text-xs text-muted-foreground">No tools match this filter.</div>
          )}
          {CATEGORY_ORDER.map((category) => {
            const tools = groupedCapabilities[category];
            if (!tools.length) return null;
            return (
              <div key={category} className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className="text-xs font-medium text-muted-foreground uppercase">{category}</div>
                  <Badge variant="outline">{tools.length}</Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  {tools.map((cap) => (
                    <button
                      key={cap.name}
                      type="button"
                      className="text-left"
                      onClick={() => {
                        setToolName(cap.name);
                        setArgsText(ARG_TEMPLATES[cap.name] ?? "{}");
                      }}
                    >
                      <Badge variant={toolName === cap.name ? "default" : "outline"}>
                        {cap.name}
                        {cap.dangerous ? " !" : ""}
                      </Badge>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-lg border bg-card p-4 space-y-3">
        <div className="text-sm font-medium">Execute Tool</div>
        <Input
          value={toolName}
          onChange={(e) => setToolName(e.target.value)}
          placeholder="Tool name (example: list_directory)"
        />
        <textarea
          value={argsText}
          onChange={(e) => setArgsText(e.target.value)}
          className="w-full min-h-36 rounded-md border bg-background p-2 text-xs font-mono"
          placeholder='{"path":"."}'
        />
        {selected?.description && (
          <div className="text-xs text-muted-foreground">{selected.description}</div>
        )}

        {selected?.dangerous && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
            <div className="flex items-start gap-2">
              <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
              <span>This tool is marked dangerous. Verify arguments before executing.</span>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            variant={dryRun ? "default" : "outline"}
            onClick={() => setDryRun((prev) => !prev)}
            disabled={executing}
          >
            Dry Run: {dryRun ? "On" : "Off"}
          </Button>
          <Button onClick={() => void execute()} disabled={executing}>
            {executing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            {dryRun ? "Run Dry-Run" : "Execute"}
          </Button>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-medium">Execution History</div>
          {!!history.length && (
            <Button variant="outline" size="sm" onClick={() => setHistory([])}>
              Clear
            </Button>
          )}
        </div>
        {!history.length && (
          <div className="text-xs text-muted-foreground">No executions yet.</div>
        )}
        <div className="space-y-2">
          {history.map((entry) => (
            <Collapsible key={entry.id} className="rounded-md border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={entry.success ? "default" : "destructive"}>
                    {entry.success ? "Success" : "Failed"}
                  </Badge>
                  <Badge variant="outline">{entry.toolName}</Badge>
                  {entry.dryRun && <Badge variant="secondary">dry-run</Badge>}
                  <span className="text-xs text-muted-foreground">{formatTimestamp(entry.timestamp)}</span>
                </div>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <ChevronDown className="h-3.5 w-3.5" />
                    Result
                  </Button>
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent className="pt-2 space-y-2">
                {entry.error && <div className="text-xs text-red-600 dark:text-red-400">{entry.error}</div>}
                <pre className="max-h-64 overflow-auto rounded-md bg-background p-2 text-xs">
                  {JSON.stringify(entry.result, null, 2)}
                </pre>
              </CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      </section>
    </div>
  );
}
