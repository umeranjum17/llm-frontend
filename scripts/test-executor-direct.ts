/**
 * Direct test using chat-executor functions.
 * When we fix chat-executor, the route automatically works.
 */

import { streamText } from "ai";
import { createModel, configurePromptCaching } from '../src/lib/ai/chat-executor';
import { getModelCapabilities } from '../src/lib/constants/model-capabilities';
import { normalizeModelIdForProviderId } from '../src/lib/ai/provider-routing';
import type { ModelMessage } from 'ai';
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Load .env from the scripts directory using absolute path
// Use override: true to replace any existing env vars (e.g., from system/shell)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env'), override: true });


// Anthropic requires 1024+ tokens for caching. 'You are a helpful assistant. ' is ~6 tokens, so 200 * 6 = 1200 tokens
const LARGE_SYSTEM_PROMPT = 'You are a helpful, knowledgeable, and friendly assistant who provides accurate information. '.repeat(200);
const REASONING_PROMPT = 'A farmer has 17 sheep. All but 9 run away. How many are left? Think step by step.';

function getReasoningBudgetTokens(level: string): number {
  const map: Record<string, number> = { low: 5000, medium: 10000, high: 20000, xhigh: 50000 };
  return map[level] || 10000;
}

async function testProvider(config: {
  name: string;
  providerId: string;
  reasoningModelId: string;
  standardModelId: string;
  apiKey: string;
}) {
  console.log(`\nTesting ${config.name}...`);

  const results = {
    reasoning: { success: false, length: 0, error: '' },
    cache: { success: false, hitRate: 0, cacheWrite: 0, cacheRead: 0, error: '' },
    streaming: { success: false, events: 0, error: '' },
  };

  // ========== REASONING TEST ==========
  try {
    console.log(`  Reasoning (${config.reasoningModelId})...`);
    const model = createModel({
      providerId: config.providerId,
      modelId: config.reasoningModelId,
      apiKey: config.apiKey,
    });

    const capabilities = getModelCapabilities(config.reasoningModelId);
    const providerOptions: Record<string, any> = {};

    // Configure reasoning based on provider
    if (capabilities.supportsThinking) {
      const isAnthropicProvider = config.providerId === 'anthropic';
      const isXaiProvider = config.providerId === 'xai';

      if (isAnthropicProvider) {
        providerOptions.anthropic = {
          thinking: { type: 'enabled', budgetTokens: getReasoningBudgetTokens('medium') }
        };
      } else if (isXaiProvider) {
        providerOptions.xai = { reasoningEffort: 'high' };
      }
    }

    let reasoningLength = 0;
    let textLength = 0;
    const result = await streamText({
      model,
      messages: [{ role: 'user', content: REASONING_PROMPT }],
      providerOptions,
    });

    for await (const part of result.fullStream) {
      if (part.type === 'reasoning-start' || part.type === 'reasoning-end' || part.type === 'reasoning-delta') {
        reasoningLength += (part as any).text?.length || (part as any).textDelta?.length || 0;
      }
      if (part.type === 'text-delta') {
        textLength += (part as any).textDelta?.length || 0;
      }
    }

    results.reasoning = { success: reasoningLength > 0, length: reasoningLength, error: '' };
    console.log(`    ${reasoningLength > 0 ? '✓' : '✗'} ${reasoningLength}b reasoning, ${textLength}b text`);
    if (!capabilities.supportsThinking) {
      console.log(`    (Model doesn't have supportsThinking=true)`);
    }
  } catch (e: any) {
    results.reasoning = { success: false, length: 0, error: e.message?.slice(0, 80) };
    console.log(`    ✗ ${e.message?.slice(0, 80)}`);
  }

  // ========== CACHE TEST ==========
  try {
    console.log(`  Cache (${config.standardModelId})...`);
    const model = createModel({
      providerId: config.providerId,
      modelId: config.standardModelId,
      apiKey: config.apiKey,
    });

    const capabilities = getModelCapabilities(config.standardModelId);
    const messages: ModelMessage[] = [
      { role: 'system', content: LARGE_SYSTEM_PROMPT },
      { role: 'user', content: 'Say hi' },
    ];

    // Configure caching using the same function the route uses
    const { messages: cachedMessages, providerOptions } = configurePromptCaching(
      messages,
      config.providerId,
      config.standardModelId,
      capabilities
    );

    // Request 1 - should create cache
    const result1 = await streamText({
      model,
      messages: cachedMessages,
      providerOptions,
    });
    let usage1: any;
    for await (const part of result1.fullStream) {
      if (part.type === 'finish-step') usage1 = (part as any).usage;
    }

    const cacheWrite = usage1?.raw?.cache_creation_input_tokens || 0;

    // Request 2 - should read cache
    const result2 = await streamText({
      model,
      messages: cachedMessages,
      providerOptions,
    });
    let usage2: any;
    for await (const part of result2.fullStream) {
      if (part.type === 'finish-step') usage2 = (part as any).usage;
    }

    const cacheRead = usage2?.raw?.cache_read_input_tokens ||
                      usage2?.inputTokenDetails?.cacheReadTokens || 0;
    const totalTokens = usage2?.inputTokens || 0;
    const hitRate = totalTokens > 0 ? Math.round((cacheRead / totalTokens) * 100) : 0;

    results.cache = { success: true, hitRate, cacheWrite, cacheRead, error: '' };
    console.log(`    ✓ Write: ${cacheWrite}, Read: ${cacheRead}, Hit: ${hitRate}%`);

    if (cacheWrite === 0 && capabilities.supportsPromptCaching) {
      console.log(`    ⚠️  Cache not created - check providerOptions on messages`);
      // Debug: show what providerOptions were set
      for (const msg of cachedMessages) {
        if ((msg as any).providerOptions) {
          console.log(`       System msg providerOptions: ${JSON.stringify((msg as any).providerOptions)}`);
        }
      }
    }
  } catch (e: any) {
    results.cache = { success: false, hitRate: 0, cacheWrite: 0, cacheRead: 0, error: e.message?.slice(0, 80) };
    console.log(`    ✗ ${e.message?.slice(0, 80)}`);
  }

  // ========== STREAMING TEST ==========
  try {
    console.log(`  Streaming...`);
    const model = createModel({
      providerId: config.providerId,
      modelId: config.standardModelId,
      apiKey: config.apiKey,
    });

    let events = 0;
    const result = await streamText({
      model,
      messages: [{ role: 'user', content: 'Say hello' }],
    });
    for await (const part of result.fullStream) {
      if (part.type === 'text-delta') events++;
    }

    results.streaming = { success: events > 0, events, error: '' };
    console.log(`    ✓ ${events} text-delta events`);
  } catch (e: any) {
    results.streaming = { success: false, events: 0, error: e.message?.slice(0, 80) };
    console.log(`    ✗ ${e.message?.slice(0, 80)}`);
  }

  return results;
}

async function main() {
  console.log('=== Direct chat-executor Tests ===');
  console.log('(Fixes here automatically fix the API route)\n');

  const providers = [
    {
      name: 'Anthropic',
      providerId: 'anthropic',
      reasoningModelId: 'anthropic/claude-sonnet-4.5',
      standardModelId: 'anthropic/claude-3-haiku',
      apiKey: process.env.ANTHROPIC_API_KEY || '',
    },
    {
      name: 'xAI',
      providerId: 'xai',
      reasoningModelId: 'x-ai/grok-3',
      standardModelId: 'x-ai/grok-code-fast-1',
      apiKey: process.env.XAI_API_KEY || '',
    },
    {
      name: 'OpenRouter',
      providerId: 'openrouter',
      reasoningModelId: 'deepseek/deepseek-r1',
      standardModelId: 'openai/gpt-4o-mini',
      apiKey: process.env.OPENROUTER_API_KEY || '',
    },
    {
      name: 'OpenAI',
      providerId: 'openai',
      reasoningModelId: 'o4-mini',
      standardModelId: 'openai/gpt-4o-mini',
      apiKey: process.env.OPENAI_API_KEY || '',
    },
    {
      name: 'DeepSeek',
      providerId: 'deepseek',
      reasoningModelId: 'deepseek-reasoner',
      standardModelId: 'deepseek-chat',
      apiKey: process.env.DEEPSEEK_API_KEY || '',
    },
    {
      name: 'Google',
      providerId: 'google',
      reasoningModelId: 'gemini-2.0-flash',  // No separate reasoning model in free tier
      standardModelId: 'gemini-2.0-flash',
      apiKey: process.env.GOOGLE_API_KEY || '',
    },
  ];

  const allResults: { name: string; results: any }[] = [];

  for (const p of providers) {
    if (!p.apiKey) {
      console.log(`\nSkipping ${p.name} (no API key)`);
      continue;
    }
    const results = await testProvider(p);
    allResults.push({ name: p.name, results });
  }

  // Print summary
  console.log('\n=== Summary ===');
  console.log('────────────────────────────────────────────────────────────────────');
  console.log('| Provider     | Reasoning      | Cache           | Streaming    |');
  console.log('|--------------|----------------|-----------------|--------------|');

  for (const { name, results } of allResults) {
    const r = results.reasoning.success ? `✓ ${results.reasoning.length}b` : `✗`;
    const c = results.cache.success ? `✓ W:${results.cache.cacheWrite} R:${results.cache.cacheRead}` : '✗';
    const s = results.streaming.success ? `✓ ${results.streaming.events}` : '✗';
    console.log(`| ${name.padEnd(12)} | ${r.padEnd(14)} | ${c.padEnd(15)} | ${s.padEnd(12)} |`);
  }
  console.log('────────────────────────────────────────────────────────────────────');
}

main().catch(console.error);
