import type {
  ClawStatus, ClawTask, ClawActivity, ClawSchedule, ClawConfig,
} from "./types";

export class ClawClient {
  constructor(private baseUrl: string, private secret: string) {}

  private headers(): HeadersInit {
    return {
      Authorization: `Bearer ${this.secret}`,
      "Content-Type": "application/json",
    };
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { ...this.headers(), ...init?.headers },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Claw API error: ${res.status}`);
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

  async chat(message: string): Promise<{ response: string; taskId: string }> {
    return this.request("/chat", {
      method: "POST",
      body: JSON.stringify({ message, source: "lumina" }),
    });
  }

  createEventSource(): EventSource {
    return new EventSource(
      `${this.baseUrl}/events?token=${encodeURIComponent(this.secret)}`
    );
  }
}
