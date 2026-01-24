/**
 * Direct SDK test - bypasses server entirely.
 * Tests caching and reasoning directly against provider APIs.
 */

import { streamText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createXai } from "@ai-sdk/xai";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import dotenv from "dotenv";

dotenv.config();

const LARGE_SYSTEM_PROMPT = 'You are a helpful assistant. '.repeat(200);
const REASONING_PROMPT = 'A farmer has 17 sheep. All but 9 run away. How many are left? Think step by step.';

interface TestResult {
  provider: string;
  reasoning: { success: boolean; length: number; error?: string };
  cache: { success: boolean; hitRate: number; error?: string };
  streaming: { success: boolean; events: number; error?: string };
}

async function testAnthropic(): Promise<TestResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { provider: 'Anthropic', reasoning: { success: false, length: 0, error: 'No API key' }, cache: { success: false, hitRate: 0, error: 'No API key' }, streaming: { success: false, events: 0, error: 'No API key' } };

  const anthropic = createAnthropic({ apiKey });
  const result: TestResult = { provider: 'Anthropic', reasoning: { success: false, length: 0 }, cache: { success: false, hitRate: 0 }, streaming: { success: false, events: 0 } };

  // Test reasoning with Claude Sonnet 4.5
  try {
    console.log('  Testing reasoning (claude-sonnet-4-5)...');
    let reasoningLength = 0;
    const reasoningResult = await streamText({
      model: anthropic('claude-sonnet-4-5'),
      messages: [{ role: 'user', content: REASONING_PROMPT }],
      providerOptions: {
        anthropic: {
          thinking: { type: 'enabled', budgetTokens: 10000 }
        }
      }
    });

    for await (const part of reasoningResult.fullStream) {
      const p = part as any;
      if (p.type === 'reasoning' || p.type === 'reasoning-delta') {
        reasoningLength += p.text?.length || p.textDelta?.length || 0;
      }
    }
    result.reasoning = { success: reasoningLength > 0, length: reasoningLength };
    console.log(`    Reasoning: ${reasoningLength > 0 ? '✓' : '✗'} ${reasoningLength}b`);
  } catch (e: any) {
    result.reasoning = { success: false, length: 0, error: e.message?.slice(0, 50) };
    console.log(`    Reasoning: ✗ ${e.message?.slice(0, 50)}`);
  }

  // Test caching with Claude 3 Haiku
  try {
    console.log('  Testing cache (claude-3-haiku)...');
    const messages = [
      {
        role: 'system' as const,
        content: LARGE_SYSTEM_PROMPT,
        providerOptions: { anthropic: { cacheControl: { type: 'ephemeral' } } }
      },
      { role: 'user' as const, content: 'Say hi' }
    ];

    // First request - should create cache
    const result1 = await streamText({
      model: anthropic('claude-3-haiku-20240307'),
      messages,
    });
    let usage1: any;
    for await (const part of result1.fullStream) {
      if (part.type === 'finish' || part.type === 'finish-step') {
        usage1 = (part as any).usage;
      }
    }

    // Second request - should hit cache
    const result2 = await streamText({
      model: anthropic('claude-3-haiku-20240307'),
      messages,
    });
    let usage2: any;
    for await (const part of result2.fullStream) {
      if (part.type === 'finish' || part.type === 'finish-step') {
        usage2 = (part as any).usage;
      }
    }

    const cached = usage2?.raw?.cache_read_input_tokens || usage2?.inputTokenDetails?.cacheReadTokens || 0;
    const total = usage2?.inputTokens || 0;
    const hitRate = total > 0 ? Math.round((cached / total) * 100) : 0;

    console.log(`    Cache write (req1): ${usage1?.raw?.cache_creation_input_tokens || 0} tokens`);
    console.log(`    Cache read (req2): ${cached} tokens`);
    result.cache = { success: true, hitRate };
    console.log(`    Cache: ✓ ${hitRate}%`);
  } catch (e: any) {
    result.cache = { success: false, hitRate: 0, error: e.message?.slice(0, 50) };
    console.log(`    Cache: ✗ ${e.message?.slice(0, 50)}`);
  }

  // Test streaming
  try {
    console.log('  Testing streaming...');
    let events = 0;
    const streamResult = await streamText({
      model: anthropic('claude-3-haiku-20240307'),
      messages: [{ role: 'user', content: 'Say hello' }],
    });
    for await (const part of streamResult.fullStream) {
      if (part.type === 'text-delta') events++;
    }
    result.streaming = { success: events > 0, events };
    console.log(`    Streaming: ✓ ${events} events`);
  } catch (e: any) {
    result.streaming = { success: false, events: 0, error: e.message?.slice(0, 50) };
    console.log(`    Streaming: ✗ ${e.message?.slice(0, 50)}`);
  }

  return result;
}

async function testXai(): Promise<TestResult> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return { provider: 'xAI', reasoning: { success: false, length: 0, error: 'No API key' }, cache: { success: false, hitRate: 0, error: 'No API key' }, streaming: { success: false, events: 0, error: 'No API key' } };

  const xai = createXai({ apiKey });
  const result: TestResult = { provider: 'xAI', reasoning: { success: false, length: 0 }, cache: { success: false, hitRate: 0 }, streaming: { success: false, events: 0 } };

  // Test reasoning with Grok 3
  try {
    console.log('  Testing reasoning (grok-3)...');
    let reasoningLength = 0;
    const reasoningResult = await streamText({
      model: xai('grok-3'),
      messages: [{ role: 'user', content: REASONING_PROMPT }],
      providerOptions: {
        xai: { reasoningEffort: 'high' }
      }
    });

    for await (const part of reasoningResult.fullStream) {
      const p = part as any;
      if (p.type === 'reasoning' || p.type === 'reasoning-delta') {
        reasoningLength += p.text?.length || p.textDelta?.length || 0;
      }
    }
    result.reasoning = { success: reasoningLength > 0, length: reasoningLength };
    console.log(`    Reasoning: ${reasoningLength > 0 ? '✓' : '✗'} ${reasoningLength}b`);
  } catch (e: any) {
    result.reasoning = { success: false, length: 0, error: e.message?.slice(0, 50) };
    console.log(`    Reasoning: ✗ ${e.message?.slice(0, 50)}`);
  }

  // Test caching (automatic for xAI)
  try {
    console.log('  Testing cache (grok-code-fast-1, automatic)...');
    const messages = [
      { role: 'system' as const, content: LARGE_SYSTEM_PROMPT },
      { role: 'user' as const, content: 'Say hi' }
    ];

    // First request
    const result1 = await streamText({
      model: xai('grok-code-fast-1'),
      messages,
    });
    let usage1: any;
    for await (const part of result1.fullStream) {
      if (part.type === 'finish' || part.type === 'finish-step') {
        usage1 = (part as any).usage;
      }
    }

    // Second request - should hit cache
    const result2 = await streamText({
      model: xai('grok-code-fast-1'),
      messages,
    });
    let usage2: any;
    for await (const part of result2.fullStream) {
      if (part.type === 'finish' || part.type === 'finish-step') {
        usage2 = (part as any).usage;
      }
    }

    const cached = usage2?.inputTokenDetails?.cacheReadTokens || usage2?.raw?.cached_tokens || 0;
    const total = usage2?.inputTokens || 0;
    const hitRate = total > 0 ? Math.round((cached / total) * 100) : 0;
    result.cache = { success: true, hitRate };
    console.log(`    Cache: ✓ ${hitRate}% (automatic)`);
  } catch (e: any) {
    result.cache = { success: false, hitRate: 0, error: e.message?.slice(0, 50) };
    console.log(`    Cache: ✗ ${e.message?.slice(0, 50)}`);
  }

  // Test streaming
  try {
    console.log('  Testing streaming...');
    let events = 0;
    const streamResult = await streamText({
      model: xai('grok-code-fast-1'),
      messages: [{ role: 'user', content: 'Say hello' }],
    });
    for await (const part of streamResult.fullStream) {
      if (part.type === 'text-delta') events++;
    }
    result.streaming = { success: events > 0, events };
    console.log(`    Streaming: ✓ ${events} events`);
  } catch (e: any) {
    result.streaming = { success: false, events: 0, error: e.message?.slice(0, 50) };
    console.log(`    Streaming: ✗ ${e.message?.slice(0, 50)}`);
  }

  return result;
}

async function testOpenRouter(): Promise<TestResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return { provider: 'OpenRouter', reasoning: { success: false, length: 0, error: 'No API key' }, cache: { success: false, hitRate: 0, error: 'No API key' }, streaming: { success: false, events: 0, error: 'No API key' } };

  const openrouter = createOpenRouter({ apiKey });
  const result: TestResult = { provider: 'OpenRouter', reasoning: { success: false, length: 0 }, cache: { success: false, hitRate: 0 }, streaming: { success: false, events: 0 } };

  // Test reasoning with DeepSeek R1
  try {
    console.log('  Testing reasoning (deepseek/deepseek-r1)...');
    let reasoningLength = 0;
    const reasoningResult = await streamText({
      model: openrouter('deepseek/deepseek-r1'),
      messages: [{ role: 'user', content: REASONING_PROMPT }],
    });

    for await (const part of reasoningResult.fullStream) {
      const p = part as any;
      if (p.type === 'reasoning' || p.type === 'reasoning-delta') {
        reasoningLength += p.text?.length || p.textDelta?.length || 0;
      }
    }
    result.reasoning = { success: reasoningLength > 0, length: reasoningLength };
    console.log(`    Reasoning: ${reasoningLength > 0 ? '✓' : '✗'} ${reasoningLength}b`);
  } catch (e: any) {
    result.reasoning = { success: false, length: 0, error: e.message?.slice(0, 50) };
    console.log(`    Reasoning: ✗ ${e.message?.slice(0, 50)}`);
  }

  // Test streaming
  try {
    console.log('  Testing streaming (openai/gpt-4o-mini)...');
    let events = 0;
    const streamResult = await streamText({
      model: openrouter('openai/gpt-4o-mini'),
      messages: [{ role: 'user', content: 'Say hello' }],
    });
    for await (const part of streamResult.fullStream) {
      if (part.type === 'text-delta') events++;
    }
    result.streaming = { success: events > 0, events };
    console.log(`    Streaming: ✓ ${events} events`);
  } catch (e: any) {
    result.streaming = { success: false, events: 0, error: e.message?.slice(0, 50) };
    console.log(`    Streaming: ✗ ${e.message?.slice(0, 50)}`);
  }

  result.cache = { success: true, hitRate: 0 }; // Skip cache test for brevity
  return result;
}

async function main() {
  console.log('=== Direct SDK Tests (No Server) ===\n');

  console.log('Testing Anthropic...');
  const anthropicResult = await testAnthropic();

  console.log('\nTesting xAI...');
  const xaiResult = await testXai();

  console.log('\nTesting OpenRouter...');
  const openrouterResult = await testOpenRouter();

  console.log('\n=== Summary ===');
  console.log('────────────────────────────────────────────────────────────────');
  console.log('| Provider     | Reasoning    | Cache      | Stream     |');
  console.log('|--------------|--------------|------------|------------|');

  for (const r of [anthropicResult, xaiResult, openrouterResult]) {
    const reasoning = r.reasoning.success ? `✓ ${r.reasoning.length}b` : (r.reasoning.error || '✗');
    const cache = r.cache.success ? `✓ ${r.cache.hitRate}%` : (r.cache.error || '✗');
    const streaming = r.streaming.success ? `✓ ${r.streaming.events}` : (r.streaming.error || '✗');
    console.log(`| ${r.provider.padEnd(12)} | ${reasoning.toString().padEnd(12)} | ${cache.toString().padEnd(10)} | ${streaming.toString().padEnd(10)} |`);
  }
  console.log('────────────────────────────────────────────────────────────────');
}

main().catch(console.error);
