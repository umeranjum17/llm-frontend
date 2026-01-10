"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApiKeysStore } from "@/stores/api-keys-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Shield, Zap, MessageSquare, ArrowRight, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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
  const [step, setStep] = useState<"intro" | "setup" | "complete">("intro");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) return;

    setIsLoading(true);
    try {
      const selected = PROVIDERS.find((p) => p.id === provider);
      await addKey(provider, apiKey, selected?.name);
      setStep("complete");
      setTimeout(() => {
        router.push("/");
      }, 2000);
    } catch (error) {
      console.error("Failed to add API key:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (step === "intro") {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 bg-gradient-to-b from-background to-muted/20">
        <Card className="w-full max-w-2xl">
          <CardHeader className="text-center pb-8">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Sparkles className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-3xl mb-2">Welcome to Lumina</CardTitle>
            <CardDescription className="text-base">
              The premium BYOK AI frontend for power users
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="flex flex-col items-center text-center p-4 rounded-lg border bg-muted/30">
                <Shield className="h-6 w-6 text-primary mb-2" />
                <h3 className="font-semibold mb-1">Privacy First</h3>
                <p className="text-xs text-muted-foreground">
                  All data stored locally. Your API keys are encrypted.
                </p>
              </div>
              <div className="flex flex-col items-center text-center p-4 rounded-lg border bg-muted/30">
                <Zap className="h-6 w-6 text-primary mb-2" />
                <h3 className="font-semibold mb-1">Lightning Fast</h3>
                <p className="text-xs text-muted-foreground">
                  Instant model switching. Smooth streaming. 60fps animations.
                </p>
              </div>
              <div className="flex flex-col items-center text-center p-4 rounded-lg border bg-muted/30">
                <MessageSquare className="h-6 w-6 text-primary mb-2" />
                <h3 className="font-semibold mb-1">Powerful Features</h3>
                <p className="text-xs text-muted-foreground">
                  Multi-tab chats, conversation forking, cost tracking, and more.
                </p>
              </div>
            </div>
            <Button onClick={() => setStep("setup")} className="w-full gap-2" size="lg">
              Get Started
              <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === "complete") {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <CardTitle>All Set!</CardTitle>
            <CardDescription>
              Your API key has been saved securely. Redirecting...
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const selected = PROVIDERS.find((p) => p.id === provider) ?? PROVIDERS[0];

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-gradient-to-b from-background to-muted/20">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Setup API Key
          </CardTitle>
          <CardDescription>
            Connect your API key to start chatting. Your key is encrypted and stored locally.
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
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <div className="flex items-start gap-2 text-xs">
                  <Shield className="h-3 w-3 text-green-600 mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">
                    Your API key is encrypted and stored locally. We never see or store your keys.
                  </span>
                </div>
                <div className="text-xs">
                  <span className="text-muted-foreground">Get your key from </span>
                  <a
                    href={selected.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline font-medium"
                  >
                    {selected.url.replace(/^https?:\/\//, "")}
                  </a>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep("intro")}
                className="flex-1"
              >
                Back
              </Button>
              <Button type="submit" className="flex-1 gap-2" disabled={isLoading}>
                {isLoading ? "Saving..." : "Continue"}
                {!isLoading && <ArrowRight className="h-4 w-4" />}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
