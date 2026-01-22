import { create } from "zustand";

// Stable empty array to prevent infinite re-renders when returned from selectors
const EMPTY_STRING_ARRAY: string[] = [];

export interface PipelineToolCall {
  toolName: string;
  args: any;
  result?: any;
}

export interface PipelineStepProgress {
  id: string;
  name: string;
  type: "llm" | "image" | "tool" | "subagent";
  status: "pending" | "running" | "complete" | "error" | "retrying";
  input?: string;
  output?: any;
  error?: string;
  toolCalls?: PipelineToolCall[];
  retryCount?: number;
  maxRetries?: number;
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

export interface PendingSkillApproval {
  skill: ActiveSkill;
  messageContent: any;
  attachments?: Array<{ name: string; content: string }>;
  resolve: (approved: boolean) => void;
}

export type ImageGenerationStage = "validating" | "optimizing" | "generating" | "processing";

export interface ImageGenerationProgress {
  isActive: boolean;
  stage: ImageGenerationStage;
  messageId: string;
}

export interface QueuedMessage {
  id: string;
  content: any;
  attachments: Array<{ name: string; content: string }>;
  skill: string | null;
}

// Per-chat streaming state
export interface ChatStreamingState {
  streamingMessageId: string | null;
  streamingContent: string;
  streamingReasoning: string;
  streamingToolCalls: any[];
  streamingToolResults: any[];
  streamingVersion: number;
  pipelineExecution: PipelineExecution | null;
  optimisticMessage: OptimisticMessage | null;
  activeSkill: ActiveSkill | null;
  pendingSkillApproval: PendingSkillApproval | null;
  imageGenerationProgress: ImageGenerationProgress | null;
  messageQueue: QueuedMessage[];
}

// Default state for a new chat
const createDefaultChatState = (): ChatStreamingState => ({
  streamingMessageId: null,
  streamingContent: "",
  streamingReasoning: "",
  streamingToolCalls: [],
  streamingToolResults: [],
  streamingVersion: 0,
  pipelineExecution: null,
  optimisticMessage: null,
  activeSkill: null,
  pendingSkillApproval: null,
  imageGenerationProgress: null,
  messageQueue: [],
});

// Stable default state to avoid creating new objects in selectors (prevents infinite re-renders)
const DEFAULT_CHAT_STATE: ChatStreamingState = Object.freeze({
  streamingMessageId: null,
  streamingContent: "",
  streamingReasoning: "",
  streamingToolCalls: [],
  streamingToolResults: [],
  streamingVersion: 0,
  pipelineExecution: null,
  optimisticMessage: null,
  activeSkill: null,
  pendingSkillApproval: null,
  imageGenerationProgress: null,
  messageQueue: [],
}) as ChatStreamingState;

interface StreamingState {
  // State version for migration
  _version: number;

  // Per-chat streaming state map
  chatStreams: Record<string, ChatStreamingState>;

  // Selectors
  getChatStream: (chatId: string) => ChatStreamingState;
  isAnyStreaming: () => boolean;
  getActiveStreamCount: () => number;
  getStreamingChatIds: () => string[];

  // Actions - all now take chatId as first parameter
  setStreamingMessage: (chatId: string, messageId: string | null) => void;
  setStreamingContent: (chatId: string, content: string) => void;
  appendStreamingContent: (chatId: string, delta: string) => void;
  setStreamingReasoning: (chatId: string, reasoning: string) => void;
  appendStreamingReasoning: (chatId: string, delta: string) => void;
  setStreamingToolCalls: (chatId: string, toolCalls: any[]) => void;
  setStreamingToolResults: (chatId: string, toolResults: any[]) => void;
  clearStreaming: (chatId: string) => void;
  clearAllStreaming: () => void;

  // Optimistic message actions
  setOptimisticMessage: (chatId: string, message: OptimisticMessage | null) => void;
  clearOptimisticMessage: (chatId: string) => void;

  // Active skill actions
  setActiveSkill: (chatId: string, skill: ActiveSkill | null) => void;
  clearActiveSkill: (chatId: string) => void;

  // Pending skill approval actions
  setPendingSkillApproval: (chatId: string, approval: PendingSkillApproval | null) => void;
  approveSkill: (chatId: string) => void;
  rejectSkill: (chatId: string) => void;

  // Image generation progress actions
  setImageGenerationProgress: (chatId: string, messageId: string, stage: ImageGenerationStage) => void;
  clearImageGenerationProgress: (chatId: string) => void;

  // Message queue actions
  enqueueMessage: (chatId: string, message: Omit<QueuedMessage, 'id'>) => void;
  dequeueMessage: (chatId: string) => QueuedMessage | null;
  removeQueuedMessage: (chatId: string, messageId: string) => void;
  moveQueuedMessageUp: (chatId: string, messageId: string) => void;
  clearQueue: (chatId: string) => void;
  getQueue: (chatId: string) => QueuedMessage[];
  getQueuedMessageById: (chatId: string, messageId: string) => QueuedMessage | null;

  // Pipeline actions
  startPipeline: (chatId: string, steps: Array<{ id: string; name: string; type: "llm" | "image" | "tool" | "subagent" }>) => void;
  setStepRunning: (chatId: string, stepIndex: number, input?: string) => void;
  setStepComplete: (chatId: string, stepIndex: number, output: any, toolCalls?: PipelineToolCall[]) => void;
  setStepError: (chatId: string, stepIndex: number, error: string) => void;
  setStepRetrying: (chatId: string, stepIndex: number, retryCount: number, maxRetries: number, error: string) => void;
  completePipeline: (chatId: string, finalResult: any) => void;
  failPipeline: (chatId: string, error: string) => void;
  clearPipeline: (chatId: string) => void;
}

// Helper to get or create chat state
const getOrCreateChatState = (chatStreams: Record<string, ChatStreamingState>, chatId: string): ChatStreamingState => {
  return chatStreams[chatId] || createDefaultChatState();
};

// Helper to update a specific chat's state
const updateChatState = (
  chatStreams: Record<string, ChatStreamingState>,
  chatId: string,
  updates: Partial<ChatStreamingState>
): Record<string, ChatStreamingState> => {
  const currentState = getOrCreateChatState(chatStreams, chatId);
  return {
    ...chatStreams,
    [chatId]: {
      ...currentState,
      ...updates,
      streamingVersion: currentState.streamingVersion + 1,
    },
  };
};

// Current state version - increment this when making breaking changes
const STATE_VERSION = 2;

export const useStreamingStore = create<StreamingState>((set, get) => {
  // Check if we need to reset state due to version mismatch
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem('streaming-store-state');
      if (stored) {
        const parsed = JSON.parse(stored);
        // If old structure (no _version or wrong version), clear it
        if (!parsed._version || parsed._version < STATE_VERSION || !parsed.chatStreams) {
          console.log('[StreamingStore] Clearing old state structure (version mismatch)');
          localStorage.removeItem('streaming-store-state');
          // Also clear any Zustand persist keys
          Object.keys(localStorage).forEach(key => {
            if (key.includes('streaming')) {
              localStorage.removeItem(key);
            }
          });
        }
      }
    } catch (error) {
      console.error('[StreamingStore] Error checking state version:', error);
      localStorage.removeItem('streaming-store-state');
    }
  }

  return {
    _version: STATE_VERSION,
    chatStreams: {},

    // Selectors
    getChatStream: (chatId: string) => {
    try {
      const state = get();
      // Safety check: ensure chatStreams exists and is an object
      const chatStreams = state.chatStreams && typeof state.chatStreams === 'object' ? state.chatStreams : {};
      // Return existing state or stable default (NOT a new object) to prevent infinite re-renders
      return chatStreams[chatId] || DEFAULT_CHAT_STATE;
    } catch (error) {
      console.error('[StreamingStore] Error in getChatStream:', error);
      return DEFAULT_CHAT_STATE;
    }
  },

  isAnyStreaming: () => {
    try {
      const state = get();
      const chatStreams = state.chatStreams && typeof state.chatStreams === 'object' ? state.chatStreams : {};
      return Object.values(chatStreams).some((stream) => stream?.streamingMessageId !== null);
    } catch (error) {
      console.error('[StreamingStore] Error in isAnyStreaming:', error);
      return false;
    }
  },

  getActiveStreamCount: () => {
    try {
      const state = get();
      const chatStreams = state.chatStreams && typeof state.chatStreams === 'object' ? state.chatStreams : {};
      return Object.values(chatStreams).filter((stream) => stream?.streamingMessageId !== null).length;
    } catch (error) {
      console.error('[StreamingStore] Error in getActiveStreamCount:', error);
      return 0;
    }
  },

  getStreamingChatIds: () => {
    try {
      const state = get();
      const chatStreams = state.chatStreams && typeof state.chatStreams === 'object' ? state.chatStreams : {};
      const ids = Object.entries(chatStreams)
        .filter(([, stream]) => stream?.streamingMessageId !== null)
        .map(([chatId]) => chatId);
      // Return stable empty array if no streaming chats
      return ids.length > 0 ? ids : EMPTY_STRING_ARRAY;
    } catch (error) {
      console.error('[StreamingStore] Error in getStreamingChatIds:', error);
      return EMPTY_STRING_ARRAY;
    }
  },

  // Actions
  setStreamingMessage: (chatId, messageId) =>
    set((state) => ({
      chatStreams: updateChatState(state.chatStreams, chatId, {
        streamingMessageId: messageId,
        streamingContent: "",
        streamingReasoning: "",
        streamingToolCalls: [],
        streamingToolResults: [],
        streamingVersion: 0,
      }),
    })),

  setStreamingContent: (chatId, content) =>
    set((state) => ({
      chatStreams: updateChatState(state.chatStreams, chatId, {
        streamingContent: content,
      }),
    })),

  appendStreamingContent: (chatId, delta) =>
    set((state) => {
      const currentState = getOrCreateChatState(state.chatStreams, chatId);
      return {
        chatStreams: updateChatState(state.chatStreams, chatId, {
          streamingContent: currentState.streamingContent + delta,
        }),
      };
    }),

  setStreamingReasoning: (chatId, reasoning) =>
    set((state) => ({
      chatStreams: updateChatState(state.chatStreams, chatId, {
        streamingReasoning: reasoning,
      }),
    })),

  appendStreamingReasoning: (chatId, delta) =>
    set((state) => {
      const currentState = getOrCreateChatState(state.chatStreams, chatId);
      return {
        chatStreams: updateChatState(state.chatStreams, chatId, {
          streamingReasoning: currentState.streamingReasoning + delta,
        }),
      };
    }),

  setStreamingToolCalls: (chatId, toolCalls) =>
    set((state) => ({
      chatStreams: updateChatState(state.chatStreams, chatId, {
        streamingToolCalls: toolCalls,
      }),
    })),

  setStreamingToolResults: (chatId, toolResults) =>
    set((state) => ({
      chatStreams: updateChatState(state.chatStreams, chatId, {
        streamingToolResults: toolResults,
      }),
    })),

  clearStreaming: (chatId) =>
    set((state) => {
      const currentState = getOrCreateChatState(state.chatStreams, chatId);
      // Preserve the message queue when clearing streaming state
      // This allows queued messages to be processed after streaming completes
      if (currentState.messageQueue.length > 0) {
        return {
          chatStreams: updateChatState(state.chatStreams, chatId, {
            streamingMessageId: null,
            streamingContent: "",
            streamingReasoning: "",
            streamingToolCalls: [],
            streamingToolResults: [],
            streamingVersion: 0,
            activeSkill: null,
            // Keep messageQueue intact
          }),
        };
      }
      // No queue - safe to remove the entire chat state
      const { [chatId]: _, ...rest } = state.chatStreams;
      return { chatStreams: rest };
    }),

  clearAllStreaming: () => set({ chatStreams: {} }),

  // Optimistic message actions
  setOptimisticMessage: (chatId, message) =>
    set((state) => ({
      chatStreams: updateChatState(state.chatStreams, chatId, {
        optimisticMessage: message,
      }),
    })),

  clearOptimisticMessage: (chatId) =>
    set((state) => ({
      chatStreams: updateChatState(state.chatStreams, chatId, {
        optimisticMessage: null,
      }),
    })),

  // Active skill actions
  setActiveSkill: (chatId, skill) =>
    set((state) => ({
      chatStreams: updateChatState(state.chatStreams, chatId, {
        activeSkill: skill,
      }),
    })),

  clearActiveSkill: (chatId) =>
    set((state) => ({
      chatStreams: updateChatState(state.chatStreams, chatId, {
        activeSkill: null,
      }),
    })),

  // Pending skill approval actions
  setPendingSkillApproval: (chatId, approval) =>
    set((state) => ({
      chatStreams: updateChatState(state.chatStreams, chatId, {
        pendingSkillApproval: approval,
      }),
    })),

  approveSkill: (chatId) => {
    const chatState = getOrCreateChatState(get().chatStreams, chatId);
    if (chatState.pendingSkillApproval) {
      chatState.pendingSkillApproval.resolve(true);
      set((state) => ({
        chatStreams: updateChatState(state.chatStreams, chatId, {
          pendingSkillApproval: null,
        }),
      }));
    }
  },

  rejectSkill: (chatId) => {
    const chatState = getOrCreateChatState(get().chatStreams, chatId);
    if (chatState.pendingSkillApproval) {
      chatState.pendingSkillApproval.resolve(false);
      set((state) => ({
        chatStreams: updateChatState(state.chatStreams, chatId, {
          pendingSkillApproval: null,
        }),
      }));
    }
  },

  // Image generation progress actions
  setImageGenerationProgress: (chatId, messageId, stage) =>
    set((state) => ({
      chatStreams: updateChatState(state.chatStreams, chatId, {
        imageGenerationProgress: {
          isActive: true,
          stage,
          messageId,
        },
      }),
    })),

  clearImageGenerationProgress: (chatId) =>
    set((state) => ({
      chatStreams: updateChatState(state.chatStreams, chatId, {
        imageGenerationProgress: null,
      }),
    })),

  // Message queue actions
  enqueueMessage: (chatId, message) =>
    set((state) => {
      const currentState = getOrCreateChatState(state.chatStreams, chatId);
      const newMessage: QueuedMessage = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        ...message,
      };
      return {
        chatStreams: updateChatState(state.chatStreams, chatId, {
          messageQueue: [...currentState.messageQueue, newMessage],
        }),
      };
    }),

  dequeueMessage: (chatId) => {
    const currentState = getOrCreateChatState(get().chatStreams, chatId);
    if (currentState.messageQueue.length === 0) return null;

    const [first, ...rest] = currentState.messageQueue;
    set((state) => ({
      chatStreams: updateChatState(state.chatStreams, chatId, {
        messageQueue: rest,
      }),
    }));
    return first;
  },

  removeQueuedMessage: (chatId, messageId) =>
    set((state) => {
      const currentState = getOrCreateChatState(state.chatStreams, chatId);
      return {
        chatStreams: updateChatState(state.chatStreams, chatId, {
          messageQueue: currentState.messageQueue.filter((m) => m.id !== messageId),
        }),
      };
    }),

  moveQueuedMessageUp: (chatId, messageId) =>
    set((state) => {
      const currentState = getOrCreateChatState(state.chatStreams, chatId);
      const queue = [...currentState.messageQueue];
      const index = queue.findIndex((m) => m.id === messageId);
      if (index > 0) {
        // Swap with previous item
        [queue[index - 1], queue[index]] = [queue[index], queue[index - 1]];
      }
      return {
        chatStreams: updateChatState(state.chatStreams, chatId, {
          messageQueue: queue,
        }),
      };
    }),

  clearQueue: (chatId) =>
    set((state) => ({
      chatStreams: updateChatState(state.chatStreams, chatId, {
        messageQueue: [],
      }),
    })),

  getQueue: (chatId) => {
    const currentState = getOrCreateChatState(get().chatStreams, chatId);
    return currentState.messageQueue;
  },

  getQueuedMessageById: (chatId, messageId) => {
    const currentState = getOrCreateChatState(get().chatStreams, chatId);
    return currentState.messageQueue.find((m) => m.id === messageId) || null;
  },

  // Pipeline actions
  startPipeline: (chatId, steps) =>
    set((state) => ({
      chatStreams: updateChatState(state.chatStreams, chatId, {
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
      }),
    })),

  setStepRunning: (chatId, stepIndex, input) =>
    set((state) => {
      const chatState = getOrCreateChatState(state.chatStreams, chatId);
      if (!chatState.pipelineExecution) return state;
      const steps = [...chatState.pipelineExecution.steps];
      if (steps[stepIndex]) {
        steps[stepIndex] = { ...steps[stepIndex], status: "running", input };
      }
      return {
        chatStreams: updateChatState(state.chatStreams, chatId, {
          pipelineExecution: {
            ...chatState.pipelineExecution,
            currentStepIndex: stepIndex,
            steps,
          },
        }),
      };
    }),

  setStepComplete: (chatId, stepIndex, output, toolCalls) =>
    set((state) => {
      const chatState = getOrCreateChatState(state.chatStreams, chatId);
      if (!chatState.pipelineExecution) return state;
      const steps = [...chatState.pipelineExecution.steps];
      if (steps[stepIndex]) {
        steps[stepIndex] = {
          ...steps[stepIndex],
          status: "complete",
          output,
          ...(toolCalls && toolCalls.length > 0 ? { toolCalls } : {}),
        };
      }
      return {
        chatStreams: updateChatState(state.chatStreams, chatId, {
          pipelineExecution: {
            ...chatState.pipelineExecution,
            steps,
          },
        }),
      };
    }),

  setStepError: (chatId, stepIndex, error) =>
    set((state) => {
      const chatState = getOrCreateChatState(state.chatStreams, chatId);
      if (!chatState.pipelineExecution) return state;
      const steps = [...chatState.pipelineExecution.steps];
      if (steps[stepIndex]) {
        steps[stepIndex] = { ...steps[stepIndex], status: "error", error };
      }
      return {
        chatStreams: updateChatState(state.chatStreams, chatId, {
          pipelineExecution: {
            ...chatState.pipelineExecution,
            steps,
          },
        }),
      };
    }),

  setStepRetrying: (chatId, stepIndex, retryCount, maxRetries, error) =>
    set((state) => {
      const chatState = getOrCreateChatState(state.chatStreams, chatId);
      if (!chatState.pipelineExecution) return state;
      const steps = [...chatState.pipelineExecution.steps];
      if (steps[stepIndex]) {
        steps[stepIndex] = {
          ...steps[stepIndex],
          status: "retrying",
          retryCount,
          maxRetries,
          error,
        };
      }
      return {
        chatStreams: updateChatState(state.chatStreams, chatId, {
          pipelineExecution: {
            ...chatState.pipelineExecution,
            steps,
          },
        }),
      };
    }),

  completePipeline: (chatId, finalResult) =>
    set((state) => {
      const chatState = getOrCreateChatState(state.chatStreams, chatId);
      return {
        chatStreams: updateChatState(state.chatStreams, chatId, {
          pipelineExecution: chatState.pipelineExecution
            ? {
                ...chatState.pipelineExecution,
                isActive: false,
                finalResult,
              }
            : null,
        }),
      };
    }),

  failPipeline: (chatId, error) =>
    set((state) => {
      const chatState = getOrCreateChatState(state.chatStreams, chatId);
      return {
        chatStreams: updateChatState(state.chatStreams, chatId, {
          pipelineExecution: chatState.pipelineExecution
            ? {
                ...chatState.pipelineExecution,
                isActive: false,
                error,
              }
            : null,
        }),
      };
    }),

  clearPipeline: (chatId) =>
    set((state) => ({
      chatStreams: updateChatState(state.chatStreams, chatId, {
        pipelineExecution: null,
      }),
    })),
  };
});
