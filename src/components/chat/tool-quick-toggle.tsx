"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Plug, PlugZap, Check, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getAllMcpServers, getChatById, updateChat } from "@/lib/db/queries";
import { toast } from "sonner";
import { McpServer } from "@/lib/db/schema";

interface ToolQuickToggleProps {
    chatId?: string;
}

export function ToolQuickToggle({ chatId }: ToolQuickToggleProps) {
    const mcpServers = useLiveQuery(() => getAllMcpServers(), []);
    const chat = useLiveQuery(() => chatId ? getChatById(chatId) : undefined, [chatId]);

    if (!mcpServers || mcpServers.length === 0) {
        return null;
    }

    // If chat has activeMcpServerIds set, use those; otherwise fall back to globally enabled
    const hasAgentMcpServers = chat?.activeMcpServerIds !== undefined;
    const activeServerIds = hasAgentMcpServers
        ? new Set(chat.activeMcpServerIds || [])
        : new Set(mcpServers.filter(s => s.enabled).map(s => s.id));

    const enabledCount = mcpServers.filter((s) => activeServerIds.has(s.id)).length;
    const totalCount = mcpServers.length;

    const toggleServer = async (server: McpServer) => {
        if (!chatId) return;

        // Update chat-specific active MCP servers
        const currentActive = chat?.activeMcpServerIds ?? mcpServers.filter(s => s.enabled).map(s => s.id);
        const newActive = currentActive.includes(server.id)
            ? currentActive.filter(id => id !== server.id)
            : [...currentActive, server.id];

        await updateChat(chatId, { activeMcpServerIds: newActive });
        toast.success(
            newActive.includes(server.id)
                ? `${server.name} enabled`
                : `${server.name} disabled`
        );
    };

    const getStatusIcon = (server: McpServer, isActive: boolean) => {
        if (!isActive) {
            return null;
        }
        switch (server.status) {
            case "connected":
                return <Check className="h-3 w-3 text-green-500" />;
            case "error":
                return <AlertCircle className="h-3 w-3 text-destructive" />;
            case "disconnected":
                return <Loader2 className="h-3 w-3 text-muted-foreground animate-spin" />;
            default:
                // No icon for idle/undefined status
                return null;
        }
    };

    const getToolCount = (server: McpServer, isActive: boolean) => {
        if (!isActive) return null;
        const tools = server.tools || [];
        const disabled = server.toolPolicy?.disabledTools?.length || 0;
        const active = tools.length - disabled;
        return active > 0 ? active : null;
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                        "h-8 w-8 relative",
                        enabledCount > 0 && "text-primary"
                    )}
                    title="Quick tool toggle"
                >
                    {enabledCount > 0 ? (
                        <PlugZap className="h-4 w-4" />
                    ) : (
                        <Plug className="h-4 w-4" />
                    )}
                    {enabledCount > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-primary text-[9px] font-bold text-primary-foreground flex items-center justify-center">
                            {enabledCount}
                        </span>
                    )}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel className="flex items-center justify-between">
                    <span>MCP Tools</span>
                    <span className="text-xs font-normal text-muted-foreground">
                        {enabledCount}/{totalCount} active
                    </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <div className="max-h-[300px] overflow-y-auto py-1">
                    {mcpServers.map((server) => {
                        const isActive = activeServerIds.has(server.id);
                        return (
                            <div
                                key={server.id}
                                className="flex items-center justify-between px-2 py-2 hover:bg-accent rounded-sm transition-colors"
                            >
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <div className={cn(
                                        "h-5 w-5 rounded flex items-center justify-center shrink-0",
                                        isActive ? "bg-primary/10" : "bg-muted"
                                    )}>
                                        <Plug className={cn(
                                            "h-3 w-3",
                                            isActive ? "text-primary" : "text-muted-foreground"
                                        )} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-sm font-medium truncate">{server.name}</span>
                                            {getStatusIcon(server, isActive)}
                                        </div>
                                        {isActive && (
                                            <div className="flex items-center gap-1 mt-0.5">
                                                {getToolCount(server, isActive) && (
                                                    <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">
                                                        {getToolCount(server, isActive)} tools
                                                    </Badge>
                                                )}
                                                {server.status === "error" && server.error && (
                                                    <span className="text-[10px] text-destructive truncate">
                                                        {server.error}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <Switch
                                    checked={isActive}
                                    onCheckedChange={() => toggleServer(server)}
                                    className="shrink-0 ml-2 scale-90"
                                />
                            </div>
                        );
                    })}
                </div>
                {mcpServers.length === 0 && (
                    <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                        No MCP servers configured
                    </div>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
