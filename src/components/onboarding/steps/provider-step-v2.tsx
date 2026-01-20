"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ProviderTile } from "../provider-tile";
import { SecretInput } from "../secret-input";
import { TrustPanel } from "../trust-panel";
import { useApiKeysStore } from "@/stores/api-keys-store";
import { toast } from "sonner";
import { ExternalLink } from "lucide-react";

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
  const [validationState, setValidationState] = useState<
    "success" | "error" | "validating" | null
  >(null);
  const [errorMessage, setErrorMessage] = useState("");

  const provider = PROVIDERS.find((p) => p.id === selectedProvider)!;

  const validateAndSave = async () => {
    if (!apiKey.trim()) return;

    setValidationState("validating");
    setErrorMessage("");

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
        setValidationState("success");
        await addKey(selectedProvider, apiKey.trim(), provider.name);
        toast.success(`Connected to ${provider.name}`);

        // Auto-advance after 500ms
        setTimeout(() => {
          onComplete(selectedProvider);
        }, 500);
      } else {
        setValidationState("error");
        setErrorMessage(
          data.error || data.details || "Invalid API key. Please check and try again."
        );
      }
    } catch (error) {
      setValidationState("error");
      setErrorMessage("Network error. Please check your connection and try again.");
    }
  };

  // Reset validation state when API key changes
  useEffect(() => {
    setValidationState(null);
    setErrorMessage("");
  }, [apiKey]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && apiKey.trim() && validationState !== "validating") {
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
          validationState={validationState}
          errorMessage={errorMessage}
          autoFocus
        />
      </div>

      {/* Trust Panel */}
      <TrustPanel />

      {/* CTA Button */}
      <Button
        onClick={validateAndSave}
        disabled={
          !apiKey.trim() ||
          validationState === "validating" ||
          validationState === "success"
        }
        className="w-full h-11"
        size="lg"
      >
        {validationState === "validating"
          ? "Testing key..."
          : validationState === "success"
          ? "Connected!"
          : "Test & Continue"}
      </Button>
    </motion.div>
  );
}
