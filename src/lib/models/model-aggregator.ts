import type { Model } from "@/lib/constants/models";
import type { ProviderFetcher } from "./providers/base-fetcher";
import { OpenRouterFetcher } from "./providers/openrouter-fetcher";
import { OpenAIFetcher } from "./providers/openai-fetcher";
import { AnthropicFetcher } from "./providers/anthropic-fetcher";
import { GoogleFetcher } from "./providers/google-fetcher";
import { TogetherFetcher } from "./providers/together-fetcher";
import { GroqFetcher } from "./providers/groq-fetcher";
import { PerplexityFetcher } from "./providers/perplexity-fetcher";
import { AnyscaleFetcher } from "./providers/anyscale-fetcher";
import { getRuleEngine } from "./rule-engine";

export interface ModelAggregatorOptions {
  providers?: string[];
  apiKeys?: Record<string, string>;
  useOpenRouter?: boolean;
}

export class ModelAggregator {
  private fetchers: Map<string, ProviderFetcher>;
  private ruleEngine = getRuleEngine();

  constructor() {
    this.fetchers = new Map();
    this.registerFetchers();
  }

  private registerFetchers() {
    const fetchers: ProviderFetcher[] = [
      new OpenRouterFetcher(),
      new OpenAIFetcher(),
      new AnthropicFetcher(),
      new GoogleFetcher(),
      new TogetherFetcher(),
      new GroqFetcher(),
      new PerplexityFetcher(),
      new AnyscaleFetcher(),
    ];

    for (const fetcher of fetchers) {
      this.fetchers.set(fetcher.getProviderId(), fetcher);
    }
  }

  /**
   * Fetch models from all configured providers
   */
  async fetchAllProviders(options: ModelAggregatorOptions = {}): Promise<Model[]> {
    const { providers, apiKeys = {}, useOpenRouter = true } = options;

    const providerIds = providers || Array.from(this.fetchers.keys());
    const fetchPromises: Promise<Model[]>[] = [];

    // Always fetch from OpenRouter first as it has the most comprehensive list
    if (useOpenRouter && providerIds.includes("openrouter")) {
      const openRouterFetcher = this.fetchers.get("openrouter");
      if (openRouterFetcher) {
        fetchPromises.push(
          openRouterFetcher.fetchModels(apiKeys.openrouter).catch((err) => {
            console.warn("Failed to fetch from OpenRouter:", err);
            return [];
          })
        );
      }
    }

    // Fetch from other providers in parallel
    for (const providerId of providerIds) {
      if (providerId === "openrouter") continue; // Already handled

      const fetcher = this.fetchers.get(providerId);
      if (!fetcher) continue;

      const apiKey = apiKeys[providerId];
      fetchPromises.push(
        fetcher.fetchModels(apiKey).catch((err) => {
          console.warn(`Failed to fetch from ${providerId}:`, err);
          return [];
        })
      );
    }

    const results = await Promise.all(fetchPromises);
    const allModels = results.flat();

    // Deduplicate by ID (prefer OpenRouter data)
    const modelMap = new Map<string, Model>();
    for (const model of allModels) {
      const existing = modelMap.get(model.id);
      if (!existing || model.provider === "OpenRouter") {
        modelMap.set(model.id, model);
      }
    }

    const uniqueModels = Array.from(modelMap.values());

    // Apply rule engine for categorization
    return this.applyRules(uniqueModels);
  }

  /**
   * Apply rule engine to categorize models
   */
  applyRules(models: Model[]): Model[] {
    return models.map((model) => {
      const categories = this.ruleEngine.categorizeModel(model);
      return {
        ...model,
        category: categories,
      };
    });
  }

  /**
   * Merge metadata from multiple sources
   */
  mergeMetadata(models: Model[]): Model[] {
    // Group by base model ID (without provider prefix)
    const modelGroups = new Map<string, Model[]>();

    for (const model of models) {
      const baseId = model.id.split("/").slice(1).join("/") || model.id;
      if (!modelGroups.has(baseId)) {
        modelGroups.set(baseId, []);
      }
      modelGroups.get(baseId)!.push(model);
    }

    // Merge models with same base ID
    const merged: Model[] = [];
    for (const [baseId, group] of modelGroups.entries()) {
      if (group.length === 1) {
        merged.push(group[0]);
      } else {
        // Merge: prefer OpenRouter data, then most complete data
        const sorted = group.sort((a, b) => {
          if (a.provider === "OpenRouter") return -1;
          if (b.provider === "OpenRouter") return 1;
          return (b.contextLength || 0) - (a.contextLength || 0);
        });
        merged.push(sorted[0]);
      }
    }

    return merged;
  }

  /**
   * Get models for a specific provider
   */
  async fetchProviderModels(
    providerId: string,
    apiKey?: string
  ): Promise<Model[]> {
    const fetcher = this.fetchers.get(providerId);
    if (!fetcher) {
      throw new Error(`Provider ${providerId} not found`);
    }

    const models = await fetcher.fetchModels(apiKey);
    return this.applyRules(models);
  }
}

// Singleton instance
let aggregatorInstance: ModelAggregator | null = null;

export function getModelAggregator(): ModelAggregator {
  if (!aggregatorInstance) {
    aggregatorInstance = new ModelAggregator();
  }
  return aggregatorInstance;
}

