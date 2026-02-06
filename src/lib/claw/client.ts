import type {
  ClawStatus, ClawTask, ClawActivity, ClawSchedule, ClawScheduleRun, ClawInitiative, ClawConfig,
  ClawBriefing, ClawMonitor, ClawPipelineRun,
  Codebase, CodebaseStats, CodebaseFile, CodebaseSearchResult,
} from "./types";

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

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        headers: { ...this.headers(), ...init?.headers },
        cache: "no-store",
        mode: "cors",
        credentials: "omit",
      });
    } catch (err) {
      // Network-level errors: CORS, server down, DNS failure, etc.
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`${msg}`);
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
    });
  }

  // --- Briefings ---

  async getLatestBriefing(): Promise<{ briefing: ClawBriefing | null }> {
    return this.request("/briefing");
  }

  async getBriefingHistory(limit = 20): Promise<{ briefings: ClawBriefing[] }> {
    return this.request(`/briefing/history?limit=${limit}`);
  }

  async generateBriefing(): Promise<{ briefing: ClawBriefing }> {
    return this.request("/briefing/generate", { method: "POST" });
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
}
