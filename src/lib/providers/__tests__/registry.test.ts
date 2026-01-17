import { describe, it, expect } from 'vitest';
import { PROVIDERS } from '../registry';

describe('provider registry', () => {
  it('does not include ollama provider', () => {
    const ollamaProvider = PROVIDERS.find(p => p.id === 'ollama');
    expect(ollamaProvider).toBeUndefined();
  });

  it('does not include lmstudio provider', () => {
    const lmstudioProvider = PROVIDERS.find(p => p.id === 'lmstudio');
    expect(lmstudioProvider).toBeUndefined();
  });

  it('includes all cloud providers', () => {
    const cloudProviderIds = [
      'openai',
      'anthropic',
      'openrouter',
      'google',
      'groq',
      'together',
      'deepseek',
      'mistral',
      'xai',
      'perplexity',
      'anyscale',
    ];

    for (const providerId of cloudProviderIds) {
      const provider = PROVIDERS.find(p => p.id === providerId);
      expect(provider, `Expected provider ${providerId} to exist`).toBeDefined();
    }
  });

  it('all providers require API key', () => {
    for (const provider of PROVIDERS) {
      expect(provider.apiKeyRequired, `Provider ${provider.id} should require API key`).toBe(true);
    }
  });

  it('does not include any local providers', () => {
    const localProviderIds = ['ollama', 'lmstudio'];
    for (const providerId of localProviderIds) {
      const provider = PROVIDERS.find(p => p.id === providerId);
      expect(provider, `Local provider ${providerId} should not exist`).toBeUndefined();
    }
  });
});
