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
    Plus,
    Trash2,
    CheckCircle2,
    XCircle,
    Loader2,
    RefreshCw,
    ChevronDown,
    Wrench,
    Clock,
    ExternalLink,
    AlertCircle,
    Zap,
} from "lucide-react";
import { db, type McpServer } from "@/lib/db/schema";
import { toast } from "sonner";
import { nanoid } from "nanoid";
import { useLiveQuery } from "dexie-react-hooks";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// Connection status type
type ConnectionStatus = "idle" | "connecting" | "connected" | "error";

interface ConnectionWithStatus extends McpServer {
    connectionStatus?: ConnectionStatus;
    tools?: Array<{ name: string; description?: string }>;
    latency?: number;
    error?: string;
}

export function ComposioIntegrations() {
    // Get all Composio connections from DB
    const composioConnections = useLiveQuery(() => db.mcpServers.toArray()) || [];

    const [isAddingOpen, setIsAddingOpen] = useState(false);
    const [newConnection, setNewConnection] = useState({
        name: "",
        url: "https://mcp.composio.dev/sse",
        apiKey: "",
    });

    // Connection status tracking
    const [connectionStatuses, setConnectionStatuses] = useState<
        Record<string, { status: ConnectionStatus; tools?: any[]; latency?: number; error?: string }>
    >({});

    // Expanded tools view
    const [expandedConnections, setExpandedConnections] = useState<Set<string>>(new Set());

    // Per-connection tool toggles
    const [toolToggles, setToolToggles] = useState<Record<string, Set<string>>>({});

    // Test connection for a Composio server
    const testConnection = useCallback(async (connection: McpServer) => {
        setConnectionStatuses((prev) => ({
            ...prev,
            [connection.id]: { status: "connecting" },
        }));

        const startTime = Date.now();

        try {
            const response = await fetch("/api/mcp/test", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    url: connection.url,
                    apiKey: connection.apiKey,
                    type: connection.type || "sse",
                }),
            });

            const result = await response.json();
            const latency = Date.now() - startTime;

            if (result.success) {
                setConnectionStatuses((prev) => ({
                    ...prev,
                    [connection.id]: {
                        status: "connected",
                        tools: result.tools || [],
                        latency,
                    },
                }));

                // Cache tools in DB
                await db.mcpServers.update(connection.id, {
                    lastConnectedAt: Date.now(),
                    status: "connected",
                });

                toast.success(`Connected to ${connection.name}`, {
                    description: `${result.toolCount || 0} tools available • ${latency}ms`,
                });
            } else {
                setConnectionStatuses((prev) => ({
                    ...prev,
                    [connection.id]: {
                        status: "error",
                        error: result.error || "Connection failed",
                    },
                }));

                await db.mcpServers.update(connection.id, {
                    status: "error",
                    error: result.error,
                });

                toast.error(`Failed to connect to ${connection.name}`, {
                    description: result.error,
                });
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : "Network error";
            setConnectionStatuses((prev) => ({
                ...prev,
                [connection.id]: {
                    status: "error",
                    error: errorMsg,
                },
            }));

            await db.mcpServers.update(connection.id, {
                status: "error",
                error: errorMsg,
            });

            toast.error(`Connection error`, {
                description: errorMsg,
            });
        }
    }, []);

    const handleAddConnection = async () => {
        if (!newConnection.name || !newConnection.url || !newConnection.apiKey) {
            toast.error("Name, URL, and API key are required");
            return;
        }

        // Validate Composio domain
        if (!newConnection.url.includes("composio.dev")) {
            toast.error("Only Composio MCP URLs are supported");
            return;
        }

        try {
            const id = nanoid();
            await db.mcpServers.add({
                id,
                name: newConnection.name,
                url: newConnection.url,
                apiKey: newConnection.apiKey,
                description: "Composio tool hub",
                enabled: true,
                type: "sse",
                collection: "curated",
                logoUrl: "https://composio.dev/favicon.ico",
                author: "Composio",
                category: "automation",
                createdAt: Date.now(),
                updatedAt: Date.now(),
            });

            toast.success(`Added ${newConnection.name}`, {
                description: "Test connection to load available tools.",
            });

            setIsAddingOpen(false);
            setNewConnection({ name: "", url: "https://mcp.composio.dev/sse", apiKey: "" });
        } catch (error) {
            toast.error("Failed to add connection");
        }
    };

    const handleToggleConnection = async (id: string, enabled: boolean) => {
        await db.mcpServers.update(id, { enabled, updatedAt: Date.now() });
        if (!enabled) {
            setConnectionStatuses((prev) => ({
                ...prev,
                [id]: { status: "idle" },
            }));
        }
    };

    const handleDeleteConnection = async (id: string) => {
        await db.mcpServers.delete(id);
        setConnectionStatuses((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
        });
        toast.success("Connection removed");
    };

    const handleUpdateApiKey = async (id: string, apiKey: string) => {
        await db.mcpServers.update(id, { apiKey, updatedAt: Date.now() });
    };

    const toggleExpanded = (id: string) => {
        setExpandedConnections((prev) => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const toggleTool = async (connectionId: string, toolName: string) => {
        const connection = composioConnections.find(c => c.id === connectionId);
        if (!connection) return;

        const disabledTools = new Set(connection.toolPolicy?.disabledTools || []);

        if (disabledTools.has(toolName)) {
            disabledTools.delete(toolName);
        } else {
            disabledTools.add(toolName);
        }

        await db.mcpServers.update(connectionId, {
            toolPolicy: {
                ...connection.toolPolicy,
                disabledTools: Array.from(disabledTools),
            },
            updatedAt: Date.now(),
        });
    };

    const getStatusIcon = (status: ConnectionStatus) => {
        switch (status) {
            case "connected":
                return <CheckCircle2 className="h-4 w-4 text-green-500" />;
            case "connecting":
                return <Loader2 className="h-4 w-4 text-yellow-500 animate-spin" />;
            case "error":
                return <XCircle className="h-4 w-4 text-red-500" />;
            default:
                return <div className="h-4 w-4 rounded-full bg-muted-foreground/30" />;
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-semibold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
                        Composio Integrations
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        Connect to 150+ tools through Composio&apos;s MCP hub.
                    </p>
                </div>

                <Dialog open={isAddingOpen} onOpenChange={setIsAddingOpen}>
                    <DialogTrigger asChild>
                        <Button className="gap-2 shadow-lg shadow-primary/20">
                            <Plus className="h-4 w-4" />
                            Add Connection
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle>Add Composio Connection</DialogTitle>
                            <DialogDescription>
                                Connect to your Composio MCP endpoint to access tools.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label>Connection Name</Label>
                                <Input
                                    placeholder="My Composio Tools"
                                    value={newConnection.name}
                                    onChange={(e) =>
                                        setNewConnection({ ...newConnection, name: e.target.value })
                                    }
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>MCP Server URL</Label>
                                <Input
                                    placeholder="https://mcp.composio.dev/sse"
                                    value={newConnection.url}
                                    onChange={(e) =>
                                        setNewConnection({ ...newConnection, url: e.target.value })
                                    }
                                />
                                <p className="text-xs text-muted-foreground">
                                    Must be a composio.dev domain
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Label>Composio API Key</Label>
                                <Input
                                    type="password"
                                    placeholder="Your Composio API key"
                                    value={newConnection.apiKey}
                                    onChange={(e) =>
                                        setNewConnection({ ...newConnection, apiKey: e.target.value })
                                    }
                                    autoComplete="off"
                                    data-1p-ignore
                                    data-lpignore="true"
                                    data-form-type="other"
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button
                                variant="outline"
                                onClick={() => setIsAddingOpen(false)}
                            >
                                Cancel
                            </Button>
                            <Button onClick={handleAddConnection}>Add Connection</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Onboarding Instructions */}
            <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>How to add more tools</AlertTitle>
                <AlertDescription className="space-y-2">
                    <p className="text-sm">
                        Composio provides 150+ tools with managed authentication and reliable execution.
                    </p>
                    <ol className="text-sm space-y-1 list-decimal list-inside">
                        <li>
                            Sign up at{" "}
                            <a
                                href="https://composio.dev"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline inline-flex items-center gap-1"
                            >
                                composio.dev
                                <ExternalLink className="h-3 w-3" />
                            </a>
                        </li>
                        <li>Connect the tools you need from the Composio dashboard</li>
                        <li>Get your API key and MCP endpoint URL</li>
                        <li>Add a connection above to use those tools in Lumina</li>
                    </ol>
                </AlertDescription>
            </Alert>

            {/* Connections List */}
            {composioConnections.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground border rounded-lg border-dashed">
                    <Wrench className="h-12 w-12 mb-4 opacity-30" />
                    <p className="font-medium">No Composio connections yet</p>
                    <p className="text-sm opacity-70">
                        Add your first connection to access powerful tools.
                    </p>
                    <Button
                        variant="outline"
                        className="mt-4"
                        onClick={() => setIsAddingOpen(true)}
                    >
                        Add Connection
                    </Button>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {composioConnections.map((connection) => {
                        const status = connectionStatuses[connection.id];
                        const isExpanded = expandedConnections.has(connection.id);
                        const disabledTools = new Set(connection.toolPolicy?.disabledTools || []);

                        return (
                            <Card
                                key={connection.id}
                                className={cn(
                                    "flex flex-col transition-all duration-300 overflow-hidden",
                                    "hover:shadow-lg hover:shadow-primary/5",
                                    connection.enabled
                                        ? "border-primary/20 bg-gradient-to-br from-background to-primary/5"
                                        : "opacity-60"
                                )}
                            >
                                <CardHeader className="flex-row gap-4 space-y-0 pb-2">
                                    <div className="h-12 w-12 shrink-0 rounded-xl bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center overflow-hidden shadow-inner">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src="https://composio.dev/favicon.ico"
                                            alt="Composio"
                                            className="h-8 w-8 object-contain"
                                        />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <CardTitle className="text-base truncate">
                                                {connection.name}
                                            </CardTitle>
                                            {getStatusIcon(status?.status || "idle")}
                                        </div>
                                        <CardDescription className="text-xs truncate flex items-center gap-2">
                                            {connection.url}
                                            {status?.latency && (
                                                <Badge variant="outline" className="text-[10px] h-4">
                                                    <Clock className="h-2.5 w-2.5 mr-1" />
                                                    {status.latency}ms
                                                </Badge>
                                            )}
                                        </CardDescription>
                                    </div>
                                </CardHeader>

                                <CardContent className="flex-1 pb-2">
                                    {/* API Key Input */}
                                    <div className="space-y-1.5">
                                        <Label className="text-xs text-muted-foreground">
                                            API Key
                                        </Label>
                                        <Input
                                            type="password"
                                            placeholder="Enter Composio API key..."
                                            value={connection.apiKey || ""}
                                            onChange={(e) =>
                                                handleUpdateApiKey(connection.id, e.target.value)
                                            }
                                            autoComplete="off"
                                            data-1p-ignore
                                            data-lpignore="true"
                                            data-form-type="other"
                                            className="h-8 text-xs bg-muted/30"
                                        />
                                    </div>

                                    {/* Tools List with Toggles */}
                                    {status?.tools && status.tools.length > 0 && (
                                        <Collapsible
                                            open={isExpanded}
                                            onOpenChange={() => toggleExpanded(connection.id)}
                                            className="mt-3"
                                        >
                                            <CollapsibleTrigger asChild>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="w-full justify-between h-8 text-xs"
                                                >
                                                    <span className="flex items-center gap-2">
                                                        <Wrench className="h-3 w-3" />
                                                        {status.tools.length} Tools Available
                                                        {disabledTools.size > 0 && (
                                                            <Badge variant="secondary" className="h-4 text-[10px]">
                                                                {disabledTools.size} disabled
                                                            </Badge>
                                                        )}
                                                    </span>
                                                    <ChevronDown
                                                        className={cn(
                                                            "h-3 w-3 transition-transform",
                                                            isExpanded && "rotate-180"
                                                        )}
                                                    />
                                                </Button>
                                            </CollapsibleTrigger>
                                            <CollapsibleContent className="mt-2">
                                                <div className="max-h-60 overflow-y-auto space-y-1 p-2 bg-muted/30 rounded-md">
                                                    {status.tools.map((tool, idx) => {
                                                        const isEnabled = !disabledTools.has(tool.name);
                                                        return (
                                                            <div
                                                                key={idx}
                                                                className="flex items-start gap-2 justify-between p-2 rounded hover:bg-background/50 transition-colors"
                                                            >
                                                                <div className="flex items-start gap-2 flex-1 min-w-0">
                                                                    <Zap className={cn(
                                                                        "h-3 w-3 shrink-0 mt-0.5",
                                                                        isEnabled ? "text-primary" : "text-muted-foreground/50"
                                                                    )} />
                                                                    <div className="min-w-0 flex-1">
                                                                        <span className={cn(
                                                                            "font-medium text-xs block",
                                                                            !isEnabled && "text-muted-foreground"
                                                                        )}>
                                                                            {tool.name}
                                                                        </span>
                                                                        {tool.description && (
                                                                            <p className="text-[10px] text-muted-foreground line-clamp-1">
                                                                                {tool.description}
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                <Switch
                                                                    checked={isEnabled}
                                                                    onCheckedChange={() => toggleTool(connection.id, tool.name)}
                                                                    className="scale-75"
                                                                />
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </CollapsibleContent>
                                        </Collapsible>
                                    )}

                                    {status?.status === "error" && status.error && (
                                        <p className="mt-2 text-xs text-destructive flex items-center gap-1">
                                            <XCircle className="h-3 w-3" />
                                            {status.error}
                                        </p>
                                    )}
                                </CardContent>

                                <CardFooter className="flex items-center justify-between border-t pt-3 bg-muted/10">
                                    <div className="flex items-center gap-3">
                                        <Switch
                                            checked={connection.enabled}
                                            onCheckedChange={(c) => handleToggleConnection(connection.id, c)}
                                        />
                                        <span className="text-xs font-medium">
                                            {connection.enabled ? "Active" : "Disabled"}
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-1">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="h-7 gap-1.5 text-xs"
                                            onClick={() => testConnection(connection)}
                                            disabled={status?.status === "connecting"}
                                        >
                                            {status?.status === "connecting" ? (
                                                <Loader2 className="h-3 w-3 animate-spin" />
                                            ) : (
                                                <RefreshCw className="h-3 w-3" />
                                            )}
                                            Test
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 text-destructive hover:text-destructive"
                                            onClick={() => handleDeleteConnection(connection.id)}
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </CardFooter>
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
