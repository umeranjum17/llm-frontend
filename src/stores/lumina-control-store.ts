import { create } from "zustand";
import { useLuminaStore } from "@/stores/lumina-store";
import type {
  LuminaControlCapability,
  LuminaControlExecuteResponse,
} from "@/lib/lumina/types";

interface LuminaControlState {
  loading: boolean;
  executing: boolean;
  error: string | null;
  capabilities: LuminaControlCapability[];
  allowlist: string[];
  lastResult: LuminaControlExecuteResponse | null;
  refreshCapabilities: () => Promise<void>;
  executeTool: (
    toolName: string,
    args: Record<string, unknown>,
    options?: { dryRun?: boolean; sessionId?: string }
  ) => Promise<LuminaControlExecuteResponse | null>;
  clearResult: () => void;
}

export const useLuminaControlStore = create<LuminaControlState>((set) => ({
  loading: false,
  executing: false,
  error: null,
  capabilities: [],
  allowlist: [],
  lastResult: null,

  refreshCapabilities: async () => {
    const client = useLuminaStore.getState().client;
    if (!client) {
      set({ error: "Not connected to Lumina" });
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
    const client = useLuminaStore.getState().client;
    if (!client) {
      set({ error: "Not connected to Lumina" });
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
