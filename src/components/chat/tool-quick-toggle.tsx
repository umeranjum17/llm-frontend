"use client";

import { useState, memo, useMemo, useDeferredValue, useCallback, useEffect, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useLiveQueryWithTimeout } from "@/hooks/use-live-query-with-timeout";
import { Plug, PlugZap, Check, AlertCircle, Loader2, Box, Search, X, ChevronDown, ChevronRight, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { getAllMcpServers, getChatById, updateChat, getAgentById } from "@/lib/db/queries";
import { useSettingsStore } from "@/stores/settings-store";
import { toast } from "sonner";
import { McpServer } from "@/lib/db/schema";
import Link from "next/link";
import { useComposioApps } from "@/hooks/use-composio-apps";

// Memoized server logo component
const ServerLogo = memo(function ServerLogo({
    src,
    name,
    isActive
}: {
    src?: string;
    name: string;
    isActive: boolean;
}) {
    const [hasError, setHasError] = useState(false);

    if (!src || hasError) {
        return (
            <Plug className={cn(
                "h-4 w-4",
                isActive ? "text-primary" : "text-muted-foreground"
            )} />
        );
    }

    return (
        <img
            src={src}
            alt={name}
            className="h-5 w-5 object-contain"
            onError={() => setHasError(true)}
            loading="lazy"
        />
    );
});

// Memoized Composio server item with individual toolkit toggles
const ComposioServerItem = memo(function ComposioServerItem({
    server,
    isActive,
    isExpanded,
    onToggle,
    onExpandToggle,
    onToolkitToggle,
}: {
    server: McpServer;
    isActive: boolean;
    isExpanded: boolean;
    onToggle: (server: McpServer) => void;
    onExpandToggle: (serverId: string) => void;
    onToolkitToggle: (toolkitKey: string) => void;
}) {
    const toolkits = server.composioToolkits || [];
    const enabledToolkits = toolkits.filter(t => t.isEnabled);

    const getStatusIcon = () => {
        if (!isActive) return null;
        switch (server.status) {
            case "connected":
                return <Check className="h-3 w-3 text-green-500" />;
            case "error":
                return <AlertCircle className="h-3 w-3 text-destructive" />;
            case "disconnected":
                return <Loader2 className="h-3 w-3 text-muted-foreground animate-spin" />;
            default:
                return null;
        }
    };

    return (
        <div className={cn(
            "rounded-lg border transition-colors",
            isActive ? "bg-primary/5 border-primary/30" : "bg-card border-border"
        )}>
            {/* Server Header */}
            <div className="flex items-center justify-between p-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={cn(
                        "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                        isActive ? "bg-primary/10" : "bg-muted"
                    )}>
                        <ServerLogo
                            src={server.logoUrl}
                            name={server.name}
                            isActive={isActive}
                        />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">Composio</span>
                            {getStatusIcon()}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-muted-foreground">
                                {enabledToolkits.length}/{toolkits.length} apps enabled
                            </span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {toolkits.length > 0 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => onExpandToggle(server.id)}
                        >
                            {isExpanded ? (
                                <ChevronDown className="h-4 w-4" />
                            ) : (
                                <ChevronRight className="h-4 w-4" />
                            )}
                        </Button>
                    )}
                    <Switch
                        checked={isActive}
                        onCheckedChange={() => onToggle(server)}
                        className="scale-90"
                    />
                </div>
            </div>

            {/* Expanded Toolkits List */}
            {isExpanded && toolkits.length > 0 && (
                <div className="px-3 pb-3 border-t border-border/50 pt-2">
                    <div className="space-y-1 max-h-[300px] overflow-y-auto">
                        {toolkits.map((toolkit) => (
                            <div
                                key={toolkit.key}
                                className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50"
                            >
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                    {toolkit.logo ? (
                                        <img
                                            src={toolkit.logo}
                                            alt={toolkit.name}
                                            className="h-4 w-4 object-contain"
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).style.display = 'none';
                                            }}
                                        />
                                    ) : (
                                        <Box className="h-4 w-4 text-muted-foreground" />
                                    )}
                                    <span className="text-sm truncate">{toolkit.name}</span>
                                </div>
                                <Switch
                                    checked={toolkit.isEnabled}
                                    onCheckedChange={() => onToolkitToggle(toolkit.key)}
                                    className="scale-75"
                                    disabled={!isActive}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
});

// Memoized server item component
const ServerItem = memo(function ServerItem({
    server,
    isActive,
    isExpanded,
    onToggle,
    onExpandToggle,
}: {
    server: McpServer;
    isActive: boolean;
    isExpanded: boolean;
    onToggle: (server: McpServer) => void;
    onExpandToggle: (serverId: string) => void;
}) {
    const tools = server.tools || [];
    const disabledTools = server.toolPolicy?.disabledTools || [];
    const activeTools = tools.filter(t => !disabledTools.includes(t.name));

    const getStatusIcon = () => {
        if (!isActive) return null;
        switch (server.status) {
            case "connected":
                return <Check className="h-3 w-3 text-green-500" />;
            case "error":
                return <AlertCircle className="h-3 w-3 text-destructive" />;
            case "disconnected":
                return <Loader2 className="h-3 w-3 text-muted-foreground animate-spin" />;
            default:
                return null;
        }
    };

    return (
        <div className={cn(
            "rounded-lg border transition-colors",
            isActive ? "bg-primary/5 border-primary/30" : "bg-card border-border"
        )}>
            {/* Server Header */}
            <div className="flex items-center justify-between p-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={cn(
                        "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                        isActive ? "bg-primary/10" : "bg-muted"
                    )}>
                        <ServerLogo
                            src={server.logoUrl}
                            name={server.name}
                            isActive={isActive}
                        />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-medium truncate">{server.name}</span>
                            {getStatusIcon()}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                            {tools.length > 0 && (
                                <span className="text-xs text-muted-foreground">
                                    {activeTools.length} tool{activeTools.length !== 1 ? 's' : ''}
                                </span>
                            )}
                            {isActive && server.status === "error" && server.error && (
                                <span className="text-xs text-destructive truncate">
                                    {server.error}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {tools.length > 0 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => onExpandToggle(server.id)}
                        >
                            {isExpanded ? (
                                <ChevronDown className="h-4 w-4" />
                            ) : (
                                <ChevronRight className="h-4 w-4" />
                            )}
                        </Button>
                    )}
                    <Switch
                        checked={isActive}
                        onCheckedChange={() => onToggle(server)}
                        className="scale-90"
                    />
                </div>
            </div>

            {/* Expanded Tools List */}
            {isExpanded && tools.length > 0 && (
                <div className="px-3 pb-3 border-t border-border/50 pt-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                        {tools.map((tool) => {
                            const isDisabled = disabledTools.includes(tool.name);
                            return (
                                <div
                                    key={tool.name}
                                    className={cn(
                                        "flex items-center gap-2 px-2 py-1.5 rounded text-xs",
                                        isDisabled ? "text-muted-foreground line-through" : "text-foreground"
                                    )}
                                >
                                    <Box className={cn(
                                        "h-3 w-3 shrink-0",
                                        isDisabled ? "text-muted-foreground/50" : "text-primary"
                                    )} />
                                    <span className="truncate" title={tool.description || tool.name}>
                                        {tool.name}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
});

interface ToolQuickToggleProps {
    chatId?: string;
}

export function ToolQuickToggle({ chatId }: ToolQuickToggleProps) {
    const [open, setOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [expandedServers, setExpandedServers] = useState<Set<string>>(new Set());
    const searchInputRef = useRef<HTMLInputElement>(null);

    const deferredSearch = useDeferredValue(searchQuery);

    // Listen for keyboard shortcut event to open dialog
    useEffect(() => {
        const handleOpenTools = () => setOpen(true);
        window.addEventListener("lumina:open-tools", handleOpenTools);
        return () => window.removeEventListener("lumina:open-tools", handleOpenTools);
    }, []);

    // Auto-focus search input when dialog opens
    useEffect(() => {
        if (open) {
            // Small delay to ensure dialog is rendered
            setTimeout(() => searchInputRef.current?.focus(), 50);
        }
    }, [open]);

    // Use timeout wrapper for critical queries to detect DB stalls
    const mcpServersQuery = useLiveQueryWithTimeout(
        () => getAllMcpServers(),
        [],
        { timeoutMs: 5000, defaultValue: [] }
    );
    const mcpServers = mcpServersQuery.data;

    const chatQuery = useLiveQueryWithTimeout(
        () => chatId ? getChatById(chatId) : undefined,
        [chatId],
        { timeoutMs: 5000 }
    );
    const chat = chatQuery.data;

    // Get agent if chat has one
    const agent = useLiveQuery(
        () => chat?.agentId ? getAgentById(chat.agentId) : undefined,
        [chat?.agentId]
    );

    // Composio hook for toggling individual toolkits
    const { toggleToolkit, hasApiKey: hasComposioKey } = useComposioApps();

    // Settings store for persisting default MCP servers
    const updateDefaultMcpServerIds = useSettingsStore((s) => s.updateDefaultMcpServerIds);

    // Handler for toggling individual Composio toolkits
    const handleToolkitToggle = useCallback((toolkitKey: string) => {
        toggleToolkit(toolkitKey);
        toast.success(`Toolkit ${toolkitKey} toggled`);
    }, [toggleToolkit]);

    // Filter servers based on search
    const filteredServers = useMemo(() => {
        if (!mcpServers) return [];
        if (!deferredSearch.trim()) return mcpServers;

        const query = deferredSearch.toLowerCase();
        return mcpServers.filter(server => {
            // Match server name
            if (server.name.toLowerCase().includes(query)) return true;
            // Match Composio toolkit names
            if (server.composioToolkits) {
                const matchesToolkit = server.composioToolkits.some(toolkit =>
                    toolkit.name.toLowerCase().includes(query) ||
                    toolkit.key.toLowerCase().includes(query)
                );
                if (matchesToolkit) return true;
            }
            // Match tool names
            const tools = server.tools || [];
            return tools.some(tool =>
                tool.name.toLowerCase().includes(query) ||
                tool.description?.toLowerCase().includes(query)
            );
        });
    }, [mcpServers, deferredSearch]);

    // Sort: active first, then by name
    const sortedServers = useMemo(() => {
        if (!filteredServers) return [];
        const activeIds = new Set(chat?.activeMcpServerIds || []);

        return [...filteredServers].sort((a, b) => {
            const aActive = activeIds.has(a.id);
            const bActive = activeIds.has(b.id);
            if (aActive !== bActive) return aActive ? -1 : 1;
            return a.name.localeCompare(b.name);
        });
    }, [filteredServers, chat?.activeMcpServerIds]);

    const activeServerIds = chat?.activeMcpServerIds !== undefined
        ? new Set(chat.activeMcpServerIds || [])
        : new Set<string>();

    const enabledCount = (mcpServers || []).filter((s) => activeServerIds.has(s.id)).length;
    const totalCount = (mcpServers || []).length;
    const totalTools = (mcpServers || []).reduce((acc, s) => {
        if (!activeServerIds.has(s.id)) return acc;

        // For Composio consolidated server, count enabled toolkits
        if (s.id === "composio-consolidated" && s.composioToolkits) {
            const enabledToolkits = s.composioToolkits.filter(t => t.isEnabled).length;
            return acc + enabledToolkits;
        }

        // For regular MCP servers, count tools minus disabled ones
        const tools = s.tools || [];
        const disabled = s.toolPolicy?.disabledTools?.length || 0;
        return acc + tools.length - disabled;
    }, 0);

    const toggleServer = async (server: McpServer) => {
        if (!chatId) return;

        const currentActive = chat?.activeMcpServerIds ?? [];
        const newActive = currentActive.includes(server.id)
            ? currentActive.filter(id => id !== server.id)
            : [...currentActive, server.id];

        // Update both the chat and the default settings (via store for proper sync)
        await Promise.all([
            updateChat(chatId, { activeMcpServerIds: newActive }),
            updateDefaultMcpServerIds(newActive),
        ]);
        toast.success(
            newActive.includes(server.id)
                ? `${server.name} enabled`
                : `${server.name} disabled`
        );
    };

    const toggleExpanded = (serverId: string) => {
        setExpandedServers(prev => {
            const next = new Set(prev);
            if (next.has(serverId)) {
                next.delete(serverId);
            } else {
                next.add(serverId);
            }
            return next;
        });
    };

    const enableAll = async () => {
        if (!chatId || !mcpServers) return;
        const allIds = mcpServers.map(s => s.id);
        await Promise.all([
            updateChat(chatId, { activeMcpServerIds: allIds }),
            updateDefaultMcpServerIds(allIds),
        ]);
        toast.success("All MCP servers enabled");
    };

    const disableAll = async () => {
        if (!chatId) return;
        await Promise.all([
            updateChat(chatId, { activeMcpServerIds: [] }),
            updateDefaultMcpServerIds([]),
        ]);
        toast.success("All MCP servers disabled");
    };

    // Show error state if queries timed out
    if (mcpServersQuery.isTimedOut || chatQuery.isTimedOut) {
        return (
            <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                title="Database timeout - click to retry"
                onClick={() => {
                    window.location.reload();
                }}
            >
                <Plug className="h-4 w-4 text-destructive" />
            </Button>
        );
    }

    // Hide for pipeline agents - tools are configured per-step
    const isPipelineAgent = agent?.pipeline?.steps && agent.pipeline.steps.length > 0;
    if (isPipelineAgent) {
        return null;
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                        "h-8 w-8 relative",
                        totalTools > 0 && "text-primary"
                    )}
                    title="MCP Tools"
                >
                    {totalTools > 0 ? (
                        <PlugZap className="h-4 w-4" />
                    ) : (
                        <Plug className="h-4 w-4" />
                    )}
                    {totalTools > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-primary text-[9px] font-bold text-primary-foreground flex items-center justify-center">
                            {totalTools > 99 ? "99+" : totalTools}
                        </span>
                    )}
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col p-0 overflow-hidden">
                <DialogHeader className="px-4 pt-4 pb-2">
                    <DialogTitle className="flex items-center gap-2">
                        <PlugZap className="h-5 w-5 text-primary" />
                        MCP Tools
                    </DialogTitle>
                    <div className="flex items-center gap-2 mt-1">
                        <Badge variant="secondary" className="text-xs">
                            {enabledCount}/{totalCount} servers
                        </Badge>
                        {totalTools > 0 && (
                            <Badge variant="outline" className="text-xs">
                                {totalTools} tools active
                            </Badge>
                        )}
                    </div>
                </DialogHeader>

                {/* Search */}
                <div className="px-4 pb-2">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            ref={searchInputRef}
                            placeholder="Search servers or tools..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 pr-9 h-9"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery("")}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Quick Actions */}
                <div className="px-4 pb-2 flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        className="text-xs h-7"
                        onClick={enableAll}
                    >
                        Enable All
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="text-xs h-7"
                        onClick={disableAll}
                    >
                        Disable All
                    </Button>
                    <div className="flex-1" />
                    <Link href="/settings?tab=mcp" onClick={() => setOpen(false)}>
                        <Button variant="ghost" size="sm" className="text-xs h-7 gap-1">
                            <Settings className="h-3 w-3" />
                            Settings
                        </Button>
                    </Link>
                </div>

                {/* Server List */}
                <ScrollArea className="flex-1 min-h-0 px-4 pb-4">
                    <div className="space-y-2">
                        {sortedServers.map((server) => {
                            // Use ComposioServerItem for Composio consolidated servers
                            const isComposioServer = server.id === "composio-consolidated" && server.composioToolkits;

                            if (isComposioServer) {
                                return (
                                    <ComposioServerItem
                                        key={server.id}
                                        server={server}
                                        isActive={activeServerIds.has(server.id)}
                                        isExpanded={expandedServers.has(server.id)}
                                        onToggle={toggleServer}
                                        onExpandToggle={toggleExpanded}
                                        onToolkitToggle={handleToolkitToggle}
                                    />
                                );
                            }

                            return (
                                <ServerItem
                                    key={server.id}
                                    server={server}
                                    isActive={activeServerIds.has(server.id)}
                                    isExpanded={expandedServers.has(server.id)}
                                    onToggle={toggleServer}
                                    onExpandToggle={toggleExpanded}
                                />
                            );
                        })}

                        {sortedServers.length === 0 && searchQuery && (
                            <div className="text-center py-8 text-muted-foreground text-sm">
                                No servers or tools matching &ldquo;{searchQuery}&rdquo;
                            </div>
                        )}

                        {sortedServers.length === 0 && !searchQuery && (
                            <div className="text-center py-8 text-muted-foreground text-sm">
                                No MCP servers configured.{" "}
                                <Link href="/settings?tab=mcp" className="text-primary hover:underline" onClick={() => setOpen(false)}>
                                    Add servers in settings
                                </Link>
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}
