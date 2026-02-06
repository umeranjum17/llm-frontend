export interface ClawStatus {
  status: string;
  uptime: number;
  startedAt: string;
}

export interface ClawTask {
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

export interface ClawActivity {
  id: string;
  taskId?: string;
  action: string;
  details?: string;
  timestamp: string;
}

export interface ClawSchedule {
  id: string;
  name: string;
  cronExpression: string;
  taskId?: string;
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
  createdAt: string;
}

export interface ClawScheduleRun {
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

export interface ClawInitiative {
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

export interface ClawConfig {
  openrouterModel: string;
  heartbeatIntervalMinutes: number;
  pipelineIntervalMinutes: number;
  port: number;
  host: string;
}

export interface ClawBriefing {
  id: string;
  type: "morning" | "evening" | "on_demand";
  content: string;
  sections: Array<{ title: string; items: Array<{ title: string; summary: string; url?: string; actionable: boolean; suggestedAction?: string }> }>;
  createdAt: string;
}

export interface ClawMonitor {
  id: string;
  name: string;
  type: "github_repo" | "keyword" | "email" | "reddit" | "url";
  config: Record<string, any>;
  enabled: boolean;
  lastChecked?: string;
  lastResult?: string;
  createdAt: string;
}

export interface ClawPipelineRun {
  id: string;
  phase: string;
  sourcesChecked: number;
  findingsCount: number;
  actionsCount: number;
  durationMs?: number;
  createdAt: string;
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
