"use client";

import { useState, useEffect, useCallback } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
    Plug,
    Plus,
    Trash2,
    Search,
    Server,
    CheckCircle2,
    XCircle,
    Loader2,
    RefreshCw,
    ChevronDown,
    Wrench,
    Clock,
    Zap,
    Globe,
    Code,
    Database,
    Shield,
} from "lucide-react";
import { db, type McpServer } from "@/lib/db/schema";
import { MCP_REGISTRY } from "@/lib/mcp/registry";
import { toast } from "sonner";
import { nanoid } from "nanoid";
import { useLiveQuery } from "dexie-react-hooks";
import { cn } from "@/lib/utils";

// Connection status type
type ConnectionStatus = "idle" | "connecting" | "connected" | "error";

interface ServerWithStatus extends McpServer {
    connectionStatus?: ConnectionStatus;
    tools?: Array<{ name: string; description?: string }>;
    latency?: number;
    error?: string;
}

// Category definitions with icons
const CATEGORIES = [
    { id: "all", label: "All", icon: Globe },
    { id: "search", label: "Search", icon: Search },
    { id: "code", label: "Code", icon: Code },
    { id: "data", label: "Data", icon: Database },
    { id: "security", label: "Security", icon: Shield },
] as const;

export function McpMarketplace() {
    const installedServers = useLiveQuery(() => db.mcpServers.toArray()) || [];
    const [activeTab, setActiveTab] = useState("installed");
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCategory, setSelectedCategory] = useState<string>("all");
    const [isAddingOpen, setIsAddingOpen] = useState(false);
    const [newServer, setNewServer] = useState<Partial<McpServer>>({
        name: "",
        url: "",
        apiKey: "",
        type: "sse",
    });

    // Connection status tracking
    const [serverStatuses, setServerStatuses] = useState<
        Record<string, { status: ConnectionStatus; tools?: any[]; latency?: number; error?: string }>
    >({});

    // Expanded tools view
    const [expandedServers, setExpandedServers] = useState<Set<string>>(new Set());

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

    const handleInstall = async (registryItem: Partial<McpServer>) => {
        try {
            const newId = nanoid();
            await db.mcpServers.add({
                id: newId,
                name: registryItem.name!,
                url: registryItem.url!,
                apiKey: "",
                description: registryItem.description,
                enabled: true,
                type: registryItem.type || "sse",
                collection: "curated",
                logoUrl: registryItem.logoUrl,
                author: registryItem.author,
                category: registryItem.category,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            });
            toast.success(`Installed ${registryItem.name}`, {
                description: "Configure your API key to start using it.",
            });
            setActiveTab("installed");
        } catch (error) {
            toast.error("Failed to install server");
        }
    };

    const handleAddCustom = async () => {
        if (!newServer.name || !newServer.url) {
            toast.error("Name and URL are required");
            return;
        }

        try {
            await db.mcpServers.add({
                id: nanoid(),
                ...(newServer as any),
                enabled: true,
                collection: "custom",
                createdAt: Date.now(),
                updatedAt: Date.now(),
            });
            toast.success("Custom server added");
            setIsAddingOpen(false);
            setNewServer({ name: "", url: "", apiKey: "", type: "sse" });
        } catch (error) {
            toast.error("Failed to add server");
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
        await db.mcpServers.delete(id);
        setServerStatuses((prev) => {
            const next = { ...prev };
            delete next[id];
            return next;
        });
        toast.success("Server removed");
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

    const filteredInstalled = installedServers.filter(
        (s) =>
            s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const filteredRegistry = MCP_REGISTRY.filter(
        (r) =>
            (r.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                r.description?.toLowerCase().includes(searchQuery.toLowerCase())) &&
            !installedServers.some((i) => i.name === r.name) &&
            (selectedCategory === "all" || r.category === selectedCategory)
    );

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-semibold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
                        MCP Marketplace
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        Extend Lumina with powerful tools from external servers.
                    </p>
                </div>

                <Dialog open={isAddingOpen} onOpenChange={setIsAddingOpen}>
                    <DialogTrigger asChild>
                        <Button className="gap-2 shadow-lg shadow-primary/20">
                            <Plus className="h-4 w-4" />
                            Add Custom
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle>Add Custom MCP Server</DialogTitle>
                            <DialogDescription>
                                Connect to any SSE-compatible MCP server URL.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <Label>Name</Label>
                                <Input
                                    placeholder="My Custom Tools"
                                    value={newServer.name}
                                    onChange={(e) =>
                                        setNewServer({ ...newServer, name: e.target.value })
                                    }
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Server URL (SSE Endpoint)</Label>
                                <Input
                                    placeholder="https://api.example.com/mcp/sse"
                                    value={newServer.url}
                                    onChange={(e) =>
                                        setNewServer({ ...newServer, url: e.target.value })
                                    }
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>API Key (Optional)</Label>
                                <Input
                                    type="password"
                                    placeholder="sk-..."
                                    value={newServer.apiKey}
                                    onChange={(e) =>
                                        setNewServer({ ...newServer, apiKey: e.target.value })
                                    }
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
                            <Button onClick={handleAddCustom}>Add Server</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Search */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                    placeholder="Search plugins..."
                    className="pl-9 bg-muted/30 border-muted"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="bg-muted/50">
                    <TabsTrigger value="installed" className="gap-2">
                        <Plug className="h-3.5 w-3.5" />
                        Installed
                        {installedServers.length > 0 && (
                            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-[10px]">
                                {installedServers.length}
                            </Badge>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="registry" className="gap-2">
                        <Server className="h-3.5 w-3.5" />
                        Registry
                    </TabsTrigger>
                </TabsList>

                {/* Installed Servers */}
                <TabsContent value="installed" className="space-y-4 mt-4">
                    {filteredInstalled.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                            <Plug className="h-12 w-12 mb-4 opacity-30" />
                            <p className="font-medium">No plugins installed</p>
                            <p className="text-sm opacity-70">
                                Browse the Registry to discover powerful tools.
                            </p>
                            <Button
                                variant="outline"
                                className="mt-4"
                                onClick={() => setActiveTab("registry")}
                            >
                                Browse Registry
                            </Button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {filteredInstalled.map((server) => {
                                const status = serverStatuses[server.id];
                                const isExpanded = expandedServers.has(server.id);

                                return (
                                    <Card
                                        key={server.id}
                                        className={cn(
                                            "flex flex-col transition-all duration-300 overflow-hidden",
                                            "hover:shadow-lg hover:shadow-primary/5",
                                            server.enabled
                                                ? "border-primary/20 bg-gradient-to-br from-background to-primary/5"
                                                : "opacity-60"
                                        )}
                                    >
                                        <CardHeader className="flex-row gap-4 space-y-0 pb-2">
                                            <div className="h-12 w-12 shrink-0 rounded-xl bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center overflow-hidden shadow-inner">
                                                {server.logoUrl ? (
                                                    /* eslint-disable-next-line @next/next/no-img-element */
                                                    <img
                                                        src={server.logoUrl}
                                                        alt={server.name}
                                                        className="h-full w-full object-cover"
                                                    />
                                                ) : (
                                                    <Plug className="h-5 w-5 text-muted-foreground" />
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <CardTitle className="text-base truncate">
                                                        {server.name}
                                                    </CardTitle>
                                                    {getStatusIcon(status?.status || "idle")}
                                                </div>
                                                <CardDescription className="text-xs truncate flex items-center gap-2">
                                                    {server.url}
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
                                            <p className="text-sm text-muted-foreground line-clamp-2">
                                                {server.description || "No description provided."}
                                            </p>

                                            {/* API Key Input */}
                                            <div className="mt-3 space-y-1.5">
                                                <Label className="text-xs text-muted-foreground">
                                                    API Key
                                                </Label>
                                                <Input
                                                    type="password"
                                                    placeholder="Enter API key..."
                                                    value={server.apiKey || ""}
                                                    onChange={(e) =>
                                                        handleUpdateApiKey(server.id, e.target.value)
                                                    }
                                                    className="h-8 text-xs bg-muted/30"
                                                />
                                            </div>

                                            {/* Tools Discovery */}
                                            {status?.tools && status.tools.length > 0 && (
                                                <Collapsible
                                                    open={isExpanded}
                                                    onOpenChange={() => toggleExpanded(server.id)}
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
                                                        <div className="max-h-32 overflow-y-auto space-y-1 p-2 bg-muted/30 rounded-md">
                                                            {status.tools.map((tool, idx) => (
                                                                <div
                                                                    key={idx}
                                                                    className="flex items-start gap-2 text-xs"
                                                                >
                                                                    <Zap className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                                                                    <div>
                                                                        <span className="font-medium">
                                                                            {tool.name}
                                                                        </span>
                                                                        {tool.description && (
                                                                            <p className="text-muted-foreground line-clamp-1">
                                                                                {tool.description}
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            ))}
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
                                                    checked={server.enabled}
                                                    onCheckedChange={(c) => handleToggle(server.id, c)}
                                                />
                                                <span className="text-xs font-medium">
                                                    {server.enabled ? "Active" : "Disabled"}
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-1">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    className="h-7 gap-1.5 text-xs"
                                                    onClick={() => testConnection(server)}
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
                                                    onClick={() => handleDelete(server.id)}
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
                </TabsContent>

                {/* Registry */}
                <TabsContent value="registry" className="space-y-4 mt-4">
                    {/* Category Filters */}
                    <div className="flex flex-wrap gap-2">
                        {CATEGORIES.map((cat) => {
                            const Icon = cat.icon;
                            return (
                                <Button
                                    key={cat.id}
                                    variant={selectedCategory === cat.id ? "secondary" : "ghost"}
                                    size="sm"
                                    className="h-8 gap-1.5"
                                    onClick={() => setSelectedCategory(cat.id)}
                                >
                                    <Icon className="h-3.5 w-3.5" />
                                    {cat.label}
                                </Button>
                            );
                        })}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredRegistry.map((item, idx) => (
                            <Card
                                key={idx}
                                className="flex flex-col border-dashed hover:border-solid hover:border-primary/30 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 group"
                            >
                                <CardHeader className="flex-row gap-4 space-y-0">
                                    <div className="h-12 w-12 shrink-0 rounded-xl bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center overflow-hidden shadow-inner group-hover:shadow-primary/10 transition-shadow">
                                        {item.logoUrl ? (
                                            /* eslint-disable-next-line @next/next/no-img-element */
                                            <img
                                                src={item.logoUrl}
                                                alt={item.name}
                                                className="h-full w-full object-cover"
                                            />
                                        ) : (
                                            <Server className="h-5 w-5 text-muted-foreground" />
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <CardTitle className="text-base">{item.name}</CardTitle>
                                        <div className="flex items-center gap-2 mt-1">
                                            <Badge
                                                variant="outline"
                                                className="text-[10px] h-4 font-normal"
                                            >
                                                {item.author}
                                            </Badge>
                                            {item.category && (
                                                <Badge
                                                    variant="secondary"
                                                    className="text-[10px] h-4 font-normal"
                                                >
                                                    {item.category}
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="flex-1 text-sm text-muted-foreground">
                                    {item.description}
                                </CardContent>
                                <CardFooter className="pt-0">
                                    <Button
                                        className="w-full gap-2 shadow-lg shadow-primary/10 group-hover:shadow-primary/20 transition-shadow"
                                        onClick={() => handleInstall(item)}
                                    >
                                        <Plus className="h-4 w-4" />
                                        Install
                                    </Button>
                                </CardFooter>
                            </Card>
                        ))}
                    </div>

                    {filteredRegistry.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                            <Search className="h-12 w-12 mb-4 opacity-30" />
                            <p className="font-medium">No servers found</p>
                            <p className="text-sm opacity-70">
                                Try a different search term or category.
                            </p>
                        </div>
                    )}
                </TabsContent>
            </Tabs>
        </div>
    );
}
