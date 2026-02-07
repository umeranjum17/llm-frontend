import { create } from "zustand";
import { useClawStore } from "@/stores/claw-store";
import type {
  ClawControlCapability,
  ClawControlExecuteResponse,
} from "@/lib/claw/types";

interface ClawControlState {
  loading: boolean;
  executing: boolean;
  error: string | null;
  capabilities: ClawControlCapability[];
  allowlist: string[];
  lastResult: ClawControlExecuteResponse | null;
  refreshCapabilities: () => Promise<void>;
  executeTool: (
    toolName: string,
    args: Record<string, unknown>,
    options?: { dryRun?: boolean; sessionId?: string }
  ) => Promise<ClawControlExecuteResponse | null>;
  clearResult: () => void;
}

export const useClawControlStore = create<ClawControlState>((set) => ({
  loading: false,
  executing: false,
  error: null,
  capabilities: [],
  allowlist: [],
  lastResult: null,

  refreshCapabilities: async () => {
    const client = useClawStore.getState().client;
    if (!client) {
      set({ error: "Not connected to Claw" });
      return;
    }

    set({ loading: true, error: null });
    try {
      const data = await client.getControlCapabilities();
      set({
        loading: false,
        capabilities: data.tools,
        allowlist: data.allowlist,
      });
    } catch (e) {
      set({ loading: false, error: (e as Error).message });
    }
  },

  executeTool: async (toolName, args, options) => {
    const client = useClawStore.getState().client;
    if (!client) {
      set({ error: "Not connected to Claw" });
      return null;
    }

    set({ executing: true, error: null });
    try {
      const res = await client.executeControlTool(toolName, args, options);
      set({
        executing: false,
        lastResult: res,
        ...(res.ok ? {} : { error: res.error ?? "Tool execution failed" }),
      });
      return res;
    } catch (e) {
      set({ executing: false, error: (e as Error).message });
      return null;
    }
  },

  clearResult: () => set({ lastResult: null }),
}));
