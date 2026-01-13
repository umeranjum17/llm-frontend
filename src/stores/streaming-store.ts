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

  setStreamingMessage: (messageId) => set({
    streamingMessageId: messageId,
    streamingContent: "",
    streamingReasoning: "",
    streamingToolCalls: [],
    streamingToolResults: [],
  }),

  setStreamingContent: (content) => set({ streamingContent: content }),

  appendStreamingContent: (delta) => set((state) => ({
    streamingContent: state.streamingContent + delta
  })),

  setStreamingReasoning: (reasoning) => set({ streamingReasoning: reasoning }),

  appendStreamingReasoning: (delta) => set((state) => ({
    streamingReasoning: state.streamingReasoning + delta
  })),

  setStreamingToolCalls: (toolCalls) => set({ streamingToolCalls: toolCalls }),

  setStreamingToolResults: (toolResults) => set({ streamingToolResults: toolResults }),

  clearStreaming: () => set({
    streamingMessageId: null,
    streamingContent: "",
    streamingReasoning: "",
    streamingToolCalls: [],
    streamingToolResults: [],
  }),
}));
