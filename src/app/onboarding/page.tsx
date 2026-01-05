"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApiKeysStore } from "@/stores/api-keys-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const PROVIDERS = [
  { id: "openrouter", name: "OpenRouter", placeholder: "sk-or-...", url: "https://openrouter.ai/keys" },
  { id: "openai", name: "OpenAI", placeholder: "sk-...", url: "https://platform.openai.com/api-keys" },
  { id: "anthropic", name: "Anthropic", placeholder: "sk-ant-...", url: "https://console.anthropic.com/settings/keys" },
] as const;

export default function OnboardingPage() {
  const router = useRouter();
  const { addKey } = useApiKeysStore();
  const [apiKey, setApiKey] = useState("");
  const [provider, setProvider] = useState<(typeof PROVIDERS)[number]["id"]>("openrouter");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) return;

    setIsLoading(true);
    try {
      const selected = PROVIDERS.find((p) => p.id === provider);
      await addKey(provider, apiKey, selected?.name);
      router.push("/");
    } catch (error) {
      console.error("Failed to add API key:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const selected = PROVIDERS.find((p) => p.id === provider) ?? PROVIDERS[0];

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Welcome to Lumina</CardTitle>
          <CardDescription>
            Add an API key to start chatting
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="provider">Provider</Label>
              <Select value={provider} onValueChange={(v) => setProvider(v as (typeof PROVIDERS)[number]["id"])}>
                <SelectTrigger id="provider">
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDERS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="apiKey">{selected.name} API Key</Label>
              <Input
                id="apiKey"
                type="password"
                placeholder={selected.placeholder}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Your API key is stored locally in your browser and never sent to our servers.
                Get your key from{" "}
                <a
                  href={selected.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {selected.url.replace(/^https?:\/\//, "")}
                </a>
              </p>
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Saving..." : "Continue"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
