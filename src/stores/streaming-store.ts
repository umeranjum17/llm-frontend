import { create } from "zustand";

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

  // Actions
  setStreamingMessage: (messageId: string | null) => void;
  setStreamingContent: (content: string) => void;
  appendStreamingContent: (delta: string) => void;
  setStreamingReasoning: (reasoning: string) => void;
  appendStreamingReasoning: (delta: string) => void;
  setStreamingToolCalls: (toolCalls: any[]) => void;
  setStreamingToolResults: (toolResults: any[]) => void;
  clearStreaming: () => void;
}

export const useStreamingStore = create<StreamingState>((set, get) => ({
  streamingMessageId: null,
  streamingContent: "",
  streamingReasoning: "",
  streamingToolCalls: [],
  streamingToolResults: [],
  streamingVersion: 0,

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
  }),
}));
