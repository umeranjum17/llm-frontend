"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Brain, ArrowRight, ArrowLeft, Loader2, CheckCircle2, ExternalLink, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { getSettings, updateSettings } from "@/lib/db/queries";

interface MemoryStepProps {
    onComplete: () => void;
    onBack: () => void;
    onSkip: () => void;
}

export function MemoryStep({ onComplete, onBack, onSkip }: MemoryStepProps) {
    const [memoryEnabled, setMemoryEnabled] = useState(true);
    const [mem0ApiKey, setMem0ApiKey] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const handleContinue = async () => {
        setIsLoading(true);
        try {
            await updateSettings({
                memoryEnabled,
            });
            onComplete();
        } catch (error) {
            console.error("Failed to save memory settings:", error);
        } finally {
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
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-purple-500/10">
                        <Brain className="h-7 w-7 text-purple-500" />
                    </div>
                    <CardTitle className="text-2xl">Enable Memory</CardTitle>
                    <CardDescription className="text-base">
                        Let Lumina remember facts and preferences across conversations
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    {/* Memory Toggle */}
                    <div className="flex items-center justify-between rounded-lg border p-4 bg-muted/30">
                        <div className="space-y-0.5">
                            <Label className="text-sm font-medium">Enable Memory</Label>
                            <p className="text-xs text-muted-foreground">
                                AI will remember your name, preferences, and project context
                            </p>
                        </div>
                        <Switch
                            checked={memoryEnabled}
                            onCheckedChange={setMemoryEnabled}
                        />
                    </div>

                    {/* Memory Features */}
                    {memoryEnabled && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="space-y-3"
                        >
                            <div className="grid gap-2">
                                {[
                                    { icon: "👤", title: "Personal Context", label: "Remembers your name, role, and preferences" },
                                    { icon: "📁", title: "Project Memory", label: "Tracks codebase context across conversations" },
                                    { icon: "⚡", title: "Auto-Learning", label: "Extracts important facts from every chat" },
                                    { icon: "💬", title: "Conversation Recall", label: "References relevant past discussions" },
                                ].map((feature) => (
                                    <div key={feature.label} className="flex items-start gap-3 text-sm p-2 rounded-lg bg-muted/30">
                                        <span className="text-lg mt-0.5">{feature.icon}</span>
                                        <div>
                                            <span className="font-medium text-foreground">{feature.title}</span>
                                            <p className="text-xs text-muted-foreground">{feature.label}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Mem0 API Key (Optional) */}
                            <div className="space-y-2 pt-2 border-t">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="mem0Key" className="text-sm">Mem0 API Key</Label>
                                    <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">Optional</span>
                                </div>
                                <Input
                                    id="mem0Key"
                                    type="password"
                                    placeholder="m0-..."
                                    value={mem0ApiKey}
                                    onChange={(e) => setMem0ApiKey(e.target.value)}
                                    autoComplete="off"
                                    data-1p-ignore
                                    data-lpignore="true"
                                    data-form-type="other"
                                    className="h-10"
                                />
                                <p className="text-xs text-muted-foreground">
                                    For cloud-synced memory across devices.{" "}
                                    <a
                                        href="https://app.mem0.ai/dashboard/api-keys"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-primary hover:underline inline-flex items-center gap-0.5"
                                    >
                                        Get key <ExternalLink className="h-2.5 w-2.5" />
                                    </a>
                                </p>
                            </div>
                        </motion.div>
                    )}

                    <div className="flex gap-3 pt-2">
                        <Button variant="outline" onClick={onBack} className="h-11 gap-2">
                            <ArrowLeft className="h-4 w-4" />
                            Back
                        </Button>
                        <Button variant="ghost" onClick={onSkip} className="h-11">
                            Skip
                        </Button>
                        <Button
                            onClick={handleContinue}
                            disabled={isLoading}
                            className="flex-1 h-11 gap-2"
                        >
                            {isLoading ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
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
