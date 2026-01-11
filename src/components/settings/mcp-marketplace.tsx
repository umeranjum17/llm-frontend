"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plug, Plus, Trash2, CheckCircle, XCircle, Search, Server, Power } from "lucide-react";
import { db, type McpServer } from "@/lib/db/schema";
import { MCP_REGISTRY } from "@/lib/mcp/registry";
import { toast } from "sonner";
import { nanoid } from "nanoid";
import { useLiveQuery } from "dexie-react-hooks";

export function McpMarketplace() {
    const installedServers = useLiveQuery(() => db.mcpServers.toArray()) || [];
    const [activeTab, setActiveTab] = useState("installed");
    const [searchQuery, setSearchQuery] = useState("");
    const [isAddingOpen, setIsAddingOpen] = useState(false);
    const [newServer, setNewServer] = useState<Partial<McpServer>>({
        name: "",
        url: "",
        apiKey: "",
        type: "sse"
    });

    const handleInstall = async (registryItem: Partial<McpServer>) => {
        try {
            await db.mcpServers.add({
                id: nanoid(),
                name: registryItem.name!,
                url: registryItem.url!,
                apiKey: "",
                description: registryItem.description,
                enabled: true,
                type: registryItem.type || "sse",
                collection: "curated",
                logoUrl: registryItem.logoUrl,
                author: registryItem.author,
                createdAt: Date.now(),
                updatedAt: Date.now(),
            });
            toast.success(`Installed ${registryItem.name}`);
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
                ...newServer as any,
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
        await db.mcpServers.update(id, { enabled });
    };

    const handleDelete = async (id: string) => {
        await db.mcpServers.delete(id);
        toast.success("Server removed");
    };

    const filteredInstalled = installedServers.filter(s =>
        s.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const filteredRegistry = MCP_REGISTRY.filter(r =>
        r.name?.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !installedServers.some(i => i.name === r.name) // Don't show installed
    );

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-medium">MCP Marketplace</h2>
                    <p className="text-sm text-muted-foreground">
                        Extend Lumina with tools from external Model Context Protocol servers.
                    </p>
                </div>
                <Dialog open={isAddingOpen} onOpenChange={setIsAddingOpen}>
                    <DialogTrigger asChild>
                        <Button className="gap-2">
                            <Plus className="h-4 w-4" /> Add Custom
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
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
                                    placeholder="My Tools"
                                    value={newServer.name}
                                    onChange={e => setNewServer({ ...newServer, name: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Server URL (SSE)</Label>
                                <Input
                                    placeholder="https://api.myserver.com/sse"
                                    value={newServer.url}
                                    onChange={e => setNewServer({ ...newServer, url: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>API Key (Optional)</Label>
                                <Input
                                    type="password"
                                    placeholder="sk-..."
                                    value={newServer.apiKey}
                                    onChange={e => setNewServer({ ...newServer, apiKey: e.target.value })}
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button onClick={handleAddCustom}>Add Server</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                    placeholder="Search plugins..."
                    className="pl-9"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                />
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList>
                    <TabsTrigger value="installed">Installed</TabsTrigger>
                    <TabsTrigger value="registry">Registry</TabsTrigger>
                </TabsList>

                <TabsContent value="installed" className="space-y-4 mt-4">
                    {filteredInstalled.length === 0 ? (
                        <div className="text-center py-10 text-muted-foreground">
                            No plugins installed. Check the Registry!
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {filteredInstalled.map(server => (
                                <Card key={server.id} className="flex flex-col">
                                    <CardHeader className="flex-row gap-4 space-y-0">
                                        <div className="h-10 w-10 shrink-0 rounded bg-muted flex items-center justify-center overflow-hidden">
                                            {server.logoUrl ? (
                                                /* eslint-disable-next-line @next/next/no-img-element */
                                                <img src={server.logoUrl} alt={server.name} className="h-full w-full object-cover" />
                                            ) : (
                                                <Plug className="h-5 w-5 text-muted-foreground" />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <CardTitle className="text-base truncate">{server.name}</CardTitle>
                                            <CardDescription className="text-xs truncate">
                                                {server.url}
                                            </CardDescription>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="flex-1 text-sm text-muted-foreground">
                                        {server.description || "No description provided."}
                                    </CardContent>
                                    <CardFooter className="flex items-center justify-between border-t pt-4 bg-muted/20">
                                        <div className="flex items-center gap-2">
                                            <Switch
                                                checked={server.enabled}
                                                onCheckedChange={(c) => handleToggle(server.id, c)}
                                            />
                                            <span className="text-xs">{server.enabled ? "Active" : "Off"}</span>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="text-destructive hover:text-destructive"
                                            onClick={() => handleDelete(server.id)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </CardFooter>
                                </Card>
                            ))}
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="registry" className="space-y-4 mt-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredRegistry.map((item, idx) => (
                            <Card key={idx} className="flex flex-col border-dashed hover:border-solid transition-colors">
                                <CardHeader className="flex-row gap-4 space-y-0">
                                    <div className="h-10 w-10 shrink-0 rounded bg-muted flex items-center justify-center overflow-hidden">
                                        {item.logoUrl ? (
                                            /* eslint-disable-next-line @next/next/no-img-element */
                                            <img src={item.logoUrl} alt={item.name} className="h-full w-full object-cover" />
                                        ) : (
                                            <Server className="h-5 w-5 text-muted-foreground" />
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <CardTitle className="text-base">{item.name}</CardTitle>
                                        <Badge variant="outline" className="mt-1 text-[10px]">{item.author}</Badge>
                                    </div>
                                </CardHeader>
                                <CardContent className="flex-1 text-sm text-muted-foreground">
                                    {item.description}
                                </CardContent>
                                <CardFooter>
                                    <Button className="w-full gap-2" onClick={() => handleInstall(item)}>
                                        <Plus className="h-4 w-4" /> Install
                                    </Button>
                                </CardFooter>
                            </Card>
                        ))}
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
