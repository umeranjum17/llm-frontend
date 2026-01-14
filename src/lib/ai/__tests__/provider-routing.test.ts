import { describe, it, expect, vi } from 'vitest';
import {
  providerLabel,
  inferDirectProviderFromModelId,
  isModelIdCompatibleWithProviderId,
  pickBestProviderId,
  normalizeModelIdForProviderId,
} from '../provider-routing';

// Mock the providers module
vi.mock('@/lib/providers', () => ({
  CUSTOM_OPENAI_PREFIX: 'custom-openai:',
  getProviderConfig: vi.fn((id: string) => {
    const configs: Record<string, { name: string }> = {
      openai: { name: 'OpenAI' },
      anthropic: { name: 'Anthropic' },
      openrouter: { name: 'OpenRouter' },
      groq: { name: 'Groq' },
      together: { name: 'Together AI' },
      ollama: { name: 'Ollama' },
    };
    return configs[id] || null;
  }),
  resolveProvider: vi.fn((id: string) => {
    const providers: Record<string, { id: string; priority: number }> = {
      openai: { id: 'openai', priority: 1 },
      anthropic: { id: 'anthropic', priority: 2 },
      openrouter: { id: 'openrouter', priority: 10 },
      groq: { id: 'groq', priority: 3 },
      together: { id: 'together', priority: 4 },
      ollama: { id: 'ollama', priority: 5 },
      'custom-openai:my-server': { id: 'custom-openai:my-server', priority: 6 },
    };
    return providers[id] || null;
  }),
}));

describe('provider-routing', () => {
  describe('providerLabel', () => {
    it('returns configured provider name', () => {
      expect(providerLabel('openai')).toBe('OpenAI');
      expect(providerLabel('anthropic')).toBe('Anthropic');
      expect(providerLabel('openrouter')).toBe('OpenRouter');
    });

    it('returns custom label for custom providers', () => {
      expect(providerLabel('custom-openai:my-server')).toBe('Custom (OpenAI-compatible)');
    });

    it('returns provider ID for unknown providers', () => {
      expect(providerLabel('unknown-provider')).toBe('unknown-provider');
    });
  });

  describe('inferDirectProviderFromModelId', () => {
    it('infers provider from model prefix', () => {
      expect(inferDirectProviderFromModelId('openai/gpt-4')).toBe('openai');
      expect(inferDirectProviderFromModelId('anthropic/claude-3-sonnet')).toBe('anthropic');
      expect(inferDirectProviderFromModelId('groq/llama-3.1-70b')).toBe('groq');
    });

    it('returns null for non-prefixed models', () => {
      expect(inferDirectProviderFromModelId('gpt-4')).toBeNull();
      expect(inferDirectProviderFromModelId('claude-3-sonnet')).toBeNull();
    });

    it('returns null for unknown prefixes', () => {
      expect(inferDirectProviderFromModelId('unknown/model')).toBeNull();
    });
  });

  describe('isModelIdCompatibleWithProviderId', () => {
    it('openrouter is compatible with all models', () => {
      expect(isModelIdCompatibleWithProviderId('openrouter', 'openai/gpt-4')).toBe(true);
      expect(isModelIdCompatibleWithProviderId('openrouter', 'anthropic/claude-3')).toBe(true);
      expect(isModelIdCompatibleWithProviderId('openrouter', 'random/model')).toBe(true);
    });

    it('anthropic is compatible with anthropic models', () => {
      expect(isModelIdCompatibleWithProviderId('anthropic', 'anthropic/claude-3-sonnet')).toBe(true);
      expect(isModelIdCompatibleWithProviderId('anthropic', 'claude-3-sonnet')).toBe(true);
    });

    it('anthropic is not compatible with other provider models', () => {
      expect(isModelIdCompatibleWithProviderId('anthropic', 'openai/gpt-4')).toBe(false);
    });

    it('openai is compatible with openai models', () => {
      expect(isModelIdCompatibleWithProviderId('openai', 'openai/gpt-4')).toBe(true);
      expect(isModelIdCompatibleWithProviderId('openai', 'gpt-4')).toBe(true);
    });

    it('openai is not compatible with other provider models', () => {
      expect(isModelIdCompatibleWithProviderId('openai', 'anthropic/claude-3')).toBe(false);
    });

    it('custom openai providers are compatible with openai models', () => {
      expect(isModelIdCompatibleWithProviderId('custom-openai:my-server', 'openai/gpt-4')).toBe(true);
      expect(isModelIdCompatibleWithProviderId('custom-openai:my-server', 'gpt-4')).toBe(true);
    });

    it('groq is compatible with groq-prefixed models', () => {
      expect(isModelIdCompatibleWithProviderId('groq', 'groq/llama-3.1-70b')).toBe(true);
      expect(isModelIdCompatibleWithProviderId('groq', 'llama-3.1-70b')).toBe(true);
    });
  });

  describe('pickBestProviderId', () => {
    it('prefers direct provider match', () => {
      const result = pickBestProviderId({
        modelId: 'openai/gpt-4',
        availableProviderIds: ['openai', 'openrouter', 'anthropic'],
      });
      expect(result).toBe('openai');
    });

    it('falls back to openrouter when direct provider not available', () => {
      const result = pickBestProviderId({
        modelId: 'openai/gpt-4',
        availableProviderIds: ['openrouter', 'anthropic'],
      });
      expect(result).toBe('openrouter');
    });

    it('returns null when no compatible provider', () => {
      const result = pickBestProviderId({
        modelId: 'anthropic/claude-3',
        availableProviderIds: ['openai'],
      });
      expect(result).toBeNull();
    });

    it('picks custom openai for openai models when available', () => {
      const result = pickBestProviderId({
        modelId: 'openai/gpt-4',
        availableProviderIds: ['custom-openai:my-server', 'anthropic'],
      });
      expect(result).toBe('custom-openai:my-server');
    });

    it('handles empty available providers', () => {
      const result = pickBestProviderId({
        modelId: 'openai/gpt-4',
        availableProviderIds: [],
      });
      expect(result).toBeNull();
    });
  });

  describe('normalizeModelIdForProviderId', () => {
    it('keeps model ID as-is for openrouter', () => {
      expect(normalizeModelIdForProviderId('openrouter', 'openai/gpt-4')).toBe('openai/gpt-4');
      expect(normalizeModelIdForProviderId('openrouter', 'anthropic/claude-3')).toBe('anthropic/claude-3');
    });

    it('strips openai prefix for openai provider', () => {
      expect(normalizeModelIdForProviderId('openai', 'openai/gpt-4')).toBe('gpt-4');
      expect(normalizeModelIdForProviderId('openai', 'gpt-4o')).toBe('gpt-4o');
    });

    it('normalizes anthropic model IDs', () => {
      expect(normalizeModelIdForProviderId('anthropic', 'anthropic/claude-3.5-sonnet')).toBe('claude-3-5-sonnet-20241022');
      expect(normalizeModelIdForProviderId('anthropic', 'anthropic/claude-3-opus')).toBe('claude-3-opus-20240229');
    });

    it('strips provider prefix for other providers', () => {
      expect(normalizeModelIdForProviderId('groq', 'groq/llama-3.1-70b')).toBe('llama-3.1-70b');
      expect(normalizeModelIdForProviderId('together', 'together/mixtral-8x7b')).toBe('mixtral-8x7b');
    });

    it('handles custom openai providers', () => {
      expect(normalizeModelIdForProviderId('custom-openai:my-server', 'openai/gpt-4')).toBe('gpt-4');
    });
  });
});
