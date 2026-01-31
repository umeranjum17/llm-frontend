import { useEffect, useRef } from "react";
import { useClawStore } from "@/stores/claw-store";
import { useClawNotificationStore } from "@/stores/claw-notification-store";
import { toast } from "sonner";

export function useClawEvents() {
  const client = useClawStore((s) => s.client);
  const isConnected = useClawStore((s) => s.isConnected);
  const refreshTasks = useClawStore((s) => s.refreshTasks);
  const refreshActivity = useClawStore((s) => s.refreshActivity);
  const refreshSchedules = useClawStore((s) => s.refreshSchedules);
  const esRef = useRef<EventSource | null>(null);
  const prevTasksRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (!isConnected || !client) {
      esRef.current?.close();
      esRef.current = null;
      return;
    }

    // Snapshot current tasks when connection is established
    const currentTasks = useClawStore.getState().tasks;
    const taskMap = new Map<string, string>();
    for (const t of currentTasks) {
      taskMap.set(t.id, t.status);
    }
    prevTasksRef.current = taskMap;

    const addNotification =
      useClawNotificationStore.getState().addNotification;

    const es = client.createEventSource();
    esRef.current = es;

    const onTaskUpdated = async () => {
      await refreshTasks();
      const newTasks = useClawStore.getState().tasks;
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

    const onTaskCreated = (e: MessageEvent) => {
      refreshTasks();
      try {
        const data = JSON.parse(e.data);
        addNotification({
          type: "activity:new",
          title: "New Task Created",
          message: data.title || data.instruction || "A new task was created",
        });
      } catch {
        addNotification({
          type: "activity:new",
          title: "New Task Created",
          message: "A new task was created",
        });
      }
    };

    const onTaskDeleted = () => refreshTasks();

    const onActivity = async () => {
      await refreshActivity();
      const activities = useClawStore.getState().activity;
      if (activities.length > 0) {
        const newest = activities[0];
        addNotification({
          type: "activity:new",
          title: newest.action,
          message: newest.details || "New activity recorded",
        });
      }
    };

    const onScheduleCreated = () => {
      refreshSchedules();
      addNotification({
        type: "schedule:triggered",
        title: "Schedule Created",
        message: "A new schedule was created",
      });
    };

    const onScheduleDeleted = () => {
      refreshSchedules();
      addNotification({
        type: "schedule:triggered",
        title: "Schedule Deleted",
        message: "A schedule was deleted",
      });
    };

    es.addEventListener("task:created", onTaskCreated);
    es.addEventListener("task:updated", onTaskUpdated);
    es.addEventListener("task:deleted", onTaskDeleted);
    es.addEventListener("activity:new", onActivity);
    es.addEventListener("schedule:created", onScheduleCreated);
    es.addEventListener("schedule:deleted", onScheduleDeleted);

    es.onerror = () =>
      console.warn("[Claw SSE] Connection error, auto-reconnecting...");

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [isConnected, client, refreshTasks, refreshActivity, refreshSchedules]);
}
