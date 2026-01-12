"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Sparkles,
    CheckCircle2,
    Keyboard,
    Bot,
    MessageSquare,
    Zap,
    Command,
    ArrowRight,
    Rocket,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SummaryStepProps {
    onComplete: () => void;
    configuredFeatures: {
        provider: string;
        memory: boolean;
        mcp: boolean;
    };
}

const SHORTCUTS = [
    { keys: ["⌘", "K"], description: "Command Palette" },
    { keys: ["⌘", "N"], description: "New Chat" },
    { keys: ["⌘", "B"], description: "Toggle Sidebar" },
    { keys: ["⌘", "\\"], description: "Focus Mode" },
    { keys: ["⌘", "⇧", "M"], description: "Switch Model" },
    { keys: ["⌘", "Enter"], description: "Send Message" },
];

const AGENTS = [
    { name: "Code Expert", emoji: "💻", description: "Specialized in programming tasks" },
    { name: "Researcher", emoji: "🔬", description: "Deep analysis and research" },
    { name: "Writer", emoji: "✍️", description: "Content creation and editing" },
    { name: "Analyst", emoji: "📊", description: "Data analysis and insights" },
];

export function SummaryStep({ onComplete, configuredFeatures }: SummaryStepProps) {
    const [activeTab, setActiveTab] = useState<"overview" | "shortcuts" | "agents">("overview");

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-2xl mx-auto"
        >
            <Card className="border-2 overflow-hidden">
                <CardHeader className="text-center pb-4 bg-gradient-to-b from-primary/5 to-transparent">
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.2, type: "spring" }}
                        className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/60 shadow-lg shadow-primary/25"
                    >
                        <Rocket className="h-8 w-8 text-primary-foreground" />
                    </motion.div>
                    <CardTitle className="text-2xl">You&apos;re All Set!</CardTitle>
                    <CardDescription className="text-base">
                        Here&apos;s what you&apos;ve configured and what you can do
                    </CardDescription>
                </CardHeader>

                <CardContent className="space-y-6">
                    {/* Tab Navigation */}
                    <div className="flex gap-2 p-1 bg-muted/50 rounded-lg">
                        {[
                            { id: "overview", label: "Overview", icon: Sparkles },
                            { id: "shortcuts", label: "Shortcuts", icon: Keyboard },
                            { id: "agents", label: "Agents", icon: Bot },
                        ].map((tab) => {
                            const Icon = tab.icon;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id as typeof activeTab)}
                                    className={cn(
                                        "flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-all",
                                        activeTab === tab.id
                                            ? "bg-background shadow-sm text-foreground"
                                            : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    <Icon className="h-4 w-4" />
                                    {tab.label}
                                </button>
                            );
                        })}
                    </div>

                    {/* Tab Content */}
                    <AnimatePresence mode="wait">
                        {activeTab === "overview" && (
                            <motion.div
                                key="overview"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="space-y-4"
                            >
                                {/* Configured Features */}
                                <div className="grid gap-3">
                                    <div className="flex items-center gap-3 rounded-lg border p-3 bg-green-500/5 border-green-500/20">
                                        <CheckCircle2 className="h-5 w-5 text-green-500" />
                                        <div className="flex-1">
                                            <p className="text-sm font-medium">LLM Provider</p>
                                            <p className="text-xs text-muted-foreground">
                                                Connected to {configuredFeatures.provider || "OpenRouter"}
                                            </p>
                                        </div>
                                        <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
                                            Active
                                        </Badge>
                                    </div>

                                    <div className={cn(
                                        "flex items-center gap-3 rounded-lg border p-3",
                                        configuredFeatures.memory
                                            ? "bg-purple-500/5 border-purple-500/20"
                                            : "bg-muted/30"
                                    )}>
                                        <div className={cn(
                                            "h-5 w-5 rounded-full flex items-center justify-center",
                                            configuredFeatures.memory ? "text-purple-500" : "text-muted-foreground"
                                        )}>
                                            {configuredFeatures.memory ? <CheckCircle2 className="h-5 w-5" /> : "○"}
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-sm font-medium">Memory</p>
                                            <p className="text-xs text-muted-foreground">
                                                {configuredFeatures.memory ? "Enabled - AI will remember you" : "Not configured"}
                                            </p>
                                        </div>
                                        <Badge variant="outline" className={cn(
                                            configuredFeatures.memory
                                                ? "bg-purple-500/10 text-purple-600 border-purple-500/20"
                                                : "text-muted-foreground"
                                        )}>
                                            {configuredFeatures.memory ? "Active" : "Skipped"}
                                        </Badge>
                                    </div>

                                    <div className={cn(
                                        "flex items-center gap-3 rounded-lg border p-3",
                                        configuredFeatures.mcp
                                            ? "bg-blue-500/5 border-blue-500/20"
                                            : "bg-muted/30"
                                    )}>
                                        <div className={cn(
                                            "h-5 w-5 rounded-full flex items-center justify-center",
                                            configuredFeatures.mcp ? "text-blue-500" : "text-muted-foreground"
                                        )}>
                                            {configuredFeatures.mcp ? <CheckCircle2 className="h-5 w-5" /> : "○"}
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-sm font-medium">MCP Plugins</p>
                                            <p className="text-xs text-muted-foreground">
                                                {configuredFeatures.mcp ? "Composio tools enabled" : "Not configured"}
                                            </p>
                                        </div>
                                        <Badge variant="outline" className={cn(
                                            configuredFeatures.mcp
                                                ? "bg-blue-500/10 text-blue-600 border-blue-500/20"
                                                : "text-muted-foreground"
                                        )}>
                                            {configuredFeatures.mcp ? "Active" : "Skipped"}
                                        </Badge>
                                    </div>
                                </div>

                                <p className="text-xs text-muted-foreground text-center pt-2">
                                    You can always configure these later in Settings
                                </p>
                            </motion.div>
                        )}

                        {activeTab === "shortcuts" && (
                            <motion.div
                                key="shortcuts"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="grid grid-cols-2 gap-2"
                            >
                                {SHORTCUTS.map((shortcut) => (
                                    <div
                                        key={shortcut.description}
                                        className="flex items-center justify-between rounded-lg border p-3 bg-muted/20"
                                    >
                                        <span className="text-sm text-muted-foreground">{shortcut.description}</span>
                                        <div className="flex gap-1">
                                            {shortcut.keys.map((key, i) => (
                                                <kbd
                                                    key={i}
                                                    className="px-2 py-1 text-xs font-medium bg-background border rounded shadow-sm"
                                                >
                                                    {key}
                                                </kbd>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </motion.div>
                        )}

                        {activeTab === "agents" && (
                            <motion.div
                                key="agents"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="grid grid-cols-2 gap-3"
                            >
                                {AGENTS.map((agent) => (
                                    <div
                                        key={agent.name}
                                        className="flex items-center gap-3 rounded-lg border p-3 bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer"
                                    >
                                        <span className="text-2xl">{agent.emoji}</span>
                                        <div>
                                            <p className="text-sm font-medium">{agent.name}</p>
                                            <p className="text-xs text-muted-foreground">{agent.description}</p>
                                        </div>
                                    </div>
                                ))}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* CTA Button */}
                    <Button
                        onClick={onComplete}
                        size="lg"
                        className="w-full h-12 gap-2 text-base shadow-lg shadow-primary/25"
                    >
                        <Zap className="h-5 w-5" />
                        Start Chatting
                        <ArrowRight className="h-5 w-5" />
                    </Button>
                </CardContent>
            </Card>
        </motion.div>
    );
}
