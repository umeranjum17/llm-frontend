export interface LuminaStatus {
  status: string;
  uptime: number;
  startedAt: string;
}

export interface LuminaTask {
  id: string;
  title: string;
  description?: string;
  status: "pending" | "running" | "completed" | "failed";
  priority: "low" | "medium" | "high";
  assignedTo?: string;
  createdAt: string;
  updatedAt: string;
  dueDate?: string;
  metadata?: string;
}

export interface LuminaActivity {
  id: string;
  taskId?: string;
  action: string;
  details?: string;
  timestamp: string;
}

export interface LuminaSchedule {
  id: string;
  name: string;
  cronExpression: string;
  taskId?: string;
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
  createdAt: string;
}

export interface LuminaScheduleRun {
  id: string;
  scheduleId: string;
  taskId?: string;
  status: "running" | "success" | "error";
  result?: string;
  error?: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
}

export interface LuminaInitiative {
  id: string;
  title: string;
  description: string;
  rationale: string;
  status: "proposed" | "approved" | "rejected" | "deferred" | "in_progress" | "completed" | "failed";
  priority: "low" | "medium" | "high";
  category?: string;
  taskId?: string;
  result?: string;
  createdAt: string;
  updatedAt: string;
  reviewedAt?: string;
}

export interface LuminaConfig {
  openrouterModel: string;
  heartbeatIntervalMinutes: number;
  pipelineIntervalMinutes: number;
  port: number;
  host: string;
  briefingEnabled?: boolean;
  briefingTime?: string;
  computerUseEnabled?: boolean;
  playwrightBrowserEnabled?: boolean;
  gitToolEnabled?: boolean;
  systemToolEnabled?: boolean;
  databaseToolEnabled?: boolean;
  networkToolEnabled?: boolean;
  mediaToolEnabled?: boolean;
  dailyTokenBudget?: number;
  emergencyStopEnabled?: boolean;
}

export interface LuminaBriefing {
  id: string;
  type: "morning" | "evening" | "on_demand";
  content: string;
  sections: Array<{ title: string; items: Array<{ title: string; summary: string; url?: string; actionable: boolean; suggestedAction?: string }> }>;
  createdAt: string;
}

export interface LuminaMonitor {
  id: string;
  name: string;
  type: "github_repo" | "keyword" | "email" | "reddit" | "url";
  config: Record<string, any>;
  enabled: boolean;
  lastChecked?: string;
  lastResult?: string;
  createdAt: string;
}

export interface LuminaPipelineRun {
  id: string;
  phase: string;
  sourcesChecked: number;
  findingsCount: number;
  actionsCount: number;
  durationMs?: number;
  createdAt: string;
}

// --- Cost ---

export interface CostData {
  totalUsd: number;
  byTier: Record<string, number>;
  budgetUsd: number;
}

// --- Pending Questions ---

export interface PendingQuestion {
  id: string;
  scheduleId: string | null;
  taskId: string | null;
  question: string;
  context: string | null;
  status: string;
  createdAt: string;
  answeredAt: string | null;
  answer: string | null;
}

// --- Projects / Workspaces ---

export interface LuminaProject {
  id: string;
  name: string;
  path: string;
  description?: string;
  projectType?: string;
  isGitRepo: boolean;
  gitRemoteUrl?: string;
  gitBranch?: string;
  gitLastCommit?: string;
  isOpen: boolean;
  isFocused: boolean;
  toolCallCount: number;
  totalFilesChanged: number;
  totalGitOps: number;
  status: string;
  createdAt: string;
  lastAccessedAt: string;
  updatedAt: string;
}

// --- Codebase Indexing ---

export interface Codebase {
  id: string;
  name: string;
  path: string;
  description?: string;
  language?: string;
  status: "pending" | "indexing" | "ready" | "error";
  lastIndexedAt?: number;
  fileCount?: number;
  chunkCount?: number;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface CodebaseStats {
  chunkCount: number;
  languages: Record<string, number>;
  nodeTypes: Record<string, number>;
}

export interface CodebaseFile {
  id: string;
  codebaseId: string;
  relativePath: string;
  language?: string;
  hash: string;
  chunkCount: number;
  indexedAt: number;
}

export interface CodebaseSearchResult {
  query: string;
  codebase?: { id: string; name: string };
  results: Array<{
    file: string;
    name: string;
    type: string;
    language: string;
    lines: string;
    code: string;
    codebaseName?: string;
    codebasePath?: string;
    distance?: number;
  }>;
}

// --- Traces ---

export interface TraceStep {
  toolName: string;
  label?: string;
  input?: string;
  result?: string;
}

export interface LuminaTrace {
  id: string;
  source: "chat" | "cron" | "heartbeat" | "ambient" | "reflection" | "pipeline" | "watcher";
  input: string;
  output?: string;
  error?: string;
  taskId?: string;
  scheduleId?: string;
  initiativeId?: string;
  steps: TraceStep[];
  toolCount: number;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
}

// --- Tool Calls ---

export interface LuminaToolCall {
  id: string;
  toolName: string;
  toolLabel?: string;
  source: string;
  taskId?: string;
  scheduleId?: string;
  initiativeId?: string;
  args?: string;
  result?: string;
  sideEffects?: string;
  success?: boolean;
  error?: string;
  reasoning?: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
}

export interface ToolCallStats {
  total: number;
  success: number;
  failed: number;
  byTool: Record<string, number>;
  bySource: Record<string, number>;
  avgDuration: number | null;
}

// --- Control Plane ---

export interface LuminaControlCapability {
  name: string;
  description: string;
  dangerous: boolean;
  inputSchemaType: string | null;
}

export interface LuminaControlCapabilitiesResponse {
  enabled: boolean;
  allowlist: string[];
  toolCount: number;
  tools: LuminaControlCapability[];
}

export interface LuminaControlExecuteResponse {
  ok: boolean;
  toolName: string;
  taskId?: string;
  dryRun?: boolean;
  dangerous?: boolean;
  error?: string;
  result?: unknown;
}

// --- Approvals ---

export interface LuminaApproval {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  source: string;
  taskId: string;
  reason?: string;
  createdAt: number;
}

// --- Streaming ---

export type LuminaStreamEvent =
  | { type: "text-delta"; text: string }
  | { type: "tool-call"; taskId: string; toolCallId?: string; toolName: string; toolLabel: string; args: any }
  | { type: "tool-result"; taskId: string; toolCallId?: string; toolName: string; summary: string }
  | { type: "reasoning"; text: string }
  | { type: "error"; error: string }
  | { type: "completed"; taskId: string; response: string }
  | { type: "done" };

// --- Skills ---

export interface LuminaSkillLocal {
  name: string;
  description: string;
  userInvocable: boolean;
  source: string;
}

export interface LuminaSkillSearchResult {
  slug: string;
  name: string;
  description: string;
  author: string;
  version: string;
  downloads: number;
  rating: number;
  tags: string[];
  updatedAt: string;
}

export interface LuminaHubCategory {
  name: string;
  slug: string;
  count: number;
}

export interface LuminaSkillsAvailable {
  local: LuminaSkillLocal[];
  hub: string[];
}

export interface LuminaSkillInstallResult {
  installed: boolean;
  path: string;
  slug: string;
  version: string;
}
