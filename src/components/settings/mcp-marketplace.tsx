"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import {
    Plus,
    Trash2,
    CheckCircle2,
    XCircle,
    Loader2,
    RefreshCw,
    ChevronDown,
    Wrench,
    Clock,
    Zap,
    ExternalLink,
    ShieldCheck,
    Plug,
    KeyRound,
    Eye,
    EyeOff,
} from "lucide-react";
import { db, type McpServer } from "@/lib/db/schema";
import { toast } from "sonner";
import { nanoid } from "nanoid";
import { useLiveQuery } from "dexie-react-hooks";
import { cn } from "@/lib/utils";

// Connection status type
type ConnectionStatus = "idle" | "connecting" | "connected" | "error";

// Composio SVG Icon component (fallback for when external icon fails)
function ComposioIcon({ className }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
        >
            <rect width="24" height="24" rx="6" fill="url(#composio-gradient)" />
            <path
                d="M12 6L18 10V14L12 18L6 14V10L12 6Z"
                stroke="white"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <path
                d="M12 10V14"
                stroke="white"
                strokeWidth="1.5"
                strokeLinecap="round"
            />
            <path
                d="M8 8L12 10L16 8"
                stroke="white"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            <defs>
                <linearGradient id="composio-gradient" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#8B5CF6" />
                    <stop offset="1" stopColor="#6366F1" />
                </linearGradient>
            </defs>
        </svg>
    );
}

export function McpMarketplace() {
    const installedServers = useLiveQuery(() => db.mcpServers.toArray()) || [];
    const [isAddingOpen, setIsAddingOpen] = useState(false);

    // Default to Composio configuration
    const [newConnection, setNewConnection] = useState({
        name: "Composio Tools",
        url: "",
        apiKey: "",
    });

    // Connection status tracking
    const [serverStatuses, setServerStatuses] = useState<
        Record<string, { status: ConnectionStatus; tools?: any[]; latency?: number; error?: string }>
    >({});

    // Expanded tools view
    const [expandedServers, setExpandedServers] = useState<Set<string>>(new Set());

    // API key visibility
    const [visibleApiKeys, setVisibleApiKeys] = useState<Set<string>>(new Set());

    // Test connection for a server
    const testConnection = useCallback(async (server: McpServer) => {
        setServerStatuses((prev) => ({
            ...prev,
            [server.id]: { status: "connecting" },
        }));

        const startTime = Date.now();

        try {
            const response = await fetch("/api/mcp/test", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    url: server.url,
                    apiKey: server.apiKey,
                    type: server.type,
                }),
            });

            const result = await response.json();
            const latency = Date.now() - startTime;

            if (result.success) {
                setServerStatuses((prev) => ({
                    ...prev,
                    [server.id]: {
                        status: "connected",
                        tools: result.tools || [],
                        latency,
                    },
                }));
                toast.success(`Connected to ${server.name}`, {
                    description: `${result.toolCount || 0} tools available • ${latency}ms`,
                });
            } else {
                setServerStatuses((prev) => ({
                    ...prev,
                    [server.id]: {
                        status: "error",
                        error: result.error || "Connection failed",
                    },
                }));
                toast.error(`Failed to connect to ${server.name}`, {
                    description: result.error,
                });
            }
        } catch (error) {
            setServerStatuses((prev) => ({
                ...prev,
                [server.id]: {
                    status: "error",
                    error: error instanceof Error ? error.message : "Network error",
                },
            }));
            toast.error(`Connection error`, {
                description: error instanceof Error ? error.message : "Unknown error",
            });
        }
    }, []);

    const handleAddComposio = async () => {
        if (!newConnection.name) {
            toast.error("Name is required");
            return;
        }

        if (!newConnection.url) {
            toast.error("MCP URL is required");
            return;
        }

        if (!newConnection.apiKey) {
            toast.error("API Key is required");
            return;
        }

        // Validate Composio domain (Composio-only policy)
        if (!newConnection.url.includes("composio.dev")) {
            toast.error("Only Composio MCP URLs are supported");
            return;
        }

        try {
            await db.mcpServers.add({
                id: nanoid(),
                name: newConnection.name,
                url: newConnection.url,
                apiKey: newConnection.apiKey,
                description: "Composio tool integration",
                enabled: true,
                type: "sse",
                collection: "curated",
                logoUrl: "https://composio.dev/favicon.ico",
                author: "Composio",
                category: "automation",
                createdAt: Date.now(),
                updatedAt: Date.now(),
            });
            toast.success("Composio connection added");
            setIsAddingOpen(false);
            setNewConnection({ name: "Composio Tools", url: "", apiKey: "" });
        } catch (error) {
            toast.error("Failed to add connection");
        }
    };

    const handleToggle = async (id: string, enabled: boolean) => {
        await db.mcpServers.update(id, { enabled, updatedAt: Date.now() });
        if (!enabled) {
            setServerStatuses((prev) => ({
                ...prev,
                [id]: { status: "idle" },
            }));
        }
    };

    const handleDelete = async (id: string) => {
        if (confirm("Are you sure you want to remove this connection?")) {
            await db.mcpServers.delete(id);
            setServerStatuses((prev) => {
                const next = { ...prev };
                delete next[id];
                return next;
            });
            toast.success("Connection removed");
        }
    };

    const handleUpdateApiKey = async (id: string, apiKey: string) => {
        await db.mcpServers.update(id, { apiKey, updatedAt: Date.now() });
    };

    const toggleExpanded = (id: string) => {
        setExpandedServers((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const toggleApiKeyVisibility = (id: string) => {
        setVisibleApiKeys((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const getStatusBadge = (status: ConnectionStatus) => {
        switch (status) {
            case "connected":
                return (
                    <Badge variant="default" className="bg-green-500/20 text-green-500 border-green-500/30 hover:bg-green-500/30">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Connected
                    </Badge>
                );
            case "connecting":
                return (
                    <Badge variant="secondary" className="bg-amber-500/20 text-amber-500 border-amber-500/30">
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        Connecting
                    </Badge>
                );
            case "error":
                return (
                    <Badge variant="destructive" className="bg-red-500/20 text-red-500 border-red-500/30">
                        <XCircle className="h-3 w-3 mr-1" />
                        Error
                    </Badge>
                );
            default:
                return (
                    <Badge variant="outline" className="text-muted-foreground">
                        <div className="h-2 w-2 rounded-full bg-muted-foreground/50 mr-1.5" />
                        Not tested
                    </Badge>
                );
        }
    };

    return (
        <TooltipProvider>
            <div className="space-y-6 max-w-4xl mx-auto">
                {/* Header */}
                <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                        <h2 className="text-2xl font-bold flex items-center gap-3">
                            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/25">
                                <Plug className="h-5 w-5 text-white" />
                            </div>
                            Composio Integrations
                        </h2>
                        <p className="text-muted-foreground text-sm max-w-lg">
                            Connect your favorite tools (GitHub, Gmail, Slack, etc.) safely via Composio.
                        </p>
                    </div>
                    <Dialog open={isAddingOpen} onOpenChange={setIsAddingOpen}>
                        <DialogTrigger asChild>
                            <Button className="gap-2 shadow-lg shadow-primary/20">
                                <Plus className="h-4 w-4" />
                                New Connection
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-lg">
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                    <ComposioIcon className="h-5 w-5" />
                                    Add Composio Connection
                                </DialogTitle>
                                <DialogDescription>
                                    Paste the MCP URL and API key from your Composio dashboard.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-5 py-4">
                                {/* Quick Start Guide */}
                                <div className="p-4 bg-gradient-to-br from-violet-500/10 to-indigo-500/10 rounded-xl border border-violet-500/20 space-y-3">
                                    <div className="font-medium flex items-center gap-2 text-sm">
                                        <ExternalLink className="h-4 w-4 text-violet-500" />
                                        Quick Start
                                    </div>
                                    <ol className="list-decimal list-inside space-y-1.5 text-sm text-muted-foreground ml-1">
                                        <li>
                                            Sign up at{" "}
                                            <a
                                                href="https://composio.dev"
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-violet-500 hover:underline font-medium"
                                            >
                                                composio.dev
                                            </a>
                                        </li>
                                        <li>Connect your tools (Gmail, GitHub, etc.)</li>
                                        <li>Create an MCP config and copy the details</li>
                                    </ol>
                                </div>

                                <div className="space-y-2">
                                    <Label>Connection Name</Label>
                                    <Input
                                        placeholder="e.g. My Work Tools"
                                        value={newConnection.name}
                                        onChange={(e) =>
                                            setNewConnection({ ...newConnection, name: e.target.value })
                                        }
                                        className="h-10"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>MCP URL</Label>
                                    <Input
                                        placeholder="https://backend.composio.dev/v3/mcp/..."
                                        value={newConnection.url}
                                        onChange={(e) =>
                                            setNewConnection({ ...newConnection, url: e.target.value })
                                        }
                                        className="h-10 font-mono text-sm"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Use the &quot;HTTP&quot; endpoint from your Composio MCP config
                                    </p>
                                </div>
                                <div className="space-y-2">
                                    <Label>API Key</Label>
                                    <Input
                                        type="password"
                                        placeholder="ak_..."
                                        value={newConnection.apiKey}
                                        onChange={(e) =>
                                            setNewConnection({ ...newConnection, apiKey: e.target.value })
                                        }
                                        className="h-10 font-mono text-sm"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Sent as <code className="bg-muted px-1.5 py-0.5 rounded text-[11px]">x-api-key</code> header
                                    </p>
                                </div>
                            </div>
                            <DialogFooter className="gap-2 sm:gap-0">
                                <Button
                                    variant="outline"
                                    onClick={() => setIsAddingOpen(false)}
                                >
                                    Cancel
                                </Button>
                                <Button onClick={handleAddComposio} className="gap-2">
                                    <Plug className="h-4 w-4" />
                                    Connect
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>

                {/* Connections List */}
                <div className="space-y-4">
                    {installedServers.length === 0 ? (
                        <Card className="border-dashed">
                            <div className="flex flex-col items-center justify-center text-center p-12">
                                <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-violet-500/20 to-indigo-500/20 flex items-center justify-center mb-5 border border-violet-500/20">
                                    <ComposioIcon className="h-8 w-8" />
                                </div>
                                <h3 className="font-semibold text-lg mb-2">No connections yet</h3>
                                <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-6">
                                    Add a Composio connection to give your assistant access to tools like Google Calendar, GitHub, Slack, and 150+ more.
                                </p>
                                <Button onClick={() => setIsAddingOpen(true)} className="gap-2">
                                    <Plus className="h-4 w-4" />
                                    Add your first connection
                                </Button>
                            </div>
                        </Card>
                    ) : (
                        installedServers.map((server) => {
                            const status = serverStatuses[server.id];
                            const isExpanded = expandedServers.has(server.id);
                            const isApiKeyVisible = visibleApiKeys.has(server.id);

                            return (
                                <Card
                                    key={server.id}
                                    className={cn(
                                        "overflow-hidden transition-all duration-200",
                                        server.enabled
                                            ? "border-border/80 shadow-sm hover:shadow-md hover:border-violet-500/30"
                                            : "opacity-60 border-dashed"
                                    )}
                                >
                                    <CardHeader className="pb-3">
                                        <div className="flex items-start gap-4">
                                            {/* Icon */}
                                            <div className="h-12 w-12 shrink-0 rounded-xl bg-gradient-to-br from-violet-500/20 to-indigo-500/20 flex items-center justify-center border border-violet-500/20">
                                                <ComposioIcon className="h-7 w-7" />
                                            </div>

                                            {/* Title & Status */}
                                            <div className="flex-1 min-w-0 space-y-1">
                                                <div className="flex items-center gap-3">
                                                    <CardTitle className="text-base font-semibold truncate">
                                                        {server.name}
                                                    </CardTitle>
                                                    {getStatusBadge(status?.status || "idle")}
                                                </div>
                                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                    <Badge variant="secondary" className="gap-1 text-[10px] h-5 font-normal">
                                                        <ShieldCheck className="h-3 w-3" />
                                                        Composio Secure
                                                    </Badge>
                                                    {status?.latency && (
                                                        <Badge variant="outline" className="gap-1 text-[10px] h-5 font-normal">
                                                            <Clock className="h-3 w-3" />
                                                            {status.latency}ms
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Toggle */}
                                            <div className="flex items-center gap-3">
                                                <Switch
                                                    checked={server.enabled}
                                                    onCheckedChange={(c) => handleToggle(server.id, c)}
                                                    aria-label="Toggle connection"
                                                />
                                            </div>
                                        </div>
                                    </CardHeader>

                                    <CardContent className="pb-3 pt-0 space-y-3">
                                        {/* API Key Field - Collapsible */}
                                        <Collapsible>
                                            <CollapsibleTrigger asChild>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="w-full justify-between h-8 text-xs px-3 hover:bg-muted/50 text-muted-foreground"
                                                >
                                                    <span className="flex items-center gap-2">
                                                        <KeyRound className="h-3.5 w-3.5" />
                                                        Update API Key
                                                    </span>
                                                    <ChevronDown className="h-3.5 w-3.5" />
                                                </Button>
                                            </CollapsibleTrigger>
                                            <CollapsibleContent className="pt-2">
                                                <div className="flex gap-2">
                                                    <Input
                                                        type={isApiKeyVisible ? "text" : "password"}
                                                        value={server.apiKey || ""}
                                                        onChange={(e) => handleUpdateApiKey(server.id, e.target.value)}
                                                        className="h-9 text-xs bg-muted/30 font-mono flex-1"
                                                        placeholder="ak_..."
                                                    />
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <Button
                                                                variant="outline"
                                                                size="icon"
                                                                className="h-9 w-9 shrink-0"
                                                                onClick={() => toggleApiKeyVisibility(server.id)}
                                                            >
                                                                {isApiKeyVisible ? (
                                                                    <EyeOff className="h-4 w-4" />
                                                                ) : (
                                                                    <Eye className="h-4 w-4" />
                                                                )}
                                                            </Button>
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            {isApiKeyVisible ? "Hide" : "Show"} API key
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </div>
                                            </CollapsibleContent>
                                        </Collapsible>

                                        {/* Error Display */}
                                        {status?.status === "error" && status.error && (
                                            <div className="p-3 bg-destructive/10 text-destructive text-xs rounded-lg flex items-start gap-2">
                                                <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
                                                <span>{status.error}</span>
                                            </div>
                                        )}

                                        {/* Tools List */}
                                        {status?.tools && status.tools.length > 0 && (
                                            <Collapsible
                                                open={isExpanded}
                                                onOpenChange={() => toggleExpanded(server.id)}
                                            >
                                                <CollapsibleTrigger asChild>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="w-full justify-between h-9 text-xs px-3 bg-muted/30 hover:bg-muted/50"
                                                    >
                                                        <span className="flex items-center gap-2 font-medium">
                                                            <Wrench className="h-3.5 w-3.5 text-violet-500" />
                                                            {status.tools.length} Tools Available
                                                        </span>
                                                        <ChevronDown
                                                            className={cn(
                                                                "h-3.5 w-3.5 transition-transform text-muted-foreground",
                                                                isExpanded && "rotate-180"
                                                            )}
                                                        />
                                                    </Button>
                                                </CollapsibleTrigger>
                                                <CollapsibleContent>
                                                    <div className="mt-2 p-3 bg-muted/30 rounded-lg">
                                                        <div className="max-h-48 overflow-y-auto space-y-1 pr-1 scrollbar-thin">
                                                            {status.tools.map((tool, idx) => (
                                                                <div
                                                                    key={idx}
                                                                    className="flex items-start gap-2.5 p-2 rounded-md hover:bg-background/80 transition-colors text-xs"
                                                                >
                                                                    <Zap className="h-3.5 w-3.5 text-violet-500 shrink-0 mt-0.5" />
                                                                    <div className="min-w-0">
                                                                        <div className="font-medium text-foreground/90">
                                                                            {tool.name}
                                                                        </div>
                                                                        {tool.description && (
                                                                            <p className="text-muted-foreground line-clamp-1 opacity-80">
                                                                                {tool.description}
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </CollapsibleContent>
                                            </Collapsible>
                                        )}
                                    </CardContent>

                                    <CardFooter className="bg-muted/30 py-3 px-4 flex justify-between items-center border-t">
                                        <div className="text-[10px] text-muted-foreground font-mono">
                                            ID: {server.id.slice(0, 8)}...
                                        </div>
                                        <div className="flex gap-2">
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="h-8 text-xs gap-1.5"
                                                        onClick={() => testConnection(server)}
                                                        disabled={status?.status === "connecting"}
                                                    >
                                                        {status?.status === "connecting" ? (
                                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                        ) : (
                                                            <RefreshCw className="h-3.5 w-3.5" />
                                                        )}
                                                        Test
                                                    </Button>
                                                </TooltipTrigger>
                                                <TooltipContent>Test connection and load tools</TooltipContent>
                                            </Tooltip>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-muted-foreground hover:text-destructive transition-colors"
                                                        onClick={() => handleDelete(server.id)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </TooltipTrigger>
                                                <TooltipContent>Remove connection</TooltipContent>
                                            </Tooltip>
                                        </div>
                                    </CardFooter>
                                </Card>
                            );
                        })
                    )}
                </div>
            </div>
        </TooltipProvider>
    );
}

