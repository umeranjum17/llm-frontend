import type { Model } from "@/lib/constants/models";
import categoryRulesData from "./rules/category-rules.json";
import capabilityRulesData from "./rules/capability-rules.json";
import useCaseMappingData from "./rules/use-case-mapping.json";

const categoryRules = categoryRulesData as any;
const capabilityRules = capabilityRulesData as any;
const useCaseMapping = useCaseMappingData as any;

export interface RuleMatchResult {
  matched: boolean;
  score: number;
  reason?: string;
}

export interface CategoryRule {
  patterns?: string[];
  metadata?: Record<string, any>;
  minScore?: number;
  default?: boolean;
}

export interface CapabilityRule {
  patterns?: string[];
  metadata?: Record<string, any>;
  default?: boolean;
  exceptions?: string[];
}

/**
 * Rule Engine for dynamic model categorization and capability detection
 */
export class RuleEngine {
  private categoryRules: Record<string, CategoryRule>;
  private capabilityRules: Record<string, CapabilityRule>;
  private useCaseMapping: Record<string, any>;

  constructor() {
    this.categoryRules = categoryRules.categories;
    this.capabilityRules = capabilityRules.capabilities;
    this.useCaseMapping = useCaseMapping.useCases;
  }

  /**
   * Determine categories for a model based on rules
   */
  categorizeModel(model: Model): string[] {
    const categories: string[] = [];
    const modelId = model.id.toLowerCase();
    const modelName = model.name?.toLowerCase() || "";
    const description = model.description?.toLowerCase() || "";
    const combinedText = `${modelId} ${modelName} ${description}`;

    for (const [categoryName, rule] of Object.entries(this.categoryRules)) {
      if (this.matchesCategoryRule(combinedText, model, rule)) {
        categories.push(categoryName);
      }
    }

    // Always add "balanced" if no specific category matched
    if (categories.length === 0 || (categories.length === 1 && categories[0] === "balanced")) {
      if (!categories.includes("balanced")) {
        categories.push("balanced");
      }
    }

    return categories;
  }

  /**
   * Check if a model matches a category rule
   */
  private matchesCategoryRule(
    text: string,
    model: Model,
    rule: CategoryRule
  ): boolean {
    // Check patterns
    if (rule.patterns) {
      const patternMatch = rule.patterns.some((pattern) =>
        text.includes(pattern.toLowerCase())
      );
      if (patternMatch) {
        return true;
      }
    }

    // Check metadata conditions
    if (rule.metadata) {
      for (const [key, value] of Object.entries(rule.metadata)) {
        if (key === "price") {
          const totalPrice = model.inputCost + model.outputCost;
          if (value.max !== undefined && totalPrice > value.max) {
            return false;
          }
          if (value.min !== undefined && totalPrice < value.min) {
            return false;
          }
        } else if (key === "modality") {
          // This would need to come from model metadata
          // For now, check if supportsVision is set
          if (Array.isArray(value) && model.supportsVision) {
            return true;
          }
        } else if (key === "supportsVision") {
          if (model.supportsVision === value) {
            return true;
          }
        } else if (key === "description") {
          const desc = model.description?.toLowerCase() || "";
          if (Array.isArray(value)) {
            const match = value.some((term) => desc.includes(term));
            if (match) return true;
          }
        } else if (key === "name") {
          const name = model.name?.toLowerCase() || "";
          if (Array.isArray(value)) {
            const match = value.some((term) => name.includes(term));
            if (match) return true;
          }
        }
      }
    }

    // Default category
    if (rule.default) {
      return true;
    }

    return false;
  }

  /**
   * Determine capabilities for a model based on rules
   */
  detectCapabilities(model: Model, provider?: string): Record<string, boolean | number> {
    const capabilities: Record<string, boolean | number> = {};
    const modelId = model.id.toLowerCase();
    const modelName = model.name?.toLowerCase() || "";
    const description = model.description?.toLowerCase() || "";
    const combinedText = `${modelId} ${modelName} ${description}`;

    // Get provider defaults
    const providerDefaults = capabilityRules.providerDefaults[provider as keyof typeof capabilityRules.providerDefaults] || {};
    const defaults = { ...capabilityRules.defaults, ...providerDefaults };

    // Check special cases first
    const specialCase = capabilityRules.specialCases[model.id];
    if (specialCase) {
      return { ...defaults, ...specialCase };
    }

    // Check each capability rule
    for (const [capabilityName, rule] of Object.entries(this.capabilityRules)) {
      if (rule.default !== undefined) {
        capabilities[capabilityName] = rule.default;
      } else {
        capabilities[capabilityName] = this.matchesCapabilityRule(combinedText, model, rule);
      }
    }

    // Apply defaults for capabilities not detected
    for (const [key, value] of Object.entries(defaults)) {
      if (capabilities[key] === undefined) {
        if (typeof value === "boolean" || typeof value === "number") {
          capabilities[key] = value;
        }
      }
    }

    return capabilities;
  }

  /**
   * Check if a model matches a capability rule
   */
  private matchesCapabilityRule(
    text: string,
    model: Model,
    rule: CapabilityRule
  ): boolean {
    // Check exceptions
    if (rule.exceptions) {
      const isException = rule.exceptions.some((exception) =>
        text.includes(exception.toLowerCase())
      );
      if (isException) {
        return false;
      }
    }

    // Check patterns
    if (rule.patterns) {
      const patternMatch = rule.patterns.some((pattern) =>
        text.includes(pattern.toLowerCase())
      );
      if (patternMatch) {
        return true;
      }
    }

    // Check metadata
    if (rule.metadata) {
      for (const [key, value] of Object.entries(rule.metadata)) {
        if (key === "modality") {
          // Would need model metadata
          if (Array.isArray(value) && model.supportsVision) {
            return true;
          }
        } else if (key === "reasoning" && value === true) {
          if (model.supportsReasoning) {
            return true;
          }
        } else if (key === "tools" || key === "function_calling") {
          // Most modern models support tools
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Get recommended models for a use case
   */
  getRecommendedModelsForUseCase(useCase: string, availableModels: Model[]): Model[] {
    const useCaseConfig = this.useCaseMapping[useCase];
    if (!useCaseConfig) {
      return [];
    }

    const preferred = (useCaseConfig.preferredModels || []) as string[];
    const preferredCategories = (useCaseConfig.preferredCategories || []) as string[];

    // Filter models by preferred categories
    const categoryMatches = availableModels.filter((model) => {
      const categories = this.categorizeModel(model);
      return preferredCategories.some((cat) => categories.includes(cat));
    });

    // Sort by preferred model names
    const sorted = categoryMatches.sort((a, b) => {
      const aIndex = preferred.findIndex((p) => a.id.toLowerCase().includes(p.toLowerCase()));
      const bIndex = preferred.findIndex((p) => b.id.toLowerCase().includes(p.toLowerCase()));
      
      if (aIndex === -1 && bIndex === -1) return 0;
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });

    return sorted.slice(0, 10); // Return top 10
  }

  /**
   * Get use case for a model based on its characteristics
   */
  getUseCasesForModel(model: Model): string[] {
    const useCases: string[] = [];
    const categories = this.categorizeModel(model);

    for (const [useCaseName, config] of Object.entries(this.useCaseMapping)) {
      const preferredCategories = (config.preferredCategories || []) as string[];
      if (preferredCategories.some((cat) => categories.includes(cat))) {
        useCases.push(useCaseName);
      }
    }

    return useCases;
  }
}

// Singleton instance
let ruleEngineInstance: RuleEngine | null = null;

export function getRuleEngine(): RuleEngine {
  if (!ruleEngineInstance) {
    ruleEngineInstance = new RuleEngine();
  }
  return ruleEngineInstance;
}
