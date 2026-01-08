/**
 * Local LLM Provider Detection Service
 * Auto-detects Ollama and LM Studio instances running locally
 */

export interface LocalProviderStatus {
  providerId: "ollama" | "lmstudio";
  connected: boolean;
  checking: boolean;
  lastChecked?: number;
  error?: string;
  baseUrl: string;
  availableModels?: string[];
}

const DEFAULT_PORTS = {
  ollama: 11434,
  lmstudio: 1234,
};

const DEFAULT_BASE_URLS = {
  ollama: "http://localhost:11434/v1",
  lmstudio: "http://localhost:1234/v1",
};

export class LocalProviderDetector {
  private statusCache: Map<string, LocalProviderStatus> = new Map();
  private checkIntervals: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Check if a local provider is available
   */
  async checkProvider(providerId: "ollama" | "lmstudio", customPort?: number): Promise<LocalProviderStatus> {
    const port = customPort || DEFAULT_PORTS[providerId];
    const baseUrl = customPort 
      ? `http://localhost:${port}/v1`
      : DEFAULT_BASE_URLS[providerId];

    const status: LocalProviderStatus = {
      providerId,
      connected: false,
      checking: true,
      baseUrl,
      lastChecked: Date.now(),
    };

    try {
      // For Ollama, check /api/tags endpoint
      if (providerId === "ollama") {
        const response = await fetch(`http://localhost:${port}/api/tags`, {
          method: "GET",
          signal: AbortSignal.timeout(3000), // 3 second timeout
        });

        if (response.ok) {
          const data = await response.json();
          status.connected = true;
          status.availableModels = (data.models || []).map((m: any) => m.name);
        } else {
          status.error = `HTTP ${response.status}`;
        }
      } 
      // For LM Studio, check /v1/models endpoint (OpenAI-compatible)
      else if (providerId === "lmstudio") {
        const response = await fetch(`${baseUrl}/models`, {
          method: "GET",
          signal: AbortSignal.timeout(3000),
        });

        if (response.ok) {
          const data = await response.json();
          status.connected = true;
          status.availableModels = (data.data || []).map((m: any) => m.id);
        } else {
          status.error = `HTTP ${response.status}`;
        }
      }
    } catch (error) {
      status.error = error instanceof Error ? error.message : "Connection failed";
      status.connected = false;
    } finally {
      status.checking = false;
    }

    this.statusCache.set(providerId, status);
    return status;
  }

  /**
   * Get cached status for a provider
   */
  getStatus(providerId: "ollama" | "lmstudio"): LocalProviderStatus | undefined {
    return this.statusCache.get(providerId);
  }

  /**
   * Start auto-checking a provider at intervals
   */
  startAutoCheck(providerId: "ollama" | "lmstudio", intervalMs: number = 10000, customPort?: number) {
    this.stopAutoCheck(providerId);

    const check = async () => {
      await this.checkProvider(providerId, customPort);
    };

    // Check immediately
    check();

    // Then check at intervals
    const interval = setInterval(check, intervalMs);
    this.checkIntervals.set(providerId, interval);
  }

  /**
   * Stop auto-checking a provider
   */
  stopAutoCheck(providerId: "ollama" | "lmstudio") {
    const interval = this.checkIntervals.get(providerId);
    if (interval) {
      clearInterval(interval);
      this.checkIntervals.delete(providerId);
    }
  }

  /**
   * Stop all auto-checks
   */
  stopAllAutoChecks() {
    for (const [providerId] of this.checkIntervals) {
      this.stopAutoCheck(providerId as "ollama" | "lmstudio");
    }
  }
}

// Singleton instance
export const localDetector = new LocalProviderDetector();


