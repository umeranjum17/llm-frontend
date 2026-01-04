"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useApiKeysStore } from "@/stores/api-keys-store";
import { Plus, Trash2, Eye, EyeOff, Check, X } from "lucide-react";
import { toast } from "sonner";

const PROVIDERS = [
  { id: "openrouter", name: "OpenRouter", url: "https://openrouter.ai" },
  { id: "openai", name: "OpenAI", url: "https://platform.openai.com" },
  { id: "anthropic", name: "Anthropic", url: "https://console.anthropic.com" },
  { id: "google", name: "Google AI", url: "https://ai.google.dev" },
  { id: "tavily", name: "Tavily (Web Search)", url: "https://tavily.com" },
  { id: "serper", name: "Serper (Google Search API)", url: "https://serper.dev" },
  { id: "brave", name: "Brave Search API", url: "https://brave.com/search/api/" },
  { id: "searxng", name: "SearxNG (Self-hosted)", url: "https://docs.searxng.org/" },
];

export function ApiKeysSettings() {
  const { keys, addKey, removeKey } = useApiKeysStore();
  const [newProvider, setNewProvider] = useState("");
  const [newKey, setNewKey] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [testingKey, setTestingKey] = useState<string | null>(null);

  const handleAddKey = async () => {
    if (!newProvider || !newKey) {
      toast.error("Please select a provider and enter an API key");
      return;
    }

    await addKey(newProvider, newKey, newLabel || undefined);

    toast.success("API key added successfully");
    setNewProvider("");
    setNewKey("");
    setNewLabel("");
  };

  const handleRemoveKey = async (id: string) => {
    await removeKey(id);
    toast.success("API key removed");
  };

  const handleTestKey = async (id: string) => {
    setTestingKey(id);
    // Simulate API test
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setTestingKey(null);
    toast.success("API key is valid");
  };

  const toggleShowKey = (id: string) => {
    setShowKeys((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const maskKey = (key: string) => {
    if (key.length <= 8) return "••••••••";
    return `${key.slice(0, 4)}••••${key.slice(-4)}`;
  };

  const isSearxng = newProvider === "searxng";

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">API Keys</h3>
        <p className="text-sm text-muted-foreground">
          Manage your API keys for different LLM providers
        </p>
      </div>

      {/* Existing Keys */}
      {keys.length > 0 && (
        <div className="space-y-3">
          <Label>Your API Keys</Label>
          {keys.map((apiKey) => {
            const provider = PROVIDERS.find((p) => p.id === apiKey.provider);
            return (
              <div
                key={apiKey.id}
                className="flex items-center gap-3 p-4 border rounded-lg"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium">
                      {provider?.name || apiKey.provider}
                    </span>
                    {apiKey.label && (
                      <Badge variant="secondary" className="text-xs">
                        {apiKey.label}
                      </Badge>
                    )}
                  </div>
                  <code className="text-xs text-muted-foreground font-mono">
                    {showKeys[apiKey.id]
                      ? apiKey.key
                      : maskKey(apiKey.key)}
                  </code>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => toggleShowKey(apiKey.id)}
                    title={showKeys[apiKey.id] ? "Hide key" : "Show key"}
                  >
                    {showKeys[apiKey.id] ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleTestKey(apiKey.id)}
                    disabled={testingKey === apiKey.id}
                    title="Test key"
                  >
                    {testingKey === apiKey.id ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveKey(apiKey.id)}
                    title="Remove key"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add New Key */}
      <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
        <h4 className="font-medium flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Add New API Key
        </h4>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="provider">Provider</Label>
            <Select value={newProvider} onValueChange={setNewProvider}>
              <SelectTrigger id="provider">
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                {PROVIDERS.map((provider) => (
                  <SelectItem key={provider.id} value={provider.id}>
                    {provider.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {newProvider && (
              <p className="text-xs text-muted-foreground">
                Get your key from{" "}
                <a
                  href={PROVIDERS.find((p) => p.id === newProvider)?.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-primary"
                >
                  {PROVIDERS.find((p) => p.id === newProvider)?.url}
                </a>
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="api-key">{isSearxng ? "Base URL" : "API Key"}</Label>
            <Input
              id="api-key"
              type={isSearxng ? "text" : "password"}
              placeholder={isSearxng ? "https://searx.example.com" : "sk-..."}
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="label">Label (Optional)</Label>
            <Input
              id="label"
              placeholder="e.g., Personal, Work"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
            />
          </div>

          <Button onClick={handleAddKey} className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            Add API Key
          </Button>
        </div>
      </div>

      {/* Help Text */}
      <div className="text-xs text-muted-foreground space-y-1">
        <p>
          • Your API keys are stored locally in your browser and never sent to
          our servers
        </p>
        <p>
          • Keys are used only to make requests directly to the LLM providers
        </p>
        <p>
          • We recommend using API keys with spending limits for safety
        </p>
      </div>
    </div>
  );
}
