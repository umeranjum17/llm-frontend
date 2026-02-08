import { create } from "zustand";

export type LuminaEventType =
  | "brain:started"
  | "brain:tool_call"
  | "brain:tool_result"
  | "brain:completed"
  | "brain:error"
  | "heartbeat:started"
  | "heartbeat:completed"
  | "schedule:executing"
  | "schedule:completed"
  | "reflection:started"
  | "reflection:completed"
  | "ambient:started"
  | "ambient:thought"
  | "ambient:completed"
  | "pipeline:started"
  | "pipeline:findings"
  | "pipeline:completed"
  | "pipeline:action"
  | "briefing:started"
  | "briefing:generated"
  | "briefing:delivered"
  | "monitor:checked"
  | "monitor:alert";

export interface LuminaLiveEvent {
  id: string;
  type: LuminaEventType;
  timestamp: number;
  data: Record<string, any>;
}

const MAX_EVENTS = 200;

interface LuminaActivityState {
  liveEvents: LuminaLiveEvent[];
  currentTask: { id: string; title: string; status: "running" | "completed" | "error" } | null;
  isAutonomousRunning: boolean;

  pushEvent: (type: LuminaEventType, data: Record<string, any>) => void;
  clearEvents: () => void;
}

export const useLuminaActivityStore = create<LuminaActivityState>((set) => ({
  liveEvents: [],
  currentTask: null,
  isAutonomousRunning: false,

  pushEvent: (type, data) =>
    set((state) => {
      const event: LuminaLiveEvent = {
        id: crypto.randomUUID(),
        type,
        timestamp: Date.now(),
        data,
      };

      let currentTask = state.currentTask;
      let isAutonomousRunning = state.isAutonomousRunning;

      if (type === "brain:started") {
        currentTask = {
          id: data.taskId,
          title: data.message || "Processing...",
          status: "running",
        };
      } else if (type === "brain:completed") {
        if (currentTask?.id === data.taskId) {
          currentTask = { ...currentTask!, status: "completed" };
        }
      } else if (type === "brain:error") {
        if (currentTask?.id === data.taskId) {
          currentTask = { ...currentTask!, status: "error" };
        }
      } else if (
        type === "heartbeat:started" ||
        type === "reflection:started" ||
        type === "schedule:executing" ||
        type === "ambient:started" ||
        type === "pipeline:started"
      ) {
        isAutonomousRunning = true;
      } else if (
        type === "heartbeat:completed" ||
        type === "reflection:completed" ||
        type === "schedule:completed" ||
        type === "ambient:completed" ||
        type === "pipeline:completed"
      ) {
        isAutonomousRunning = false;
      }

      return {
        liveEvents: [event, ...state.liveEvents].slice(0, MAX_EVENTS),
        currentTask,
        isAutonomousRunning,
      };
    }),

  clearEvents: () => set({ liveEvents: [], currentTask: null, isAutonomousRunning: false }),
}));
