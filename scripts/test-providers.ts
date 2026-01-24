#!/usr/bin/env npx tsx
/**
 * Provider Reasoning & Cache Testing Script
 *
 * Tests reasoning streaming and cache metrics across all direct providers.
 *
 * Usage:
 *   npx tsx scripts/test-providers.ts                    # Test all providers
 *   npx tsx scripts/test-providers.ts --provider openai  # Test specific provider
 *   npx tsx scripts/test-providers.ts --verbose          # Detailed output
 *   npx tsx scripts/test-providers.ts --reasoning high   # Set reasoning level
 *   npx tsx scripts/test-providers.ts --skip-missing     # Skip providers without keys
 *   npx tsx scripts/test-providers.ts --test reasoning   # Only run reasoning test
 *   npx tsx scripts/test-providers.ts --test cache       # Only run cache test
 *   npx tsx scripts/test-providers.ts --test streaming   # Only run streaming test
 */

import {
  PROVIDERS,
  REASONING_TEST_PROMPT,
  BASIC_TEST_PROMPT,
  CACHEABLE_SYSTEM_PROMPT,
  type ProviderConfig,
} from './test-providers.config';

// =============================================================================
// Types
// =============================================================================

interface StreamEvent {
  type: string;
  [key: string]: any;
}

interface TestResult {
  provider: string;
  reasoning: {
    success: boolean;
    received: boolean;
    length: number;
    textReceived: boolean;
    error?: string;
  } | null;
  cache: {
    success: boolean;
    cachedTokens: number;
    cacheHitRate: number;
    error?: string;
  } | null;
  streaming: {
    success: boolean;
    tokensReceived: number;
    responseTime: number;
    error?: string;
  } | null;
  skipped: boolean;
  skipReason?: string;
}

interface CLIArgs {
  provider?: string;
  verbose: boolean;
  reasoningLevel: 'low' | 'medium' | 'high' | 'xhigh';
  skipMissing: boolean;
  baseUrl: string;
  tests: Set<'reasoning' | 'cache' | 'streaming'>;
  help: boolean;
}

// =============================================================================
// CLI Argument Parsing
// =============================================================================

function parseArgs(): CLIArgs {
  const args = process.argv.slice(2);
  const result: CLIArgs = {
    verbose: false,
    reasoningLevel: 'medium',
    skipMissing: false,
    baseUrl: 'http://localhost:3000',
    tests: new Set<'reasoning' | 'cache' | 'streaming'>(['reasoning', 'cache', 'streaming']),
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--provider':
      case '-p':
        result.provider = args[++i]?.toLowerCase();
        break;
      case '--verbose':
      case '-v':
        result.verbose = true;
        break;
      case '--reasoning':
      case '-r':
        result.reasoningLevel = args[++i] as CLIArgs['reasoningLevel'];
        break;
      case '--skip-missing':
      case '-s':
        result.skipMissing = true;
        break;
      case '--base-url':
      case '-b':
        result.baseUrl = args[++i];
        break;
      case '--test':
      case '-t':
        if (result.tests.size === 3) {
          result.tests.clear();
        }
        const test = args[++i]?.toLowerCase() as 'reasoning' | 'cache' | 'streaming';
        if (['reasoning', 'cache', 'streaming'].includes(test)) {
          result.tests.add(test);
        }
        break;
      case '--help':
      case '-h':
        result.help = true;
        break;
    }
  }

  return result;
}

function printHelp(): void {
  console.log(`
Provider Reasoning & Cache Testing Script

Usage:
  npx tsx scripts/test-providers.ts [options]

Options:
  -p, --provider <id>     Test only this provider (openrouter, openai, anthropic, google, deepseek, xai)
  -v, --verbose           Show detailed output including event logs
  -r, --reasoning <level> Set reasoning level: low, medium, high, xhigh (default: medium)
  -s, --skip-missing      Skip providers without API keys instead of failing
  -b, --base-url <url>    Base URL for the API (default: http://localhost:3000)
  -t, --test <type>       Run specific test only: reasoning, cache, streaming (can be repeated)
  -h, --help              Show this help message

Environment Variables:
  OPENROUTER_API_KEY      API key for OpenRouter
  OPENAI_API_KEY          API key for OpenAI
  ANTHROPIC_API_KEY       API key for Anthropic
  GOOGLE_API_KEY          API key for Google AI
  DEEPSEEK_API_KEY        API key for DeepSeek
  XAI_API_KEY             API key for xAI

Examples:
  # Test all providers with API keys configured
  npx tsx scripts/test-providers.ts

  # Test only Anthropic with verbose output
  npx tsx scripts/test-providers.ts -p anthropic -v

  # Test reasoning streaming with high reasoning level
  npx tsx scripts/test-providers.ts -t reasoning -r high

  # Skip providers without keys
  npx tsx scripts/test-providers.ts -s
`);
}

// =============================================================================
// SSE Stream Parser
// =============================================================================

async function parseSSEStream(
  response: Response,
  verbose: boolean
): Promise<{ events: StreamEvent[]; error?: string }> {
  const events: StreamEvent[] = [];

  if (!response.body) {
    return { events: [], error: 'No response body' };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE messages
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim();

          if (data === '[DONE]') {
            continue;
          }

          try {
            const event = JSON.parse(data);
            events.push(event);

            if (verbose && event.type !== 'text-delta') {
              console.log(`  [Event] ${event.type}:`, JSON.stringify(event).slice(0, 100));
            }
          } catch (e) {
            // Skip malformed JSON
          }
        }
      }
    }
  } catch (error) {
    return { events, error: error instanceof Error ? error.message : 'Stream read error' };
  }

  return { events };
}

// =============================================================================
// Test Functions
// =============================================================================

async function testReasoningStreaming(
  provider: ProviderConfig,
  apiKey: string,
  args: CLIArgs
): Promise<TestResult['reasoning']> {
  if (!provider.reasoningModel) {
    return {
      success: true,
      received: false,
      length: 0,
      textReceived: false,
      error: 'No reasoning model configured',
    };
  }

  const startTime = Date.now();

  try {
    const response = await fetch(`${args.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({
        providerId: provider.id,
        modelId: provider.reasoningModel,
        messages: [
          { role: 'user', content: REASONING_TEST_PROMPT },
        ],
        reasoningLevel: args.reasoningLevel,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        received: false,
        length: 0,
        textReceived: false,
        error: `HTTP ${response.status}: ${errorText.slice(0, 100)}`,
      };
    }

    const { events, error } = await parseSSEStream(response, args.verbose);

    if (error) {
      return {
        success: false,
        received: false,
        length: 0,
        textReceived: false,
        error,
      };
    }

    // Analyze events
    const reasoningEvents = events.filter(e => e.type === 'reasoning' || e.type === 'reasoning-delta');
    const textEvents = events.filter(e => e.type === 'text-delta');

    const reasoningText = reasoningEvents
      .map(e => e.text || e.textDelta || e.delta || '')
      .join('');

    if (args.verbose) {
      console.log(`  Reasoning events: ${reasoningEvents.length}`);
      console.log(`  Reasoning length: ${reasoningText.length} chars`);
      console.log(`  Text events: ${textEvents.length}`);
      console.log(`  Time: ${Date.now() - startTime}ms`);
    }

    return {
      success: true,
      received: reasoningEvents.length > 0,
      length: reasoningText.length,
      textReceived: textEvents.length > 0,
    };
  } catch (error) {
    return {
      success: false,
      received: false,
      length: 0,
      textReceived: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function testCacheMetrics(
  provider: ProviderConfig,
  apiKey: string,
  args: CLIArgs
): Promise<TestResult['cache']> {
  const startTime = Date.now();

  try {
    // First request - should be cache miss
    const request1 = await fetch(`${args.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({
        providerId: provider.id,
        modelId: provider.standardModel,
        messages: [
          { role: 'system', content: CACHEABLE_SYSTEM_PROMPT },
          { role: 'user', content: 'What is 2+2? Answer briefly.' },
        ],
      }),
    });

    if (!request1.ok) {
      const errorText = await request1.text();
      return {
        success: false,
        cachedTokens: 0,
        cacheHitRate: 0,
        error: `HTTP ${request1.status}: ${errorText.slice(0, 100)}`,
      };
    }

    const { events: events1 } = await parseSSEStream(request1, args.verbose);

    // Wait a moment for cache to be established
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Second request - should be cache hit
    const request2 = await fetch(`${args.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({
        providerId: provider.id,
        modelId: provider.standardModel,
        messages: [
          { role: 'system', content: CACHEABLE_SYSTEM_PROMPT },
          { role: 'user', content: 'What is 3+3? Answer briefly.' },
        ],
      }),
    });

    if (!request2.ok) {
      const errorText = await request2.text();
      return {
        success: false,
        cachedTokens: 0,
        cacheHitRate: 0,
        error: `HTTP ${request2.status}: ${errorText.slice(0, 100)}`,
      };
    }

    const { events: events2 } = await parseSSEStream(request2, args.verbose);

    // Extract usage data from second request
    const usageEvents = events2.filter(e => e.usage);
    let cachedTokens = 0;
    let inputTokens = 0;

    for (const event of usageEvents) {
      const usage = event.usage;
      if (usage) {
        inputTokens = usage.inputTokens || usage.promptTokens || 0;
        // Check all possible locations for cached tokens across providers
        cachedTokens =
          // Anthropic (via AI SDK): inputTokenDetails.cacheReadTokens
          usage.inputTokenDetails?.cacheReadTokens ||
          // Anthropic raw: cache_read_input_tokens
          usage.raw?.cache_read_input_tokens ||
          // AI SDK normalized: cachedInputTokens
          usage.cachedInputTokens ||
          // OpenAI: promptTokensDetails.cachedTokens
          usage.promptTokensDetails?.cachedTokens ||
          // Generic fallbacks
          usage.cachedTokens ||
          usage.cache_read_input_tokens ||
          usage.prompt_cache_hit_tokens ||
          0;
      }
    }

    const cacheHitRate = inputTokens > 0 ? (cachedTokens / inputTokens) * 100 : 0;

    if (args.verbose) {
      console.log(`  Input tokens: ${inputTokens}`);
      console.log(`  Cached tokens: ${cachedTokens}`);
      console.log(`  Cache hit rate: ${cacheHitRate.toFixed(1)}%`);
      console.log(`  Time: ${Date.now() - startTime}ms`);
    }

    return {
      success: true,
      cachedTokens,
      cacheHitRate,
    };
  } catch (error) {
    return {
      success: false,
      cachedTokens: 0,
      cacheHitRate: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function testBasicStreaming(
  provider: ProviderConfig,
  apiKey: string,
  args: CLIArgs
): Promise<TestResult['streaming']> {
  const startTime = Date.now();

  try {
    const response = await fetch(`${args.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({
        providerId: provider.id,
        modelId: provider.standardModel,
        messages: [
          { role: 'user', content: BASIC_TEST_PROMPT },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        tokensReceived: 0,
        responseTime: Date.now() - startTime,
        error: `HTTP ${response.status}: ${errorText.slice(0, 100)}`,
      };
    }

    const { events, error } = await parseSSEStream(response, args.verbose);

    if (error) {
      return {
        success: false,
        tokensReceived: 0,
        responseTime: Date.now() - startTime,
        error,
      };
    }

    const textEvents = events.filter(e => e.type === 'text-delta');
    const responseTime = Date.now() - startTime;

    if (args.verbose) {
      console.log(`  Text events: ${textEvents.length}`);
      console.log(`  Time: ${responseTime}ms`);
    }

    return {
      success: textEvents.length > 0,
      tokensReceived: textEvents.length,
      responseTime,
      error: textEvents.length === 0 ? 'No text-delta events received' : undefined,
    };
  } catch (error) {
    return {
      success: false,
      tokensReceived: 0,
      responseTime: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// =============================================================================
// Test Runner
// =============================================================================

async function testProvider(
  provider: ProviderConfig,
  args: CLIArgs
): Promise<TestResult> {
  const apiKey = process.env[provider.envVar];

  if (!apiKey) {
    return {
      provider: provider.name,
      reasoning: null,
      cache: null,
      streaming: null,
      skipped: true,
      skipReason: `No ${provider.envVar} set`,
    };
  }

  console.log(`\nTesting ${provider.name}...`);

  const result: TestResult = {
    provider: provider.name,
    reasoning: null,
    cache: null,
    streaming: null,
    skipped: false,
  };

  // Run requested tests
  if (args.tests.has('reasoning')) {
    if (args.verbose) console.log('  Running reasoning test...');
    result.reasoning = await testReasoningStreaming(provider, apiKey, args);
    console.log(`  Reasoning: ${result.reasoning!.received ? `\x1b[32m✓\x1b[0m (${formatBytes(result.reasoning!.length)})` : result.reasoning!.success ? '\x1b[33m- (no model)\x1b[0m' : `\x1b[31m✗\x1b[0m ${result.reasoning!.error}`}`);
  }

  if (args.tests.has('cache')) {
    if (args.verbose) console.log('  Running cache test...');
    result.cache = await testCacheMetrics(provider, apiKey, args);
    console.log(`  Cache: ${result.cache!.success ? `\x1b[32m✓\x1b[0m (${result.cache!.cacheHitRate.toFixed(0)}%)` : `\x1b[31m✗\x1b[0m ${result.cache!.error}`}`);
  }

  if (args.tests.has('streaming')) {
    if (args.verbose) console.log('  Running streaming test...');
    result.streaming = await testBasicStreaming(provider, apiKey, args);
    console.log(`  Streaming: ${result.streaming!.success ? `\x1b[32m✓\x1b[0m (${result.streaming!.responseTime}ms)` : `\x1b[31m✗\x1b[0m ${result.streaming!.error}`}`);
  }

  return result;
}

// =============================================================================
// Results Reporter
// =============================================================================

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}b`;
  return `${(bytes / 1024).toFixed(1)}kb`;
}

function printResultsTable(results: TestResult[]): void {
  console.log('\n');
  console.log('\x1b[1mResults Summary\x1b[0m');
  console.log('─'.repeat(80));

  // Header
  console.log(
    '| ' +
    'Provider'.padEnd(12) + ' | ' +
    'Reasoning'.padEnd(12) + ' | ' +
    'Cache'.padEnd(10) + ' | ' +
    'Stream'.padEnd(10) + ' | ' +
    'Notes'.padEnd(25) + ' |'
  );
  console.log('|' + '-'.repeat(14) + '|' + '-'.repeat(14) + '|' + '-'.repeat(12) + '|' + '-'.repeat(12) + '|' + '-'.repeat(27) + '|');

  for (const result of results) {
    let reasoningCol = '-';
    let cacheCol = '-';
    let streamCol = '-';
    let notes = '';

    if (result.skipped) {
      notes = `Skipped (${result.skipReason})`;
    } else {
      if (result.reasoning) {
        if (result.reasoning.received) {
          reasoningCol = `\x1b[32m✓\x1b[0m ${formatBytes(result.reasoning.length)}`;
        } else if (result.reasoning.success) {
          reasoningCol = '\x1b[33m-\x1b[0m';
          notes = 'No reasoning model';
        } else {
          reasoningCol = '\x1b[31m✗\x1b[0m';
          notes = result.reasoning.error?.slice(0, 20) || 'Error';
        }
      }

      if (result.cache) {
        if (result.cache.success) {
          cacheCol = `\x1b[32m✓\x1b[0m ${result.cache.cacheHitRate.toFixed(0)}%`;
        } else {
          cacheCol = '\x1b[31m✗\x1b[0m';
          if (!notes) notes = result.cache.error?.slice(0, 20) || 'Error';
        }
      }

      if (result.streaming) {
        if (result.streaming.success) {
          streamCol = `\x1b[32m✓\x1b[0m`;
        } else {
          streamCol = '\x1b[31m✗\x1b[0m';
          if (!notes) notes = result.streaming.error?.slice(0, 20) || 'Error';
        }
      }
    }

    // Account for ANSI codes in padding
    const reasoningPad = reasoningCol.includes('\x1b') ? 12 + 9 : 12;
    const cachePad = cacheCol.includes('\x1b') ? 10 + 9 : 10;
    const streamPad = streamCol.includes('\x1b') ? 10 + 9 : 10;

    console.log(
      '| ' +
      result.provider.padEnd(12) + ' | ' +
      reasoningCol.padEnd(reasoningPad) + ' | ' +
      cacheCol.padEnd(cachePad) + ' | ' +
      streamCol.padEnd(streamPad) + ' | ' +
      notes.slice(0, 25).padEnd(25) + ' |'
    );
  }

  console.log('─'.repeat(80));

  // Summary
  const tested = results.filter(r => !r.skipped).length;
  const total = results.length;
  console.log(`\n${tested}/${total} providers tested`);
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  const args = parseArgs();

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  console.log('\x1b[1mProvider Reasoning & Cache Test\x1b[0m');
  console.log('================================\n');

  console.log(`Base URL: ${args.baseUrl}`);
  console.log(`Reasoning level: ${args.reasoningLevel}`);
  console.log(`Tests: ${Array.from(args.tests).join(', ')}`);
  console.log(`Verbose: ${args.verbose}`);

  // Filter providers if specified
  let providers = PROVIDERS;
  if (args.provider) {
    providers = PROVIDERS.filter(p => p.id === args.provider);
    if (providers.length === 0) {
      console.error(`\x1b[31mError: Unknown provider '${args.provider}'\x1b[0m`);
      console.log('Available providers:', PROVIDERS.map(p => p.id).join(', '));
      process.exit(1);
    }
  }

  // Check for at least one API key
  const hasAnyKey = providers.some(p => process.env[p.envVar]);
  if (!hasAnyKey) {
    console.error('\x1b[31mError: No API keys configured\x1b[0m');
    console.log('Set at least one of:');
    for (const provider of providers) {
      console.log(`  export ${provider.envVar}=your-key`);
    }
    process.exit(1);
  }

  // Run tests
  const results: TestResult[] = [];

  for (const provider of providers) {
    const apiKey = process.env[provider.envVar];

    if (!apiKey && args.skipMissing) {
      results.push({
        provider: provider.name,
        reasoning: null,
        cache: null,
        streaming: null,
        skipped: true,
        skipReason: 'No API key',
      });
      continue;
    }

    const result = await testProvider(provider, args);
    results.push(result);
  }

  // Print results
  printResultsTable(results);
}

main().catch(error => {
  console.error('\x1b[31mFatal error:\x1b[0m', error);
  process.exit(1);
});
