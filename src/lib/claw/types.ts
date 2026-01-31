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

export interface ClawConfig {
  openrouterModel: string;
  heartbeatIntervalMinutes: number;
  port: number;
  host: string;
}
