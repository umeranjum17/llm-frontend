import type {
  ClawStatus, ClawTask, ClawActivity, ClawSchedule, ClawScheduleRun, ClawInitiative, ClawConfig,
  ClawBriefing, ClawMonitor, ClawPipelineRun, CostData, PendingQuestion,
  Codebase, CodebaseStats, CodebaseFile, CodebaseSearchResult,
  ClawTrace, ClawToolCall, ToolCallStats, ClawControlCapabilitiesResponse, ClawControlExecuteResponse,
  ClawStreamEvent,
  ClawSkillsAvailable, ClawSkillSearchResult, ClawHubCategory, ClawSkillInstallResult,
  ClawProject,
} from "./types";

const REQUEST_TIMEOUT_MS = 8000;
const CHAT_TIMEOUT_MS = 120_000;
const CONTROL_TIMEOUT_MS = 915_000;

export class ClawClient {
  constructor(baseUrl: string, private secret: string) {
    // Trim whitespace and trailing slashes from URL
    this.baseUrl = baseUrl.trim().replace(/\/+$/, "");
  }
  private baseUrl: string;

  private headers(): HeadersInit {
    return {
      Authorization: `Bearer ${this.secret}`,
      "Content-Type": "application/json",
    };
  }

  private async request<T>(path: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const timeoutMs = init?.timeoutMs ?? REQUEST_TIMEOUT_MS;
    const timeoutController = new AbortController();
    const requestController = new AbortController();
    let didTimeout = false;
    const timeoutId = setTimeout(() => {
      didTimeout = true;
      timeoutController.abort();
    }, timeoutMs);

    const abortRequest = () => requestController.abort();

    if (init?.signal) {
      if (init.signal.aborted) {
        requestController.abort();
      } else {
        init.signal.addEventListener("abort", abortRequest, { once: true });
      }
    }
    timeoutController.signal.addEventListener("abort", abortRequest, { once: true });

    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        headers: { ...this.headers(), ...init?.headers },
        cache: "no-store",
        mode: "cors",
        credentials: "omit",
        signal: requestController.signal,
      });
    } catch (err) {
      if (didTimeout) {
        throw new Error(`Request timed out after ${timeoutMs}ms`);
      }
      // Network-level errors: CORS, server down, DNS failure, etc.
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`${msg}`);
    } finally {
      clearTimeout(timeoutId);
      if (init?.signal) {
        init.signal.removeEventListener("abort", abortRequest);
      }
      timeoutController.signal.removeEventListener("abort", abortRequest);
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Claw API error ${res.status} for ${url}`);
    }
    return res.json();
  }

  async getStatus(): Promise<ClawStatus> {
    return this.request("/status");
  }

  async verifyAuth(): Promise<void> {
    await this.request("/config/keys");
  }

  async getTasks(): Promise<{ tasks: ClawTask[] }> {
    return this.request("/tasks");
  }

  async getTask(id: string): Promise<{ task: ClawTask }> {
    return this.request(`/tasks/${id}`);
  }

  async createTask(instruction: string): Promise<{ accepted: boolean; taskId: string }> {
    return this.request("/tasks", {
      method: "POST",
      body: JSON.stringify({ instruction }),
    });
  }

  async updateTask(id: string, data: Partial<ClawTask>): Promise<{ ok: boolean }> {
    return this.request(`/tasks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async deleteTask(id: string): Promise<{ ok: boolean }> {
    return this.request(`/tasks/${id}`, { method: "DELETE" });
  }

  async getActivity(limit = 20): Promise<{ activity: ClawActivity[] }> {
    return this.request(`/activity?limit=${limit}`);
  }

  async getSchedules(): Promise<{ schedules: ClawSchedule[] }> {
    return this.request("/schedules");
  }

  async createSchedule(name: string, cronExpression: string): Promise<{ id: string }> {
    return this.request("/schedules", {
      method: "POST",
      body: JSON.stringify({ name, cronExpression }),
    });
  }

  async deleteSchedule(id: string): Promise<{ ok: boolean }> {
    return this.request(`/schedules/${id}`, { method: "DELETE" });
  }

  async getScheduleRuns(scheduleId: string, limit = 20): Promise<{ runs: ClawScheduleRun[] }> {
    return this.request(`/schedules/${scheduleId}/runs?limit=${limit}`);
  }

  async getScheduleRun(scheduleId: string, runId: string): Promise<{ run: ClawScheduleRun }> {
    return this.request(`/schedules/${scheduleId}/runs/${runId}`);
  }

  async getInitiatives(status?: string): Promise<{ initiatives: ClawInitiative[] }> {
    const query = status ? `?status=${status}` : "";
    return this.request(`/initiatives${query}`);
  }

  async updateInitiative(id: string, status: "approved" | "rejected" | "deferred"): Promise<{ ok: boolean }> {
    return this.request(`/initiatives/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
  }

  async getConfig(): Promise<{ config: ClawConfig }> {
    return this.request("/config");
  }

  async updateConfig(data: Partial<ClawConfig>): Promise<{ ok: boolean }> {
    return this.request("/config", {
      method: "PATCH",
      body: JSON.stringify(data),
    });
  }

  async getMaskedKeys(): Promise<{ keys: Record<string, string | null> }> {
    return this.request("/config/keys");
  }

  async pushKeys(keys: Record<string, string>): Promise<{ updated: string[] }> {
    return this.request("/config/keys", {
      method: "POST",
      body: JSON.stringify({ keys }),
    });
  }

  async chat(message: string, history?: Array<{ role: "user" | "assistant"; content: string }>): Promise<{ response: string; taskId: string }> {
    return this.request("/chat", {
      method: "POST",
      body: JSON.stringify({ message, source: "lumina", history }),
      timeoutMs: CHAT_TIMEOUT_MS,
    });
  }

  async *chatStream(
    message: string,
    history?: Array<{ role: "user" | "assistant"; content: string }>,
    signal?: AbortSignal,
  ): AsyncGenerator<ClawStreamEvent> {
    const url = `${this.baseUrl}/chat/stream`;
    const res = await fetch(url, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ message, history }),
      cache: "no-store",
      mode: "cors",
      credentials: "omit",
      signal,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Claw API error ${res.status}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";

    let currentEvent = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ") && currentEvent) {
            const dataStr = line.slice(6);
            if (currentEvent === "done") {
              yield { type: "done" } as ClawStreamEvent;
              return;
            }
            try {
              const data = JSON.parse(dataStr);
              yield { type: currentEvent, ...data } as ClawStreamEvent;
            } catch {
              // Skip malformed JSON
            }
            currentEvent = "";
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  // --- Briefings ---

  async getLatestBriefing(): Promise<{ briefing: ClawBriefing | null }> {
    return this.request("/briefing");
  }

  async getBriefingHistory(limit = 20): Promise<{ briefings: ClawBriefing[] }> {
    return this.request(`/briefing/history?limit=${limit}`);
  }

  async generateBriefing(): Promise<{ briefing: ClawBriefing }> {
    return this.request("/briefing/generate", { method: "POST", timeoutMs: CHAT_TIMEOUT_MS });
  }

  // --- Monitors ---

  async getMonitors(): Promise<{ monitors: ClawMonitor[] }> {
    return this.request("/monitors");
  }

  async createMonitor(data: { name: string; type: string; config: Record<string, any> }): Promise<{ id: string }> {
    return this.request("/monitors", { method: "POST", body: JSON.stringify(data) });
  }

  async updateMonitor(id: string, data: Partial<{ name: string; type: string; config: Record<string, any>; enabled: boolean }>): Promise<{ ok: boolean }> {
    return this.request(`/monitors/${id}`, { method: "PATCH", body: JSON.stringify(data) });
  }

  async deleteMonitor(id: string): Promise<{ ok: boolean }> {
    return this.request(`/monitors/${id}`, { method: "DELETE" });
  }

  // --- Pipeline ---

  async getPipelineRuns(limit = 50): Promise<{ runs: ClawPipelineRun[] }> {
    return this.request(`/pipeline/runs?limit=${limit}`);
  }

  async runPipeline(): Promise<{ ok: boolean; message: string }> {
    return this.request("/pipeline/run", { method: "POST" });
  }

  createEventSource(): EventSource {
    return new EventSource(
      `${this.baseUrl}/events?token=${encodeURIComponent(this.secret)}`
    );
  }

  // --- Cost ---

  async getCost(): Promise<{ cost: CostData }> {
    return this.request("/cost");
  }

  // --- Pending Questions ---

  async getQuestions(status?: string): Promise<{ questions: PendingQuestion[] }> {
    const query = status ? `?status=${status}` : "";
    return this.request(`/questions${query}`);
  }

  async answerQuestion(id: string, answer: string): Promise<{ ok: boolean; question: PendingQuestion }> {
    return this.request(`/questions/${id}/answer`, {
      method: "POST",
      body: JSON.stringify({ answer }),
    });
  }

  async dismissQuestion(id: string): Promise<{ ok: boolean }> {
    return this.request(`/questions/${id}/dismiss`, { method: "POST" });
  }

  // --- Emergency Stop ---

  async emergencyStop(): Promise<{ ok: boolean; message: string }> {
    return this.request("/emergency-stop", { method: "POST" });
  }

  // --- Workspaces ---

  async openProject(path: string): Promise<{ project: ClawProject; codebaseId: string | null; indexingStatus: string }> {
    return this.request("/projects/open", {
      method: "POST",
      body: JSON.stringify({ path }),
    });
  }

  async getOpenProjects(): Promise<{ projects: ClawProject[] }> {
    return this.request("/projects/open");
  }

  async getFocusedProject(): Promise<{ project: ClawProject | null }> {
    return this.request("/projects/focused");
  }

  async focusProject(id: string): Promise<{ ok: boolean; project: ClawProject }> {
    return this.request(`/projects/${id}/focus`, { method: "POST" });
  }

  async closeProject(id: string): Promise<{ ok: boolean }> {
    return this.request(`/projects/${id}/close`, { method: "POST" });
  }

  // --- Codebases ---

  async listCodebases(): Promise<{ codebases: Codebase[] }> {
    return this.request("/codebases");
  }

  async getCodebase(id: string): Promise<{
    codebase: Codebase;
    stats: CodebaseStats;
    files: CodebaseFile[];
  }> {
    return this.request(`/codebases/${id}`);
  }

  async registerCodebase(
    name: string,
    path: string,
    description?: string
  ): Promise<{ codebase: Codebase }> {
    return this.request("/codebases", {
      method: "POST",
      body: JSON.stringify({ name, path, description }),
    });
  }

  async indexCodebase(
    id: string,
    incremental = false
  ): Promise<{ message: string; codebaseId: string }> {
    return this.request(`/codebases/${id}/index`, {
      method: "POST",
      body: JSON.stringify({ incremental }),
    });
  }

  async getCodebaseStatus(id: string): Promise<{
    id: string;
    status: string;
    lastIndexedAt?: number;
    fileCount?: number;
    chunkCount?: number;
    error?: string;
  }> {
    return this.request(`/codebases/${id}/status`);
  }

  async searchCodebase(
    id: string,
    query: string,
    options?: { limit?: number; language?: string; nodeType?: string }
  ): Promise<CodebaseSearchResult> {
    const params = new URLSearchParams({ q: query });
    if (options?.limit) params.set("limit", String(options.limit));
    if (options?.language) params.set("language", options.language);
    if (options?.nodeType) params.set("nodeType", options.nodeType);
    return this.request(`/codebases/${id}/search?${params}`);
  }

  async searchAllCodebases(
    query: string,
    limit = 10
  ): Promise<CodebaseSearchResult> {
    return this.request(
      `/codebases/search/all?q=${encodeURIComponent(query)}&limit=${limit}`
    );
  }

  async deleteCodebase(id: string): Promise<{ message: string }> {
    return this.request(`/codebases/${id}`, { method: "DELETE" });
  }

  // --- Traces ---

  async getTraces(source?: string, limit = 50): Promise<{ traces: ClawTrace[] }> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (source) params.set("source", source);
    return this.request(`/traces?${params}`);
  }

  async getTrace(id: string): Promise<{ trace: ClawTrace }> {
    return this.request(`/traces/${id}`);
  }

  // --- Tool Calls ---

  async getToolCalls(filters?: {
    toolName?: string;
    source?: string;
    success?: boolean;
    taskId?: string;
    since?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ toolCalls: ClawToolCall[]; total: number }> {
    const params = new URLSearchParams();
    if (filters?.toolName) params.set("toolName", filters.toolName);
    if (filters?.source) params.set("source", filters.source);
    if (filters?.success !== undefined) params.set("success", String(filters.success));
    if (filters?.taskId) params.set("taskId", filters.taskId);
    if (filters?.since) params.set("since", filters.since);
    if (filters?.limit) params.set("limit", String(filters.limit));
    if (filters?.offset) params.set("offset", String(filters.offset));
    return this.request(`/tool-calls?${params}`);
  }

  async getToolCall(id: string): Promise<{ toolCall: ClawToolCall }> {
    return this.request(`/tool-calls/${id}`);
  }

  async getToolCallStats(since?: string): Promise<{ stats: ToolCallStats }> {
    const params = since ? `?since=${encodeURIComponent(since)}` : "";
    return this.request(`/tool-calls/stats${params}`);
  }

  // --- Control Plane ---

  async getControlCapabilities(): Promise<ClawControlCapabilitiesResponse> {
    return this.request("/control/capabilities");
  }

  async executeControlTool(
    toolName: string,
    args: Record<string, unknown> = {},
    options?: { sessionId?: string; dryRun?: boolean; timeoutMs?: number }
  ): Promise<ClawControlExecuteResponse> {
    return this.request("/control/execute", {
      method: "POST",
      body: JSON.stringify({
        toolName,
        args,
        sessionId: options?.sessionId,
        dryRun: options?.dryRun,
      }),
      timeoutMs: options?.timeoutMs ?? CONTROL_TIMEOUT_MS,
    });
  }

  // --- Skills ---

  async getSkillsAvailable(): Promise<ClawSkillsAvailable> {
    return this.request("/skills/available");
  }

  async searchSkills(query: string, options?: { limit?: number; tags?: string[]; category?: string }): Promise<{ skills: ClawSkillSearchResult[]; source: string }> {
    const params = new URLSearchParams({ q: query });
    if (options?.limit) params.set("limit", String(options.limit));
    if (options?.tags?.length) params.set("tags", options.tags.join(","));
    if (options?.category) params.set("category", options.category);
    return this.request(`/skills/search?${params}`);
  }

  async getSkillCategories(): Promise<{ categories: ClawHubCategory[] }> {
    return this.request("/skills/categories");
  }

  async installSkill(slug: string, options?: { version?: string; target?: "user" | "workspace" }): Promise<ClawSkillInstallResult> {
    return this.request("/skills/install", {
      method: "POST",
      body: JSON.stringify({ slug, version: options?.version, target: options?.target ?? "user" }),
    });
  }

  async uninstallSkill(name: string, target: "user" | "workspace" = "user"): Promise<{ uninstalled: boolean; slug: string }> {
    return this.request(`/skills/${name}?target=${target}`, { method: "DELETE" });
  }
}
