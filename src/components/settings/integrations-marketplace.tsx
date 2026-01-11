"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Plug, Plus, Trash2, CheckCircle, XCircle, Search, Server, ExternalLink, Loader2, AlertCircle, Settings2 } from "lucide-react";
import { db, type McpServer } from "@/lib/db/schema";
import { INTEGRATIONS_REGISTRY, getHubIntegrations } from "@/lib/integrations/registry";
import { toast } from "sonner";
import { nanoid } from "nanoid";
import { useLiveQuery } from "dexie-react-hooks";
import { updateMcpServerConnectionStatus, updateMcpServerToolPolicy } from "@/lib/db/queries";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function IntegrationsMarketplace() {
    const installedServers = useLiveQuery(() => db.mcpServers.toArray()) || [];
    const [activeTab, setActiveTab] = useState("installed");
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedServer, setSelectedServer] = useState<McpServer | null>(null);
    const [isConfigDialogOpen, setIsConfigDialogOpen] = useState(false);
    const [isTestingConnection, setIsTestingConnection] = useState(false);
    const [isAddingHub, setIsAddingHub] = useState(false);
    const [hubConfig, setHubConfig] = useState<{
        hubId: string;
        url: string;
        apiKey?: string;
    }>({ hubId: "", url: "", apiKey: "" });

    const hubIntegrations = getHubIntegrations();

    const handleInstallHub = async (hubId: string) => {
        const hub = INTEGRATIONS_REGISTRY.find(h => h.id === hubId);
        if (!hub) return;

        setHubConfig({ hubId, url: "", apiKey: "" });
        setIsAddingHub(true);
    };

    const handleSaveHub = async () => {
        const hub = INTEGRATIONS_REGISTRY.find(h => h.id === hubConfig.hubId);
        if (!hub || !hubConfig.url) {
            toast.error("URL is required");
            return;
        }

        try {
            const serverId = nanoid();
            await db.mcpServers.add({
                id: serverId,
                name: hub.name,
                url: hubConfig.url,
                apiKey: hubConfig.apiKey || undefined,
                description: hub.description,
                enabled: true,
                type: hub.transport,
                collection: "curated",
                kind: hub.kind,
                logoUrl: hub.logoUrl,
                author: hub.author,
                status: "disconnected",
                createdAt: Date.now(),
                updatedAt: Date.now(),
            });

            toast.success(`${hub.name} added successfully! Test the connection to verify.`);
            setIsAddingHub(false);
            setHubConfig({ hubId: "", url: "", apiKey: "" });
        } catch (error) {
            toast.error("Failed to add integration");
        }
    };

    const handleTestConnection = async (server: McpServer) => {
        setIsTestingConnection(true);
        try {
            // Call API route to test connection
            const response = await fetch("/api/integrations/test", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ serverId: server.id }),
            });

            const result = await response.json();

            if (result.success) {
                await updateMcpServerConnectionStatus(
                    server.id,
                    "connected",
                    undefined,
                    result.tools
                );
                toast.success(`Connected! Found ${result.toolCount} tools.`);
            } else {
                await updateMcpServerConnectionStatus(
                    server.id,
                    "error",
                    result.error
                );
                toast.error(`Connection failed: ${result.error}`);
            }
        } catch (error) {
            toast.error("Failed to test connection");
        } finally {
            setIsTestingConnection(false);
        }
    };

    const handleToggleServer = async (id: string, enabled: boolean) => {
        await db.mcpServers.update(id, { enabled, updatedAt: Date.now() });
    };

    const handleToggleTool = async (server: McpServer, toolName: string, enabled: boolean) => {
        const currentDisabled = new Set(server.toolPolicy?.disabledTools || []);

        if (enabled) {
            currentDisabled.delete(toolName);
        } else {
            currentDisabled.add(toolName);
        }

        await updateMcpServerToolPolicy(server.id, Array.from(currentDisabled));
    };

    const handleDelete = async (id: string) => {
        await db.mcpServers.delete(id);
        toast.success("Integration removed");
    };

    const openToolConfig = (server: McpServer) => {
        setSelectedServer(server);
        setIsConfigDialogOpen(true);
    };

    const filteredInstalled = installedServers.filter(s =>
        s.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const filteredRegistry = hubIntegrations.filter(h =>
        h.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !installedServers.some(i => i.name === h.name)
    );

    const renderHubSetupDialog = () => {
        const hub = INTEGRATIONS_REGISTRY.find(h => h.id === hubConfig.hubId);
        if (!hub) return null;

        return (
            <Dialog open={isAddingHub} onOpenChange={setIsAddingHub}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Connect {hub.name}</DialogTitle>
                        <DialogDescription>
                            Follow these steps to set up your integration
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-6 py-4">
                        {/* Setup steps */}
                        {hub.setup?.steps && (
                            <div className="space-y-4">
                                <h4 className="text-sm font-medium">Setup Steps</h4>
                                <div className="space-y-3">
                                    {hub.setup.steps.map((step, idx) => (
                                        <div key={idx} className="flex gap-3">
                                            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                                                {idx + 1}
                                            </div>
                                            <div className="flex-1 space-y-1">
                                                <p className="text-sm font-medium">{step.title}</p>
                                                <p className="text-xs text-muted-foreground">{step.description}</p>
                                                {step.link && (
                                                    <a
                                                        href={step.link}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                                                    >
                                                        Open <ExternalLink className="h-3 w-3" />
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* URL input */}
                        <div className="space-y-2">
                            <Label>MCP Server URL (SSE)</Label>
                            <Input
                                placeholder="https://your-activepieces-instance.com/api/v1/mcp/sse"
                                value={hubConfig.url}
                                onChange={e => setHubConfig({ ...hubConfig, url: e.target.value })}
                            />
                            <p className="text-xs text-muted-foreground">
                                Must be an HTTPS URL (localhost not allowed for security)
                            </p>
                        </div>

                        {/* API key */}
                        {hub.auth && (
                            <div className="space-y-2">
                                <Label>{hub.auth.label || "API Key"}</Label>
                                <Input
                                    type="password"
                                    placeholder={hub.auth.placeholder || "Enter your API key"}
                                    value={hubConfig.apiKey}
                                    onChange={e => setHubConfig({ ...hubConfig, apiKey: e.target.value })}
                                />
                            </div>
                        )}

                        {hub.setup?.docsUrl && (
                            <Alert>
                                <AlertCircle className="h-4 w-4" />
                                <AlertDescription className="text-xs">
                                    Need help?{" "}
                                    <a
                                        href={hub.setup.docsUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="font-medium underline"
                                    >
                                        View documentation
                                    </a>
                                </AlertDescription>
                            </Alert>
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsAddingHub(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleSaveHub} disabled={!hubConfig.url}>
                            Add Integration
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        );
    };

    const renderToolConfigDialog = () => {
        if (!selectedServer) return null;

        const tools = selectedServer.tools || [];
        const disabledTools = new Set(selectedServer.toolPolicy?.disabledTools || []);

        return (
            <Dialog open={isConfigDialogOpen} onOpenChange={setIsConfigDialogOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Tool Settings - {selectedServer.name}</DialogTitle>
                        <DialogDescription>
                            Enable or disable individual tools from this integration
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        {selectedServer.status !== "connected" && (
                            <Alert>
                                <AlertCircle className="h-4 w-4" />
                                <AlertDescription className="text-xs">
                                    Test the connection first to see available tools
                                </AlertDescription>
                            </Alert>
                        )}

                        {tools.length === 0 && selectedServer.status === "connected" && (
                            <div className="text-center py-8 text-muted-foreground text-sm">
                                No tools available from this integration
                            </div>
                        )}

                        {tools.length > 0 && (
                            <ScrollArea className="h-[400px] pr-4">
                                <div className="space-y-2">
                                    {tools.map((tool: any) => (
                                        <div
                                            key={tool.name}
                                            className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors"
                                        >
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium truncate">{tool.name}</p>
                                                <p className="text-xs text-muted-foreground line-clamp-2">
                                                    {tool.description || "No description"}
                                                </p>
                                            </div>
                                            <Switch
                                                checked={!disabledTools.has(tool.name)}
                                                onCheckedChange={(enabled) =>
                                                    handleToggleTool(selectedServer, tool.name, enabled)
                                                }
                                            />
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                        )}
                    </div>

                    <DialogFooter>
                        <Button onClick={() => setIsConfigDialogOpen(false)}>
                            Done
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        );
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-medium">Integrations</h2>
                    <p className="text-sm text-muted-foreground">
                        Connect to external tools and services via MCP protocol
                    </p>
                </div>
            </div>

            <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                    placeholder="Search integrations..."
                    className="pl-9"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                />
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList>
                    <TabsTrigger value="installed">Installed ({installedServers.length})</TabsTrigger>
                    <TabsTrigger value="hub">Integration Hub</TabsTrigger>
                </TabsList>

                <TabsContent value="installed" className="space-y-4 mt-4">
                    {filteredInstalled.length === 0 ? (
                        <div className="text-center py-10 text-muted-foreground">
                            No integrations installed. Check the Integration Hub!
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-4">
                            {filteredInstalled.map(server => (
                                <Card key={server.id}>
                                    <CardHeader className="flex-row items-start gap-4 space-y-0">
                                        <div className="h-12 w-12 shrink-0 rounded bg-muted flex items-center justify-center overflow-hidden">
                                            {server.logoUrl ? (
                                                /* eslint-disable-next-line @next/next/no-img-element */
                                                <img src={server.logoUrl} alt={server.name} className="h-full w-full object-cover" />
                                            ) : (
                                                <Plug className="h-6 w-6 text-muted-foreground" />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex-1 min-w-0">
                                                    <CardTitle className="text-base truncate">{server.name}</CardTitle>
                                                    <CardDescription className="text-xs truncate mt-1">
                                                        {server.url}
                                                    </CardDescription>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {server.status === "connected" && (
                                                        <Badge variant="outline" className="gap-1 text-green-600 border-green-600">
                                                            <CheckCircle className="h-3 w-3" />
                                                            Connected
                                                        </Badge>
                                                    )}
                                                    {server.status === "error" && (
                                                        <Badge variant="outline" className="gap-1 text-destructive border-destructive">
                                                            <XCircle className="h-3 w-3" />
                                                            Error
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                            <p className="text-sm text-muted-foreground mt-2">
                                                {server.description || "No description"}
                                            </p>

                                            {server.status === "error" && server.error && (
                                                <Alert className="mt-3">
                                                    <AlertCircle className="h-4 w-4" />
                                                    <AlertDescription className="text-xs">
                                                        {server.error}
                                                    </AlertDescription>
                                                </Alert>
                                            )}
                                        </div>
                                    </CardHeader>

                                    <CardFooter className="flex items-center justify-between border-t pt-4 bg-muted/20">
                                        <div className="flex items-center gap-4">
                                            <div className="flex items-center gap-2">
                                                <Switch
                                                    checked={server.enabled}
                                                    onCheckedChange={(c) => handleToggleServer(server.id, c)}
                                                />
                                                <span className="text-xs font-medium">{server.enabled ? "Enabled" : "Disabled"}</span>
                                            </div>

                                            {server.tools && server.tools.length > 0 && (
                                                <span className="text-xs text-muted-foreground">
                                                    {server.tools.length} tool{server.tools.length !== 1 ? "s" : ""}
                                                    {server.toolPolicy?.disabledTools.length ?
                                                        ` (${server.toolPolicy.disabledTools.length} disabled)` :
                                                        ""
                                                    }
                                                </span>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleTestConnection(server)}
                                                disabled={isTestingConnection}
                                                className="gap-2"
                                            >
                                                {isTestingConnection ? (
                                                    <Loader2 className="h-3 w-3 animate-spin" />
                                                ) : (
                                                    <Plug className="h-3 w-3" />
                                                )}
                                                Test Connection
                                            </Button>

                                            {server.tools && server.tools.length > 0 && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => openToolConfig(server)}
                                                    className="gap-2"
                                                >
                                                    <Settings2 className="h-3 w-3" />
                                                    Tools
                                                </Button>
                                            )}

                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="text-destructive hover:text-destructive"
                                                onClick={() => handleDelete(server.id)}
                                            >
                                                <Trash2 className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    </CardFooter>
                                </Card>
                            ))}
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="hub" className="space-y-4 mt-4">
                    <Alert>
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription className="text-sm">
                            Integration Hubs allow you to connect multiple apps and services through a single endpoint.
                            Set up your workflows once in the hub, then use them in Lumina.
                        </AlertDescription>
                    </Alert>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {filteredRegistry.map((hub) => (
                            <Card key={hub.id} className="flex flex-col">
                                <CardHeader className="flex-row gap-4 space-y-0">
                                    <div className="h-12 w-12 shrink-0 rounded bg-muted flex items-center justify-center overflow-hidden">
                                        {hub.logoUrl ? (
                                            /* eslint-disable-next-line @next/next/no-img-element */
                                            <img src={hub.logoUrl} alt={hub.name} className="h-full w-full object-cover" />
                                        ) : (
                                            <Server className="h-6 w-6 text-muted-foreground" />
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <CardTitle className="text-base">{hub.name}</CardTitle>
                                        <Badge variant="outline" className="mt-1 text-[10px]">{hub.author}</Badge>
                                    </div>
                                </CardHeader>
                                <CardContent className="flex-1">
                                    <p className="text-sm text-muted-foreground">{hub.description}</p>

                                    {hub.setup?.steps && (
                                        <div className="mt-4 pt-4 border-t">
                                            <p className="text-xs font-medium mb-2">What you'll need:</p>
                                            <ul className="text-xs text-muted-foreground space-y-1">
                                                {hub.setup.steps.slice(0, 2).map((step, idx) => (
                                                    <li key={idx}>• {step.title}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </CardContent>
                                <CardFooter>
                                    <Button className="w-full gap-2" onClick={() => handleInstallHub(hub.id)}>
                                        <Plus className="h-4 w-4" /> Connect
                                    </Button>
                                </CardFooter>
                            </Card>
                        ))}
                    </div>
                </TabsContent>
            </Tabs>

            {renderHubSetupDialog()}
            {renderToolConfigDialog()}
        </div>
    );
}
