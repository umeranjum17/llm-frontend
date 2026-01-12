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
import { getAllMcpServers, updateMcpServer } from "@/lib/db/queries";
import { toast } from "sonner";
import { McpServer } from "@/lib/db/schema";

export function ToolQuickToggle() {
    const mcpServers = useLiveQuery(() => getAllMcpServers(), []);

    if (!mcpServers || mcpServers.length === 0) {
        return null;
    }

    const enabledCount = mcpServers.filter((s) => s.enabled).length;
    const totalCount = mcpServers.length;

    const toggleServer = async (server: McpServer) => {
        const newEnabled = !server.enabled;
        await updateMcpServer(server.id, { enabled: newEnabled });
        toast.success(
            newEnabled
                ? `${server.name} enabled`
                : `${server.name} temporarily disabled`
        );
    };

    const getStatusIcon = (server: McpServer) => {
        if (!server.enabled) {
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

    const getToolCount = (server: McpServer) => {
        if (!server.enabled) return null;
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
                    {mcpServers.map((server) => (
                        <div
                            key={server.id}
                            className="flex items-center justify-between px-2 py-2 hover:bg-accent rounded-sm transition-colors"
                        >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                <div className={cn(
                                    "h-5 w-5 rounded flex items-center justify-center shrink-0",
                                    server.enabled ? "bg-primary/10" : "bg-muted"
                                )}>
                                    <Plug className={cn(
                                        "h-3 w-3",
                                        server.enabled ? "text-primary" : "text-muted-foreground"
                                    )} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-sm font-medium truncate">{server.name}</span>
                                        {getStatusIcon(server)}
                                    </div>
                                    {server.enabled && (
                                        <div className="flex items-center gap-1 mt-0.5">
                                            {getToolCount(server) && (
                                                <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">
                                                    {getToolCount(server)} tools
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
                                checked={server.enabled}
                                onCheckedChange={() => toggleServer(server)}
                                className="shrink-0 ml-2 scale-90"
                            />
                        </div>
                    ))}
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
