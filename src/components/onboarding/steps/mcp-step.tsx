"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plug, ArrowRight, ArrowLeft, Loader2, CheckCircle2, ExternalLink, Globe, Code, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface McpStepProps {
    onComplete: () => void;
    onBack: () => void;
    onSkip: () => void;
}

const MCP_FEATURES = [
    { icon: Globe, label: "150+ App Integrations", description: "Gmail, Slack, GitHub, and more" },
    { icon: Code, label: "Code Execution", description: "Run code in sandboxed environments" },
    { icon: FileText, label: "File & Web Tools", description: "Read files, browse web, manage data" },
];

// Composio config stored in localStorage (same as settings page)
const COMPOSIO_STORAGE_KEY = "composio_config";

interface ComposioConfig {
    apiKey: string;
    userId: string;
    enabledToolkits: string[];
}

function saveComposioConfig(config: ComposioConfig) {
    if (typeof window === "undefined") return;
    localStorage.setItem(COMPOSIO_STORAGE_KEY, JSON.stringify(config));
}

export function McpStep({ onComplete, onBack, onSkip }: McpStepProps) {
    const [composioKey, setComposioKey] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isSaved, setIsSaved] = useState(false);

    const handleSaveAndContinue = async () => {
        if (!composioKey.trim()) {
            onSkip();
            return;
        }

        setIsLoading(true);
        try {
            // Save Composio config to localStorage (same format as settings page)
            const config: ComposioConfig = {
                apiKey: composioKey.trim(),
                userId: "default",
                enabledToolkits: [],
            };
            saveComposioConfig(config);
            setIsSaved(true);
            setTimeout(() => onComplete(), 800);
        } catch (error) {
            console.error("Failed to save Composio settings:", error);
            setIsLoading(false);
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
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-500/10">
                        <Plug className="h-7 w-7 text-blue-500" />
                    </div>
                    <CardTitle className="text-2xl">MCP Plugins</CardTitle>
                    <CardDescription className="text-base">
                        Connect to Composio for powerful tool capabilities
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    {/* Features Preview */}
                    <div className="grid gap-3">
                        {MCP_FEATURES.map((feature) => {
                            const Icon = feature.icon;
                            return (
                                <div
                                    key={feature.label}
                                    className="flex items-center gap-3 rounded-lg border p-3 bg-muted/20"
                                >
                                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                                        <Icon className="h-4 w-4 text-primary" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium">{feature.label}</p>
                                        <p className="text-xs text-muted-foreground">{feature.description}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Composio API Key */}
                    <div className="space-y-2 pt-2 border-t">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="composioKey" className="text-sm">Composio API Key</Label>
                            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Optional</span>
                        </div>
                        <div className="relative">
                            <Input
                                id="composioKey"
                                type="password"
                                placeholder="Enter your Composio API key..."
                                value={composioKey}
                                onChange={(e) => {
                                    setComposioKey(e.target.value);
                                    setIsSaved(false);
                                }}
                                className={cn(
                                    "h-10 pr-10",
                                    isSaved && "border-green-500"
                                )}
                            />
                            {isSaved && (
                                <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-green-500" />
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Get your free API key at{" "}
                            <a
                                href="https://platform.composio.dev/settings"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline inline-flex items-center gap-0.5"
                            >
                                Composio Platform → Settings <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                        </p>
                    </div>

                    <div className="flex gap-3 pt-2">
                        <Button variant="outline" onClick={onBack} className="h-11 gap-2">
                            <ArrowLeft className="h-4 w-4" />
                            Back
                        </Button>
                        <Button variant="ghost" onClick={onSkip} className="h-11">
                            Skip
                        </Button>
                        <Button
                            onClick={handleSaveAndContinue}
                            disabled={isLoading}
                            className="flex-1 h-11 gap-2"
                        >
                            {isLoading ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : isSaved ? (
                                <>
                                    <CheckCircle2 className="h-4 w-4" />
                                    Saved!
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
