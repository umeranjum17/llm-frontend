import { useEffect, useRef } from "react";
import { useClawStore } from "@/stores/claw-store";

export function useClawEvents() {
  const client = useClawStore((s) => s.client);
  const isConnected = useClawStore((s) => s.isConnected);
  const refreshTasks = useClawStore((s) => s.refreshTasks);
  const refreshActivity = useClawStore((s) => s.refreshActivity);
  const refreshSchedules = useClawStore((s) => s.refreshSchedules);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!isConnected || !client) {
      esRef.current?.close();
      esRef.current = null;
      return;
    }

    const es = client.createEventSource();
    esRef.current = es;

    const onTask = () => refreshTasks();
    const onActivity = () => refreshActivity();
    const onSchedule = () => refreshSchedules();

    es.addEventListener("task:created", onTask);
    es.addEventListener("task:updated", onTask);
    es.addEventListener("task:deleted", onTask);
    es.addEventListener("activity:new", onActivity);
    es.addEventListener("schedule:created", onSchedule);
    es.addEventListener("schedule:deleted", onSchedule);

    es.onerror = () => console.warn("[Claw SSE] Connection error, auto-reconnecting...");

    return () => { es.close(); esRef.current = null; };
  }, [isConnected, client, refreshTasks, refreshActivity, refreshSchedules]);
}
