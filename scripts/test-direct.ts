/**
 * Direct test for caching and reasoning configuration.
 * Tests the logic without going through the API route.
 */

import { configurePromptCaching } from '../src/lib/ai/chat-executor';
import { getModelCapabilities } from '../src/lib/constants/model-capabilities';
import type { ModelMessage } from 'ai';

// Test system prompt that exceeds 1024 tokens for Anthropic caching
const LARGE_SYSTEM_PROMPT = 'You are a helpful assistant. '.repeat(200);

console.log('=== Direct Test for Caching & Reasoning ===\n');

// Test providers and their models
const testCases = [
  { providerId: 'anthropic', modelId: 'anthropic/claude-3-haiku', name: 'Anthropic Claude 3 Haiku' },
  { providerId: 'anthropic', modelId: 'anthropic/claude-sonnet-4.5', name: 'Anthropic Claude Sonnet 4.5' },
  { providerId: 'openai', modelId: 'openai/gpt-4o-mini', name: 'OpenAI GPT-4o Mini' },  // Prefixed for lookup
  { providerId: 'xai', modelId: 'x-ai/grok-3', name: 'xAI Grok 3 (automatic caching)' },
  { providerId: 'openrouter', modelId: 'openai/gpt-4o-mini', name: 'OpenRouter GPT-4o Mini' },
];

for (const test of testCases) {
  console.log(`\n--- ${test.name} ---`);

  const capabilities = getModelCapabilities(test.modelId);
  console.log('Capabilities:');
  console.log('  supportsPromptCaching:', capabilities.supportsPromptCaching);
  console.log('  supportsThinking:', capabilities.supportsThinking);

  const messages: ModelMessage[] = [
    { role: 'system', content: LARGE_SYSTEM_PROMPT },
    { role: 'user', content: 'Hello' },
  ];

  const result = configurePromptCaching(
    messages,
    test.providerId,
    test.modelId,
    capabilities
  );

  // Check if caching was configured
  let cachingConfigured = false;
  for (const msg of result.messages) {
    const opts = (msg as any).providerOptions;
    if (opts) {
      cachingConfigured = true;
      console.log('Caching configured on', msg.role, 'message:');
      console.log('  providerOptions:', JSON.stringify(opts));
    }
    // Check array content for cache control
    if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if ((part as any).providerOptions) {
          cachingConfigured = true;
          console.log('Caching configured on content part:');
          console.log('  providerOptions:', JSON.stringify((part as any).providerOptions));
        }
      }
    }
  }

  if (!cachingConfigured) {
    console.log('  ⚠️  No caching configured');
    if (!capabilities.supportsPromptCaching) {
      console.log('     (Model does not support prompt caching)');
    }
  }
}

console.log('\n=== Test Complete ===');
