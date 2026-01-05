<!-- 1b59f374-d09a-4af6-a120-4dcc8b3db49b 69d05935-6757-40d6-a612-f6af5f0ca0fd -->
# Multi-Provider Architecture Enhancement

## Research Summary

### Roo Code's Approach

- **Model-Agnostic Design**: Unified interface that abstracts provider differences
- **OpenAI-Compatible API Support**: Accepts custom base URLs for any OpenAI-compatible provider (OpenRouter, Together AI, etc.)
- **Local Model Support**: Integration with Ollama and LM Studio for local inference
- **Provider Configuration**: Simple setup with base URL + API key + model ID pattern
- **Flexible Routing**: Automatically routes to best available provider based on model requirements

### Key Insights from Research

1. **Provider Abstraction Layer**: Both tools use a unified provider interface that normalizes differences between providers
2. **OpenAI-Compatible Fallback**: Most providers now offer OpenAI-compatible APIs, making it easier to support many providers
3. **Local Model Integration**: Support for local models (Ollama) is increasingly important for privacy and cost
4. **Provider Priority System**: Smart routing that prefers direct providers over aggregators when available

## Current State Analysis

### Existing Implementation

- **Provider Support**: OpenRouter, OpenAI, Anthropic (3 providers)
- **Routing Logic**: Basic provider selection in `src/lib/ai/provider-routing.ts`
- **API Key Management**: Simple store in `src/stores/api-keys-store.ts`
- **API Route**: Hardcoded provider handling in `src/app/api/chat/route.ts`

### Limitations

1. **Hardcoded Providers**: Adding new providers requires code changes
2. **No OpenAI-Compatible Support**: Can't add custom providers with OpenAI-compatible APIs
3. **No Local Model Support**: Missing Ollama/LM Studio integration
4. **Limited Provider Metadata**: No provider-specific configuration (rate limits, features, etc.)
5. **No Provider Priority System**: Simple fallback, no intelligent routing

## Implementation Plan

### Phase 1: Provider Abstraction Layer (Priority: High)

#### 1.1 Provider Registry System

**Files to create:**

- `src/lib/providers/registry.ts` - Central provider registry
- `src/lib/providers/types.ts` - Provider type definitions
- `src/lib/providers/base.ts` - Base provider interface

**Architecture:**

```typescript
interface ProviderConfig {
  id: string;
  name: string;
  type: 'openai-compatible' | 'anthropic' | 'google' | 'local';
  baseUrl?: string; // For OpenAI-compatible
  apiKeyRequired: boolean;
  features: {
    streaming: boolean;
    vision: boolean;
    tools: boolean;
    reasoning: boolean;
  };
  priority: number; // Lower = higher priority
}

interface ProviderAdapter {
  createModel(apiKey: string, modelId: string): any;
  normalizeModelId(modelId: string): string;
  supportsModel(modelId: string): boolean;
}
```

**Benefits:**

- Extensible: Add new providers without modifying core code
- Type-safe: Strong typing for provider capabilities
- Testable: Each provider is isolated and testable

#### 1.2 OpenAI-Compatible Provider Support

**Files to modify:**

- `src/lib/providers/adapters/openai-compatible.ts` - Generic OpenAI adapter
- `src/lib/providers/registry.ts` - Register OpenAI-compatible providers

**Implementation:**

- Support custom base URLs (Together AI, Perplexity, etc.)
- Auto-detect OpenAI-compatible providers
- Unified model ID normalization

**Providers to add:**

- Together AI (`https://api.together.xyz/v1`)
- Perplexity (`https://api.perplexity.ai`)
- Groq (`https://api.groq.com/openai/v1`)
- Anyscale (`https://api.endpoints.anyscale.com/v1`)
- Local OpenAI-compatible (Ollama, LM Studio)

#### 1.3 Local Model Support (Ollama)

**Files to create:**

- `src/lib/providers/adapters/ollama.ts` - Ollama adapter
- `src/components/settings/local-models-settings.tsx` - UI for local models

**Implementation:**

- Detect Ollama instance (default: `http://localhost:11434`)
- List available models from Ollama API
- Support streaming and tool calling
- Fallback to cloud if Ollama unavailable

### Phase 2: Enhanced Provider Management (Priority: High)

#### 2.1 Provider Configuration UI

**Files to modify:**

- `src/components/settings/api-keys-settings.tsx` - Enhanced provider management
- `src/app/onboarding/page.tsx` - Add provider selection with OpenAI-compatible option

**Features:**

- Add custom OpenAI-compatible providers
- Test provider connection before saving
- Provider health monitoring
- Provider usage statistics

#### 2.2 Intelligent Provider Routing

**Files to modify:**

- `src/lib/ai/provider-routing.ts` - Enhanced routing logic

**Routing Strategy:**

1. **Direct Provider Match**: If model belongs to provider with API key, use it
2. **Provider Priority**: Use provider with highest priority (lowest number)
3. **Feature Matching**: Ensure provider supports required features (vision, tools)
4. **Fallback Chain**: OpenRouter → Direct Provider → Local Model

**Example:**

```typescript
function pickBestProvider(opts: {
  modelId: string;
  requiredFeatures: string[];
  availableProviders: ProviderConfig[];
}): ProviderConfig | null {
  // 1. Find providers that support the model
  // 2. Filter by required features
  // 3. Sort by priority
  // 4. Return best match
}
```

#### 2.3 Provider Metadata & Capabilities

**Files to create:**

- `src/lib/providers/metadata.ts` - Provider capabilities database

**Metadata includes:**

- Rate limits per provider
- Supported models list
- Feature flags (vision, tools, reasoning)
- Cost information
- Regional availability

### Phase 3: Database Schema Updates (Priority: Medium)

#### 3.1 Enhanced API Key Schema

**Files to modify:**

- `src/lib/db/schema.ts` - Add provider configuration fields

**Schema changes:**

```typescript
interface ApiKey {
  id: string;
  provider: string;
  key: string;
  label?: string;
  baseUrl?: string; // For OpenAI-compatible
  isLocal?: boolean; // For Ollama
  isActive: boolean;
  lastUsed?: number;
  usageCount: number;
  createdAt: number;
}
```

#### 3.2 Provider Settings Table

**Files to create:**

- Add `ProviderSettings` table to schema

**Purpose:**

- Store provider-specific configurations
- Rate limit tracking
- Feature enablement per provider

### Phase 4: Integration & Testing (Priority: Medium)

#### 4.1 Update API Route

**Files to modify:**

- `src/app/api/chat/route.ts` - Use provider registry instead of hardcoded logic

**Changes:**

- Replace hardcoded provider checks with registry lookup
- Support dynamic provider creation
- Unified error handling

#### 4.2 Update Chat Hook

**Files to modify:**

- `src/hooks/use-chat.ts` - Use new provider routing

**Changes:**

- Use provider registry for key lookup
- Support provider fallback chain
- Better error messages with provider suggestions

## Roadmap Integration

### Priority: **P0 - Critical** (Add to Phase 1 of roadmap)

**Rationale:**

1. **Competitive Necessity**: Roo Code and Cline both excel at multi-provider support
2. **User Flexibility**: Users want to choose providers based on cost, speed, features
3. **Future-Proofing**: New providers emerge frequently; need extensible architecture
4. **Local Model Trend**: Privacy-conscious users want local inference options

**Dependencies:**

- None (can be implemented independently)

**Estimated Effort:**

- Phase 1: 1-2 weeks
- Phase 2: 1 week
- Phase 3: 3-4 days
- Phase 4: 3-4 days
- **Total: 3-4 weeks**

## Success Metrics

1. **Provider Coverage**: Support 10+ providers (including local models)
2. **User Adoption**: 30%+ users configure multiple providers
3. **Provider Switching**: Users can switch providers mid-conversation
4. **Local Model Usage**: 10%+ users use Ollama/local models
5. **Error Reduction**: 50% reduction in provider-related errors

## References

- [Roo Code GitHub](https://github.com/RooCodeInc/Roo-Code) - Provider management patterns
- [Roo Code Provider Docs](https://docs.roocode.com/providers/) - Configuration examples
- [OpenAI-Compatible API Spec](https://platform.openai.com/docs/api-reference) - Standard interface
- [Ollama API Docs](https://github.com/ollama/ollama/blob/main/docs/api.md) - Local model integration

## Implementation Notes

1. **Backward Compatibility**: Existing provider keys must continue working
2. **Migration Path**: Auto-migrate existing keys to new schema
3. **Testing**: Each provider adapter needs integration tests
4. **Documentation**: User guide for adding custom providers
5. **Error Handling**: Graceful fallback when provider unavailable