"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ProviderTile } from "../provider-tile";
import { SecretInput } from "../secret-input";
import { TrustPanel } from "../trust-panel";
import { ValidationStatus, type ValidationPhase } from "../validation-status";
import { useApiKeysStore } from "@/stores/api-keys-store";
import { toast } from "sonner";
import { ExternalLink, Info } from "lucide-react";

const PROVIDERS = [
  {
    id: "openrouter",
    name: "OpenRouter",
    placeholder: "sk-or-v1-...",
    url: "https://openrouter.ai/keys",
    recommended: true,
  },
  {
    id: "openai",
    name: "OpenAI",
    placeholder: "sk-...",
    url: "https://platform.openai.com/api-keys",
    recommended: false,
  },
  {
    id: "anthropic",
    name: "Anthropic",
    placeholder: "sk-ant-...",
    url: "https://console.anthropic.com/settings/keys",
    recommended: false,
  },
];

interface ProviderStepV2Props {
  onComplete: (providerId: string) => void;
}

export function ProviderStepV2({ onComplete }: ProviderStepV2Props) {
  const { addKey } = useApiKeysStore();
  const [selectedProvider, setSelectedProvider] = useState("openrouter");
  const [apiKey, setApiKey] = useState("");
  const [validationPhase, setValidationPhase] = useState<ValidationPhase>("idle");
  const [validationDetails, setValidationDetails] = useState<{
    responseTime?: number;
    errorType?: string;
    errorMessage?: string;
    suggestion?: string;
  }>({});

  const provider = PROVIDERS.find((p) => p.id === selectedProvider)!;

  const validateAndSave = async () => {
    if (!apiKey.trim()) return;

    // Phase 1: Connecting
    setValidationPhase("connecting");
    setValidationDetails({});

    // Small delay to show connecting state
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Phase 2: Verifying
    setValidationPhase("verifying");

    try {
      const response = await fetch("/api/providers/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: selectedProvider,
          apiKey: apiKey.trim(),
        }),
      });

      const data = await response.json();

      if (response.ok && data.ok) {
        // Phase 3: Success
        setValidationPhase("success");
        setValidationDetails({
          responseTime: data.responseTime,
        });
        await addKey(selectedProvider, apiKey.trim(), provider.name);
        toast.success(`Connected to ${provider.name}`);

        // Auto-advance after 1 second to show success state
        setTimeout(() => {
          onComplete(selectedProvider);
        }, 1000);
      } else {
        // Phase 3: Error
        setValidationPhase("error");
        setValidationDetails({
          errorType: data.errorType,
          errorMessage: data.error,
          suggestion: data.suggestion,
        });
      }
    } catch (error) {
      setValidationPhase("error");
      setValidationDetails({
        errorType: "network_error",
        errorMessage: "Network error",
        suggestion: "Please check your internet connection and try again",
      });
    }
  };

  // Reset validation state when API key changes
  useEffect(() => {
    setValidationPhase("idle");
    setValidationDetails({});
  }, [apiKey]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (
      e.key === "Enter" &&
      apiKey.trim() &&
      validationPhase !== "connecting" &&
      validationPhase !== "verifying" &&
      validationPhase !== "success"
    ) {
      validateAndSave();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">
          Connect your AI provider
        </h1>
        <p className="text-muted-foreground">
          Add your API key to get started
        </p>
      </div>

      {/* Provider Selection */}
      <div className="space-y-3 pt-2">
        <Label>Select Provider</Label>
        <div className="grid grid-cols-1 gap-3">
          {PROVIDERS.map((p) => (
            <ProviderTile
              key={p.id}
              name={p.name}
              selected={selectedProvider === p.id}
              recommended={p.recommended}
              onClick={() => setSelectedProvider(p.id)}
            />
          ))}
        </div>
      </div>

      {/* API Key Input */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="api-key">API Key</Label>
          <a
            href={provider.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
          >
            Get your key
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <SecretInput
          id="api-key"
          placeholder={provider.placeholder}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          onKeyDown={handleKeyDown}
          validationPhase={validationPhase}
          providerName={provider.name}
          autoFocus
        />

        {/* Validation Status */}
        <ValidationStatus
          phase={validationPhase}
          provider={provider.name}
          responseTime={validationDetails.responseTime}
          errorMessage={validationDetails.errorMessage}
          errorType={validationDetails.errorType}
          suggestion={validationDetails.suggestion}
        />
      </div>

      {/* Info Panel */}
      <Alert className="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30">
        <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        <AlertDescription className="text-sm text-blue-900 dark:text-blue-100">
          We&apos;ll verify your API key by making a test call to {provider.name}&apos;s servers.
          This confirms your key is valid and active.
        </AlertDescription>
      </Alert>

      {/* Trust Panel */}
      <TrustPanel />

      {/* CTA Button */}
      <Button
        onClick={validateAndSave}
        disabled={
          !apiKey.trim() ||
          validationPhase === "connecting" ||
          validationPhase === "verifying" ||
          validationPhase === "success"
        }
        className="w-full h-11"
        size="lg"
      >
        {validationPhase === "connecting"
          ? `Connecting to ${provider.name}...`
          : validationPhase === "verifying"
          ? `Verifying with ${provider.name}...`
          : validationPhase === "success"
          ? "✓ Verified!"
          : validationPhase === "error"
          ? "Try Again"
          : `Verify with ${provider.name}`}
      </Button>
    </motion.div>
  );
}
