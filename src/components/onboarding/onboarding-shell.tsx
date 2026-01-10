"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FeatureShowcase } from "./feature-showcase";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Shield, ArrowRight, CheckCircle2 } from "lucide-react";
import { useApiKeysStore } from "@/stores/api-keys-store";
import { useRouter } from "next/navigation";
import { markOnboardingCompleted } from "@/lib/db/queries";

const PROVIDERS = [
  { id: "openrouter", name: "OpenRouter", placeholder: "sk-or-...", url: "https://openrouter.ai/keys" },
  { id: "openai", name: "OpenAI", placeholder: "sk-...", url: "https://platform.openai.com/api-keys" },
  { id: "anthropic", name: "Anthropic", placeholder: "sk-ant-...", url: "https://console.anthropic.com/settings/keys" },
] as const;

type OnboardingStep = "welcome" | "features" | "setup" | "complete";

export function OnboardingShell() {
  const router = useRouter();
  const { addKey } = useApiKeysStore();
  const [step, setStep] = useState<OnboardingStep>("welcome");
  const [apiKey, setApiKey] = useState("");
  const [provider, setProvider] = useState<(typeof PROVIDERS)[number]["id"]>("openrouter");
  const [isLoading, setIsLoading] = useState(false);

  const handleStartTour = () => {
    setStep("features");
  };

  const handleSkipTour = () => {
    setStep("setup");
  };

  const handleFeaturesComplete = () => {
    setStep("setup");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) return;

    setIsLoading(true);
    try {
      const selected = PROVIDERS.find((p) => p.id === provider);
      await addKey(provider, apiKey, selected?.name);
      await markOnboardingCompleted();
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

  const selected = PROVIDERS.find((p) => p.id === provider) ?? PROVIDERS[0];

  return (
    <AnimatePresence mode="wait">
      {step === "welcome" && (
        <motion.div
          key="welcome"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="flex min-h-screen items-center justify-center p-4 bg-gradient-to-b from-background to-muted/20"
        >
          <Card className="w-full max-w-2xl">
            <CardHeader className="text-center pb-8">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5 }}
                className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10"
              >
                <Sparkles className="h-8 w-8 text-primary" />
              </motion.div>
              <CardTitle className="text-3xl mb-2">Welcome to Lumina</CardTitle>
              <CardDescription className="text-base">
                The premium BYOK AI frontend for power users
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="flex flex-col items-center text-center p-4 rounded-lg border bg-muted/30"
                >
                  <Shield className="h-6 w-6 text-primary mb-2" />
                  <h3 className="font-semibold mb-1">Privacy First</h3>
                  <p className="text-xs text-muted-foreground">
                    All data stored locally. Your API keys are encrypted.
                  </p>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="flex flex-col items-center text-center p-4 rounded-lg border bg-muted/30"
                >
                  <Sparkles className="h-6 w-6 text-primary mb-2" />
                  <h3 className="font-semibold mb-1">100+ Models</h3>
                  <p className="text-xs text-muted-foreground">
                    Access models from OpenAI, Anthropic, Google, and more.
                  </p>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="flex flex-col items-center text-center p-4 rounded-lg border bg-muted/30"
                >
                  <ArrowRight className="h-6 w-6 text-primary mb-2" />
                  <h3 className="font-semibold mb-1">Powerful Features</h3>
                  <p className="text-xs text-muted-foreground">
                    Agents, prompts, branching, cost tracking, and more.
                  </p>
                </motion.div>
              </div>
              <Button onClick={handleStartTour} className="w-full gap-2" size="lg">
                Take Feature Tour
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button
                onClick={handleSkipTour}
                variant="ghost"
                className="w-full"
              >
                Skip and Setup API Key
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {step === "features" && (
        <motion.div
          key="features"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <FeatureShowcase onComplete={handleFeaturesComplete} onSkip={handleSkipTour} />
        </motion.div>
      )}

      {step === "setup" && (
        <motion.div
          key="setup"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="flex min-h-screen items-center justify-center p-4 bg-gradient-to-b from-background to-muted/20"
        >
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
                <Button type="submit" className="w-full gap-2" disabled={isLoading} size="lg">
                  {isLoading ? "Saving..." : "Continue"}
                  {!isLoading && <ArrowRight className="h-4 w-4" />}
                </Button>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {step === "complete" && (
        <motion.div
          key="complete"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex min-h-screen items-center justify-center p-4"
        >
          <Card className="w-full max-w-md text-center">
            <CardHeader>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring" }}
                className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10"
              >
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </motion.div>
              <CardTitle>All Set!</CardTitle>
              <CardDescription>
                Your API key has been saved securely. Redirecting to the app...
              </CardDescription>
            </CardHeader>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
