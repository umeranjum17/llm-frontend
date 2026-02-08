import { useEffect, useRef } from "react";
import { useLuminaStore } from "@/stores/lumina-store";
import { useLuminaNotificationStore } from "@/stores/lumina-notification-store";
import { useLuminaActivityStore } from "@/stores/lumina-activity-store";
import type { LuminaEventType } from "@/stores/lumina-activity-store";
import { toast } from "sonner";

const ACTIVITY_EVENTS: LuminaEventType[] = [
  "brain:started",
  "brain:tool_call",
  "brain:tool_result",
  "brain:completed",
  "brain:error",
  "heartbeat:started",
  "heartbeat:completed",
  "schedule:executing",
  "schedule:completed",
  "reflection:started",
  "reflection:completed",
  "ambient:started",
  "ambient:thought",
  "ambient:completed",
  "pipeline:started",
  "pipeline:findings",
  "pipeline:completed",
  "pipeline:action",
  "briefing:started",
  "briefing:generated",
  "briefing:delivered",
  "monitor:checked",
  "monitor:alert",
];

export function useClawEvents() {
  const client = useLuminaStore((s) => s.client);
  const isConnected = useLuminaStore((s) => s.isConnected);
  const esRef = useRef<EventSource | null>(null);
  const prevTasksRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (!isConnected || !client) {
      esRef.current?.close();
      esRef.current = null;
      return;
    }

    // Snapshot current tasks when connection is established
    const currentTasks = useLuminaStore.getState().tasks;
    const taskMap = new Map<string, string>();
    for (const t of currentTasks) {
      taskMap.set(t.id, t.status);
    }
    prevTasksRef.current = taskMap;

    const addNotification =
      useLuminaNotificationStore.getState().addNotification;
    const pushEvent = useLuminaActivityStore.getState().pushEvent;

    const es = client.createEventSource();
    esRef.current = es;

    // Use getState() for all store method calls to avoid dependency issues
    const onTaskUpdated = async () => {
      await useLuminaStore.getState().refreshTasks();
      const newTasks = useLuminaStore.getState().tasks;
      const prev = prevTasksRef.current;

      for (const task of newTasks) {
        const oldStatus = prev.get(task.id);
        if (oldStatus && oldStatus !== task.status) {
          if (task.status === "completed") {
            addNotification({
              type: "task:completed",
              title: "Task Completed",
              message: task.title,
            });
            toast.success(`Task completed: ${task.title}`);
          } else if (task.status === "failed") {
            addNotification({
              type: "task:failed",
              title: "Task Failed",
              message: task.title,
            });
            toast.error(`Task failed: ${task.title}`);
          }
        }
      }

      // Update snapshot
      const updated = new Map<string, string>();
      for (const t of newTasks) {
        updated.set(t.id, t.status);
      }
      prevTasksRef.current = updated;
    };

    const onTaskCreated = () => {
      useLuminaStore.getState().refreshTasks();
    };

    const onTaskDeleted = () => useLuminaStore.getState().refreshTasks();

    const onActivity = async () => {
      await useLuminaStore.getState().refreshActivity();
    };

    const onScheduleCreated = () => {
      useLuminaStore.getState().refreshSchedules();
    };

    const onScheduleDeleted = () => {
      useLuminaStore.getState().refreshSchedules();
    };

    const onScheduleCompleted = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        if (data.scheduleId) {
          useLuminaStore.getState().fetchScheduleRuns(data.scheduleId);
          useLuminaStore.getState().refreshSchedules();
        }
      } catch {}
    };

    es.addEventListener("task:created", onTaskCreated);
    es.addEventListener("task:updated", onTaskUpdated);
    es.addEventListener("task:deleted", onTaskDeleted);
    es.addEventListener("activity:new", onActivity);
    es.addEventListener("schedule:created", onScheduleCreated);
    es.addEventListener("schedule:deleted", onScheduleDeleted);
    es.addEventListener("schedule:completed", onScheduleCompleted);

    const onInitiativeUpdate = (e: MessageEvent) => {
      useLuminaStore.getState().refreshInitiatives();
      try {
        const data = JSON.parse(e.data);
        if (data.status === "proposed") {
          addNotification({
            type: "initiative:proposed",
            title: "Initiative Proposed",
            message: data.title || "A new initiative has been proposed",
          });
        }
      } catch {}
    };
    es.addEventListener("initiative:proposed", onInitiativeUpdate);
    es.addEventListener("initiative:updated", onInitiativeUpdate);

    // Pipeline/briefing/monitor events
    const onBriefingGenerated = () => {
      useLuminaStore.getState().refreshBriefing();
    };
    es.addEventListener("briefing:generated", onBriefingGenerated);

    const onMonitorChange = () => {
      useLuminaStore.getState().refreshMonitors();
    };
    es.addEventListener("monitor:created", onMonitorChange);
    es.addEventListener("monitor:deleted", onMonitorChange);

    const onMonitorAlert = (e: MessageEvent) => {
      useLuminaStore.getState().refreshMonitors();
      try {
        const data = JSON.parse(e.data);
        addNotification({
          type: "monitor:alert",
          title: "Monitor Alert",
          message: data.name || "A monitor triggered an alert",
        });
        toast.info(`Monitor alert: ${data.name || "check dashboard"}`);
      } catch {}
    };
    es.addEventListener("monitor:alert", onMonitorAlert);

    const onPipelineCompleted = () => {
      useLuminaStore.getState().refreshPipelineRuns();
    };
    es.addEventListener("pipeline:completed", onPipelineCompleted);

    // Workspace events
    const onProjectOpened = (e: MessageEvent) => {
      useLuminaStore.getState().refreshOpenProjects();
      try {
        const data = JSON.parse(e.data);
        toast.success(`Opened: ${data?.name || "project"}`);
      } catch {}
    };
    es.addEventListener("project:opened", onProjectOpened);

    const onProjectFocused = (e: MessageEvent) => {
      useLuminaStore.getState().refreshOpenProjects();
      try {
        const data = JSON.parse(e.data);
        addNotification({
          type: "project:focused" as any,
          title: "Project Focused",
          message: data?.name || "Project focused",
        });
      } catch {}
    };
    es.addEventListener("project:focused", onProjectFocused);

    const onProjectClosed = () => {
      useLuminaStore.getState().refreshOpenProjects();
    };
    es.addEventListener("project:closed", onProjectClosed);

    // Codebase indexing events
    const onCodebaseIndexing = () => {
      useLuminaStore.getState().refreshCodebases();
    };
    es.addEventListener("codebase:indexing_progress", onCodebaseIndexing);

    const onCodebaseIndexed = (e: MessageEvent) => {
      useLuminaStore.getState().refreshCodebases();
      try {
        const data = JSON.parse(e.data);
        toast.success(`Codebase indexed: ${data?.fileCount || 0} files`);
      } catch {}
    };
    es.addEventListener("codebase:indexed", onCodebaseIndexed);

    const onCodebaseError = (e: MessageEvent) => {
      useLuminaStore.getState().refreshCodebases();
      try {
        const data = JSON.parse(e.data);
        toast.error(`Indexing error: ${data?.error || "unknown"}`);
      } catch {}
    };
    es.addEventListener("codebase:index_error", onCodebaseError);

    // Auto-sync keys when Claw requests them
    const onKeysNeeded = () => {
      console.log("[Claw SSE] Claw requested keys, auto-syncing...");
      useLuminaStore.getState().syncKeys().catch((err: any) => {
        console.warn("[Claw SSE] Auto key sync failed:", err);
      });
    };
    es.addEventListener("keys:needed", onKeysNeeded);

    // Granular activity events → push into activity store
    for (const eventType of ACTIVITY_EVENTS) {
      es.addEventListener(eventType, (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          pushEvent(eventType, data);
        } catch {
          pushEvent(eventType, {});
        }
      });
    }

    es.onerror = () =>
      console.warn("[Claw SSE] Connection error, auto-reconnecting...");

    return () => {
      es.close();
      esRef.current = null;
    };
    // Only depend on connection state - use getState() for store methods
  }, [isConnected, client]);
}
