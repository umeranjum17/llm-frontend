# Provider Testing Scripts

Scripts for testing provider functionality including reasoning streaming and cache metrics.

## test-providers.ts

Tests reasoning streaming and cache metrics across all direct providers.

### Prerequisites

1. Start the development server:
   ```bash
   npm run dev
   ```

2. Set up API keys as environment variables:
   ```bash
   export OPENROUTER_API_KEY="sk-or-..."
   export OPENAI_API_KEY="sk-..."
   export ANTHROPIC_API_KEY="sk-ant-..."
   export GOOGLE_API_KEY="..."
   export DEEPSEEK_API_KEY="sk-..."
   export XAI_API_KEY="xai-..."
   ```

### Usage

```bash
# Test all providers
npx tsx scripts/test-providers.ts

# Test a specific provider
npx tsx scripts/test-providers.ts --provider anthropic

# Verbose output (shows event details)
npx tsx scripts/test-providers.ts --verbose

# Set reasoning level (low, medium, high, xhigh)
npx tsx scripts/test-providers.ts --reasoning high

# Skip providers without API keys
npx tsx scripts/test-providers.ts --skip-missing

# Run only specific tests
npx tsx scripts/test-providers.ts --test reasoning
npx tsx scripts/test-providers.ts --test cache
npx tsx scripts/test-providers.ts --test streaming

# Use a different server URL
npx tsx scripts/test-providers.ts --base-url http://localhost:3001
```

### What It Tests

1. **Reasoning Streaming**: Verifies that thinking/reasoning models emit `reasoning` events
   - Uses each provider's reasoning model (e.g., `claude-sonnet-4`, `o4-mini`, `gemini-2.5-flash`)
   - Checks for `reasoning` and `reasoning-delta` event types
   - Reports reasoning content length

2. **Cache Metrics**: Verifies prompt caching is working
   - Sends two identical requests with a large system prompt
   - Second request should show cache hits
   - Reports cache hit rate percentage

3. **Basic Streaming**: Verifies text streaming works
   - Uses each provider's fast model (e.g., `gpt-4o-mini`, `claude-3-haiku`)
   - Checks for `text-delta` events
   - Reports response time

### Output Example

```
Provider Reasoning & Cache Test
================================

Base URL: http://localhost:3000
Reasoning level: medium
Tests: reasoning, cache, streaming
Verbose: false

Testing OpenRouter...
  Reasoning: ✓ (1.2kb)
  Cache: ✓ (45%)
  Streaming: ✓ (234ms)

Testing OpenAI...
  Reasoning: ✓ (0.8kb)
  Cache: ✓ (38%)
  Streaming: ✓ (189ms)

Results Summary
────────────────────────────────────────────────────────────────────────────────
| Provider     | Reasoning    | Cache      | Stream     | Notes                     |
|--------------|--------------|------------|------------|---------------------------|
| OpenRouter   | ✓ 1.2kb      | ✓ 45%      | ✓          |                           |
| OpenAI       | ✓ 0.8kb      | ✓ 38%      | ✓          |                           |
| Anthropic    | ✓ 2.1kb      | ✓ 52%      | ✓          |                           |
| Google       | ✓ 0.5kb      | ✓ 41%      | ✓          |                           |
| DeepSeek     | ✓ 1.5kb      | ✓ 90%      | ✓          |                           |
| xAI          | -            | -          | -          | Skipped (No API key)      |
────────────────────────────────────────────────────────────────────────────────

5/6 providers tested
```

### Troubleshooting

**"No API keys configured"**
- Set at least one API key environment variable

**"Connection refused"**
- Make sure the dev server is running (`npm run dev`)

**"HTTP 401"**
- API key is invalid or expired

**"HTTP 429"**
- Rate limited, wait and try again

**Cache hit rate is 0%**
- Provider may not support prompt caching
- First request establishes cache, second should show hits
- Some providers require minimum token thresholds (1024+ tokens)

**No reasoning events received**
- Model may not support extended thinking
- Try increasing reasoning level with `--reasoning high`
- Check verbose output with `--verbose`
