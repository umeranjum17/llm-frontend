import { create } from "zustand";

export interface PipelineToolCall {
  toolName: string;
  args: any;
  result?: any;
}

export interface PipelineStepProgress {
  id: string;
  name: string;
  type: "llm" | "image" | "tool" | "subagent";
  status: "pending" | "running" | "complete" | "error";
  input?: string;
  output?: any;
  error?: string;
  toolCalls?: PipelineToolCall[];
}

export interface PipelineExecution {
  isActive: boolean;
  currentStepIndex: number;
  totalSteps: number;
  steps: PipelineStepProgress[];
  finalResult?: any;
  error?: string;
}

export interface OptimisticMessage {
  id: string;
  content: any;
  role: "user" | "assistant";
  createdAt: number;
  status?: "sending" | "switching-agent";
  agentName?: string;
}

export interface ActiveSkill {
  id: string;
  name: string;
  icon: string;
  color: string;
  activeLabel: string;
}

interface StreamingState {
  // The ID of the message currently being streamed
  streamingMessageId: string | null;
  // The current content being streamed (for real-time display)
  streamingContent: string;
  // The current reasoning/thinking being streamed
  streamingReasoning: string;
  // Tool calls in progress
  streamingToolCalls: any[];
  // Tool results received
  streamingToolResults: any[];
  // Version counter to force re-renders on each update
  streamingVersion: number;
  // Pipeline execution state
  pipelineExecution: PipelineExecution | null;
  // Optimistic user message (shown immediately before DB save)
  optimisticMessage: OptimisticMessage | null;
  // Active skill during generation
  activeSkill: ActiveSkill | null;

  // Actions
  setStreamingMessage: (messageId: string | null) => void;
  setStreamingContent: (content: string) => void;
  appendStreamingContent: (delta: string) => void;
  setStreamingReasoning: (reasoning: string) => void;
  appendStreamingReasoning: (delta: string) => void;
  setStreamingToolCalls: (toolCalls: any[]) => void;
  setStreamingToolResults: (toolResults: any[]) => void;
  clearStreaming: () => void;
  // Optimistic message actions
  setOptimisticMessage: (message: OptimisticMessage | null) => void;
  clearOptimisticMessage: () => void;

  // Active skill actions
  setActiveSkill: (skill: ActiveSkill | null) => void;
  clearActiveSkill: () => void;

  // Pipeline actions
  startPipeline: (steps: Array<{ id: string; name: string; type: "llm" | "image" | "tool" | "subagent" }>) => void;
  setStepRunning: (stepIndex: number, input?: string) => void;
  setStepComplete: (stepIndex: number, output: any, toolCalls?: PipelineToolCall[]) => void;
  setStepError: (stepIndex: number, error: string) => void;
  completePipeline: (finalResult: any) => void;
  failPipeline: (error: string) => void;
  clearPipeline: () => void;
}

export const useStreamingStore = create<StreamingState>((set, get) => ({
  streamingMessageId: null,
  streamingContent: "",
  streamingReasoning: "",
  streamingToolCalls: [],
  streamingToolResults: [],
  streamingVersion: 0,
  pipelineExecution: null,
  optimisticMessage: null,
  activeSkill: null,

  setStreamingMessage: (messageId) => set({
    streamingMessageId: messageId,
    streamingContent: "",
    streamingReasoning: "",
    streamingToolCalls: [],
    streamingToolResults: [],
    streamingVersion: 0,
  }),

  setStreamingContent: (content) => set((state) => ({
    streamingContent: content,
    streamingVersion: state.streamingVersion + 1,
  })),

  appendStreamingContent: (delta) => set((state) => ({
    streamingContent: state.streamingContent + delta,
    streamingVersion: state.streamingVersion + 1,
  })),

  setStreamingReasoning: (reasoning) => set((state) => ({
    streamingReasoning: reasoning,
    streamingVersion: state.streamingVersion + 1,
  })),

  appendStreamingReasoning: (delta) => set((state) => ({
    streamingReasoning: state.streamingReasoning + delta,
    streamingVersion: state.streamingVersion + 1,
  })),

  setStreamingToolCalls: (toolCalls) => set((state) => ({
    streamingToolCalls: toolCalls,
    streamingVersion: state.streamingVersion + 1,
  })),

  setStreamingToolResults: (toolResults) => set((state) => ({
    streamingToolResults: toolResults,
    streamingVersion: state.streamingVersion + 1,
  })),

  clearStreaming: () => set({
    streamingMessageId: null,
    streamingContent: "",
    streamingReasoning: "",
    streamingToolCalls: [],
    streamingToolResults: [],
    streamingVersion: 0,
    pipelineExecution: null,
    optimisticMessage: null,
    activeSkill: null,
  }),

  setOptimisticMessage: (message) => set((state) => ({
    optimisticMessage: message,
    streamingVersion: state.streamingVersion + 1,
  })),

  clearOptimisticMessage: () => set((state) => ({
    optimisticMessage: null,
    streamingVersion: state.streamingVersion + 1,
  })),

  // Active skill actions
  setActiveSkill: (skill) => set((state) => ({
    activeSkill: skill,
    streamingVersion: state.streamingVersion + 1,
  })),

  clearActiveSkill: () => set((state) => ({
    activeSkill: null,
    streamingVersion: state.streamingVersion + 1,
  })),

  // Pipeline actions
  startPipeline: (steps) => set((state) => ({
    pipelineExecution: {
      isActive: true,
      currentStepIndex: 0,
      totalSteps: steps.length,
      steps: steps.map((step) => ({
        id: step.id,
        name: step.name,
        type: step.type,
        status: "pending" as const,
      })),
    },
    streamingVersion: state.streamingVersion + 1,
  })),

  setStepRunning: (stepIndex, input) => set((state) => {
    if (!state.pipelineExecution) return state;
    const steps = [...state.pipelineExecution.steps];
    if (steps[stepIndex]) {
      steps[stepIndex] = { ...steps[stepIndex], status: "running", input };
    }
    return {
      pipelineExecution: {
        ...state.pipelineExecution,
        currentStepIndex: stepIndex,
        steps,
      },
      streamingVersion: state.streamingVersion + 1,
    };
  }),

  setStepComplete: (stepIndex, output, toolCalls) => set((state) => {
    if (!state.pipelineExecution) return state;
    const steps = [...state.pipelineExecution.steps];
    if (steps[stepIndex]) {
      steps[stepIndex] = {
        ...steps[stepIndex],
        status: "complete",
        output,
        ...(toolCalls && toolCalls.length > 0 ? { toolCalls } : {}),
      };
    }
    return {
      pipelineExecution: {
        ...state.pipelineExecution,
        steps,
      },
      streamingVersion: state.streamingVersion + 1,
    };
  }),

  setStepError: (stepIndex, error) => set((state) => {
    if (!state.pipelineExecution) return state;
    const steps = [...state.pipelineExecution.steps];
    if (steps[stepIndex]) {
      steps[stepIndex] = { ...steps[stepIndex], status: "error", error };
    }
    return {
      pipelineExecution: {
        ...state.pipelineExecution,
        steps,
      },
      streamingVersion: state.streamingVersion + 1,
    };
  }),

  completePipeline: (finalResult) => set((state) => ({
    pipelineExecution: state.pipelineExecution
      ? {
          ...state.pipelineExecution,
          isActive: false,
          finalResult,
        }
      : null,
    streamingVersion: state.streamingVersion + 1,
  })),

  failPipeline: (error) => set((state) => ({
    pipelineExecution: state.pipelineExecution
      ? {
          ...state.pipelineExecution,
          isActive: false,
          error,
        }
      : null,
    streamingVersion: state.streamingVersion + 1,
  })),

  clearPipeline: () => set((state) => ({
    pipelineExecution: null,
    streamingVersion: state.streamingVersion + 1,
  })),
}));
