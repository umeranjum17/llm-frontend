/**
 * Model capabilities registry
 * Defines which parameters each model supports
 */

export interface ModelCapabilities {
  supportsSystemPrompt: boolean;
  supportsTemperature: boolean;
  maxTemperature: number;
  minTemperature: number;
  supportsTopP: boolean;
  supportsFrequencyPenalty: boolean;
  supportsPresencePenalty: boolean;
  supportsMaxTokens: boolean;
  supportsReasoning: boolean;
  supportsVision: boolean;
  supportsTools: boolean;
  supportsStreaming: boolean;
}

export const MODEL_CAPABILITIES: Record<string, ModelCapabilities> = {
  // Claude Models
  "anthropic/claude-3.5-sonnet": {
    supportsSystemPrompt: true,
    supportsTemperature: true,
    maxTemperature: 1.0,
    minTemperature: 0.0,
    supportsTopP: true,
    supportsFrequencyPenalty: false,
    supportsPresencePenalty: false,
    supportsMaxTokens: true,
    supportsReasoning: false,
    supportsVision: true,
    supportsTools: true,
    supportsStreaming: true,
  },
  "anthropic/claude-3-opus": {
    supportsSystemPrompt: true,
    supportsTemperature: true,
    maxTemperature: 1.0,
    minTemperature: 0.0,
    supportsTopP: true,
    supportsFrequencyPenalty: false,
    supportsPresencePenalty: false,
    supportsMaxTokens: true,
    supportsReasoning: false,
    supportsVision: true,
    supportsTools: true,
    supportsStreaming: true,
  },

  // OpenAI Models
  "openai/gpt-4o": {
    supportsSystemPrompt: true,
    supportsTemperature: true,
    maxTemperature: 2.0,
    minTemperature: 0.0,
    supportsTopP: true,
    supportsFrequencyPenalty: true,
    supportsPresencePenalty: true,
    supportsMaxTokens: true,
    supportsReasoning: false,
    supportsVision: true,
    supportsTools: true,
    supportsStreaming: true,
  },
  "openai/gpt-4o-mini": {
    supportsSystemPrompt: true,
    supportsTemperature: true,
    maxTemperature: 2.0,
    minTemperature: 0.0,
    supportsTopP: true,
    supportsFrequencyPenalty: true,
    supportsPresencePenalty: true,
    supportsMaxTokens: true,
    supportsReasoning: false,
    supportsVision: true,
    supportsTools: true,
    supportsStreaming: true,
  },
  "openai/o1": {
    supportsSystemPrompt: false,
    supportsTemperature: false,
    maxTemperature: 1.0,
    minTemperature: 1.0,
    supportsTopP: false,
    supportsFrequencyPenalty: false,
    supportsPresencePenalty: false,
    supportsMaxTokens: true,
    supportsReasoning: true,
    supportsVision: false,
    supportsTools: false,
    supportsStreaming: true,
  },

  // Google Models
  "google/gemini-2.0-flash-exp:free": {
    supportsSystemPrompt: true,
    supportsTemperature: true,
    maxTemperature: 2.0,
    minTemperature: 0.0,
    supportsTopP: true,
    supportsFrequencyPenalty: false,
    supportsPresencePenalty: false,
    supportsMaxTokens: true,
    supportsReasoning: false,
    supportsVision: true,
    supportsTools: true,
    supportsStreaming: true,
  },

  // Meta Models
  "meta-llama/llama-3.3-70b-instruct": {
    supportsSystemPrompt: true,
    supportsTemperature: true,
    maxTemperature: 2.0,
    minTemperature: 0.0,
    supportsTopP: true,
    supportsFrequencyPenalty: true,
    supportsPresencePenalty: true,
    supportsMaxTokens: true,
    supportsReasoning: false,
    supportsVision: false,
    supportsTools: false,
    supportsStreaming: true,
  },
};

// Default capabilities for unknown models
export const DEFAULT_CAPABILITIES: ModelCapabilities = {
  supportsSystemPrompt: true,
  supportsTemperature: true,
  maxTemperature: 2.0,
  minTemperature: 0.0,
  supportsTopP: true,
  supportsFrequencyPenalty: false,
  supportsPresencePenalty: false,
  supportsMaxTokens: true,
  supportsReasoning: false,
  supportsVision: false,
  supportsTools: false,
  supportsStreaming: true,
};

export function getModelCapabilities(modelId: string): ModelCapabilities {
  return MODEL_CAPABILITIES[modelId] || DEFAULT_CAPABILITIES;
}
