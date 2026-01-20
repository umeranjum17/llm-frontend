"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Shield, ArrowRight, ArrowLeft, Key, ExternalLink, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useApiKeysStore } from "@/stores/api-keys-store";
import { cn } from "@/lib/utils";

const PROVIDERS = [
    { id: "openrouter", name: "OpenRouter", placeholder: "sk-or-...", url: "https://openrouter.ai/keys" },
    { id: "openai", name: "OpenAI", placeholder: "sk-...", url: "https://platform.openai.com/api-keys" },
    { id: "anthropic", name: "Anthropic", placeholder: "sk-ant-...", url: "https://console.anthropic.com/settings/keys" },
] as const;

interface ProviderStepProps {
    onComplete: (providerId: string, apiKey: string) => void;
    onBack?: () => void;
}

export function ProviderStep({ onComplete, onBack }: ProviderStepProps) {
    const { addKey, keys } = useApiKeysStore();
    const [provider, setProvider] = useState<(typeof PROVIDERS)[number]["id"]>("openrouter");
    const [apiKey, setApiKey] = useState("");
    const [isValidating, setIsValidating] = useState(false);
    const [validationResult, setValidationResult] = useState<"success" | "error" | null>(null);
    const [errorMessage, setErrorMessage] = useState("");

    const selected = PROVIDERS.find((p) => p.id === provider) ?? PROVIDERS[0];

    const validateApiKey = async () => {
        if (!apiKey.trim()) return;

        setIsValidating(true);
        setValidationResult(null);
        setErrorMessage("");

        try {
            // Simple validation - try to make a models request
            const baseUrl = provider === "openrouter"
                ? "https://openrouter.ai/api/v1"
                : provider === "openai"
                    ? "https://api.openai.com/v1"
                    : "https://api.anthropic.com";

            const response = await fetch(
                provider === "anthropic" ? `${baseUrl}/models` : `${baseUrl}/models`,
                {
                    headers: provider === "anthropic"
                        ? { "x-api-key": apiKey, "anthropic-version": "2023-06-01" }
                        : { Authorization: `Bearer ${apiKey}` }
                }
            );

            if (response.ok || response.status === 200) {
                setValidationResult("success");
                // Save the key
                await addKey(provider, apiKey, selected.name);
                // Proceed after a brief delay
                setTimeout(() => onComplete(provider, apiKey), 1000);
            } else {
                const data = await response.json().catch(() => ({}));
                setValidationResult("error");
                setErrorMessage(data.error?.message || "Invalid API key");
            }
        } catch (error) {
            // Network error or CORS - still save the key and proceed
            console.warn("Couldn't validate key directly, saving anyway:", error);
            await addKey(provider, apiKey, selected.name);
            setValidationResult("success");
            setTimeout(() => onComplete(provider, apiKey), 1000);
        } finally {
            setIsValidating(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="w-full max-w-lg mx-auto"
        >
            <Card className="border-2">
                <CardHeader className="text-center pb-2">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                        <Key className="h-7 w-7 text-primary" />
                    </div>
                    <CardTitle className="text-2xl">Connect Your LLM Provider</CardTitle>
                    <CardDescription className="text-base">
                        Add your API key to start chatting with AI models
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="provider">Provider</Label>
                        <Select value={provider} onValueChange={(v) => setProvider(v as typeof provider)}>
                            <SelectTrigger id="provider" className="h-11">
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
                        <div className="relative">
                            <Input
                                id="apiKey"
                                type="password"
                                placeholder={selected.placeholder}
                                value={apiKey}
                                onChange={(e) => {
                                    setApiKey(e.target.value);
                                    setValidationResult(null);
                                }}
                                className={cn(
                                    "h-11 pr-10",
                                    validationResult === "success" && "border-green-500 focus-visible:ring-green-500",
                                    validationResult === "error" && "border-destructive focus-visible:ring-destructive"
                                )}
                            />
                            {validationResult === "success" && (
                                <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-green-500" />
                            )}
                            {validationResult === "error" && (
                                <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-destructive" />
                            )}
                        </div>
                        {validationResult === "error" && errorMessage && (
                            <p className="text-xs text-destructive">{errorMessage}</p>
                        )}
                    </div>

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
                                className="text-primary hover:underline font-medium inline-flex items-center gap-1"
                            >
                                {selected.url.replace(/^https?:\/\//, "")}
                                <ExternalLink className="h-3 w-3" />
                            </a>
                        </div>
                    </div>

                    <div className="flex gap-3 pt-2">
                        {onBack && (
                            <Button variant="outline" onClick={onBack} className="flex-1 h-11 gap-2">
                                <ArrowLeft className="h-4 w-4" />
                                Back
                            </Button>
                        )}
                        <Button
                            onClick={validateApiKey}
                            disabled={!apiKey.trim() || isValidating || validationResult === "success"}
                            className="flex-1 h-11 gap-2"
                        >
                            {isValidating ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Validating...
                                </>
                            ) : validationResult === "success" ? (
                                <>
                                    <CheckCircle2 className="h-4 w-4" />
                                    Connected!
                                </>
                            ) : (
                                <>
                                    Continue
                                    <ArrowRight className="h-4 w-4" />
                                </>
                            )}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    );
}
