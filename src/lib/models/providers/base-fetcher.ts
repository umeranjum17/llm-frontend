import type { Model } from "@/lib/constants/models";

export interface ProviderFetcher {
  fetchModels(apiKey?: string): Promise<Model[]>;
  getProviderId(): string;
}

export interface ProviderModelResponse {
  id: string;
  name?: string;
  description?: string;
  context_length?: number;
  max_completion_tokens?: number;
  pricing?: {
    prompt?: string;
    completion?: string;
  };
  architecture?: {
    modality?: string;
    input_modalities?: string[];
    output_modalities?: string[];
  };
  [key: string]: any;
}




