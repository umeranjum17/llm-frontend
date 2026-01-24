"use client";

import { useState, memo, useMemo, useDeferredValue, useCallback, useEffect, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useLiveQueryWithTimeout } from "@/hooks/use-live-query-with-timeout";
import { Plug, PlugZap, Check, AlertCircle, Loader2, Box, Search, X, Settings, Zap } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { getMcpServerById, getChatById, updateChat, getAgentById } from "@/lib/db/queries";
import { useSettingsStore } from "@/stores/settings-store";
import { toast } from "sonner";
import Link from "next/link";
import { useComposioApps } from "@/hooks/use-composio-apps";

// Memoized toolkit logo component
const ToolkitLogo = memo(function ToolkitLogo({
    src,
    name,
}: {
    src?: string;
    name: string;
}) {
    const [hasError, setHasError] = useState(false);

    if (!src || hasError) {
        return <Box className="h-4 w-4 text-muted-foreground" />;
    }

    return (
        <img
            src={src}
            alt={name}
            className="h-4 w-4 object-contain"
            onError={() => setHasError(true)}
            loading="lazy"
        />
    );
});

// Memoized toolkit item component
const ToolkitItem = memo(function ToolkitItem({
    toolkit,
    isEnabled,
    isComposioActive,
    onToggle,
}: {
    toolkit: { key: string; name: string; logo?: string; isEnabled: boolean };
    isEnabled: boolean;
    isComposioActive: boolean;
    onToggle: (toolkitKey: string) => void;
}) {
    return (
        <div
            className={cn(
                "flex items-center justify-between py-2 px-3 rounded-lg transition-colors",
                isEnabled ? "bg-primary/5" : "hover:bg-muted/50"
            )}
        >
            <div className="flex items-center gap-3 min-w-0 flex-1">
                <ToolkitLogo src={toolkit.logo} name={toolkit.name} />
                <span className="text-sm truncate">{toolkit.name}</span>
            </div>
            <Switch
                checked={isEnabled}
                onCheckedChange={() => onToggle(toolkit.key)}
                className="scale-90"
                disabled={!isComposioActive}
            />
        </div>
    );
});

interface ToolQuickToggleProps {
    chatId?: string;
}

export function ToolQuickToggle({ chatId }: ToolQuickToggleProps) {
    const [open, setOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
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
            setTimeout(() => searchInputRef.current?.focus(), 50);
        }
    }, [open]);

    // Query only the composio-consolidated server
    const composioServerQuery = useLiveQueryWithTimeout(
        () => getMcpServerById("composio-consolidated"),
        [],
        { timeoutMs: 5000 }
    );
    const composioServer = composioServerQuery.data;

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
    const defaultMcpServerIds = useSettingsStore((s) => s.defaultMcpServerIds);

    // Get toolkits from the composio server (memoize to prevent new array on every render)
    const toolkits = useMemo(() => composioServer?.composioToolkits || [], [composioServer?.composioToolkits]);

    // Check if Composio is active - use chat's activeMcpServerIds if available, else fall back to defaults
    const activeMcpIds = chat?.activeMcpServerIds ?? defaultMcpServerIds ?? [];
    const isComposioActive = activeMcpIds.includes("composio-consolidated");

    // Count enabled toolkits
    const enabledToolkitsCount = toolkits.filter(t => t.isEnabled).length;

    // Filter toolkits based on search
    const filteredToolkits = useMemo(() => {
        if (!deferredSearch.trim()) return toolkits;

        const query = deferredSearch.toLowerCase();
        return toolkits.filter(toolkit =>
            toolkit.name.toLowerCase().includes(query) ||
            toolkit.key.toLowerCase().includes(query)
        );
    }, [toolkits, deferredSearch]);

    // Sort: enabled first, then alphabetically
    const sortedToolkits = useMemo(() => {
        return [...filteredToolkits].sort((a, b) => {
            if (a.isEnabled !== b.isEnabled) return a.isEnabled ? -1 : 1;
            return a.name.localeCompare(b.name);
        });
    }, [filteredToolkits]);

    // Handler for toggling individual Composio toolkits
    const handleToolkitToggle = useCallback((toolkitKey: string) => {
        toggleToolkit(toolkitKey);
        const toolkit = toolkits.find(t => t.key === toolkitKey);
        toast.success(toolkit?.isEnabled ? `Disabled ${toolkit?.name}` : `Enabled ${toolkit?.name}`);
    }, [toggleToolkit, toolkits]);

    // Handler for master Composio toggle
    const toggleComposio = useCallback(async () => {
        // Use current active IDs from chat or defaults
        const currentActive = chat?.activeMcpServerIds ?? defaultMcpServerIds ?? [];
        const newActive = isComposioActive
            ? currentActive.filter(id => id !== "composio-consolidated")
            : [...currentActive, "composio-consolidated"];

        // Always update defaults
        await updateDefaultMcpServerIds(newActive);

        // Also update specific chat if we have one
        if (chatId) {
            await updateChat(chatId, { activeMcpServerIds: newActive });
        }

        toast.success(isComposioActive ? "Composio disconnected" : "Composio connected");
    }, [chatId, chat?.activeMcpServerIds, defaultMcpServerIds, isComposioActive, updateDefaultMcpServerIds]);

    // Enable all toolkits
    const enableAllToolkits = useCallback(async () => {
        for (const toolkit of toolkits) {
            if (!toolkit.isEnabled) {
                await toggleToolkit(toolkit.key);
            }
        }
        toast.success("All apps enabled");
    }, [toolkits, toggleToolkit]);

    // Disable all toolkits
    const disableAllToolkits = useCallback(async () => {
        for (const toolkit of toolkits) {
            if (toolkit.isEnabled) {
                await toggleToolkit(toolkit.key);
            }
        }
        toast.success("All apps disabled");
    }, [toolkits, toggleToolkit]);

    // Get status icon for Composio connection
    const getStatusIcon = () => {
        if (!isComposioActive) return null;
        switch (composioServer?.status) {
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

    // Show error state if queries timed out
    if (composioServerQuery.isTimedOut || chatQuery.isTimedOut) {
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

    // Check if Composio is configured
    const hasComposio = composioServer && toolkits.length > 0;

    // Count active tools (enabled toolkits when Composio is active)
    const activeToolsCount = isComposioActive ? enabledToolkitsCount : 0;

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                        "h-8 w-8 relative",
                        activeToolsCount > 0 && "text-primary",
                        !hasComposio && "opacity-50 cursor-not-allowed"
                    )}
                    title={hasComposio ? "Composio Tools" : "No tools configured"}
                    disabled={!hasComposio}
                >
                    {activeToolsCount > 0 ? (
                        <PlugZap className="h-4 w-4" />
                    ) : (
                        <Plug className="h-4 w-4" />
                    )}
                    {activeToolsCount > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-primary text-[9px] font-bold text-primary-foreground flex items-center justify-center">
                            {activeToolsCount > 99 ? "99+" : activeToolsCount}
                        </span>
                    )}
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col p-0 overflow-hidden">
                <DialogHeader className="px-4 pt-4 pb-2">
                    <div className="flex items-center justify-between">
                        <DialogTitle className="flex items-center gap-2">
                            <Zap className="h-5 w-5 text-primary" />
                            Composio Tools
                            {getStatusIcon()}
                        </DialogTitle>
                        <div onClick={(e) => e.stopPropagation()}>
                            <Switch
                                checked={isComposioActive}
                                onCheckedChange={toggleComposio}
                            />
                        </div>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                        <Badge variant={isComposioActive ? "secondary" : "outline"} className="text-xs">
                            {isComposioActive ? "Connected" : "Disconnected"}
                        </Badge>
                        {enabledToolkitsCount > 0 && (
                            <Badge variant="outline" className="text-xs">
                                {enabledToolkitsCount} app{enabledToolkitsCount !== 1 ? "s" : ""} enabled
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
                            placeholder="Search apps..."
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
                        onClick={enableAllToolkits}
                        disabled={!isComposioActive}
                    >
                        Enable All
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="text-xs h-7"
                        onClick={disableAllToolkits}
                        disabled={!isComposioActive}
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

                {/* Toolkit List */}
                <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-4">
                    <div className="space-y-1">
                        {sortedToolkits.map((toolkit) => (
                            <ToolkitItem
                                key={toolkit.key}
                                toolkit={toolkit}
                                isEnabled={toolkit.isEnabled}
                                isComposioActive={isComposioActive}
                                onToggle={handleToolkitToggle}
                            />
                        ))}

                        {sortedToolkits.length === 0 && searchQuery && (
                            <div className="text-center py-8 text-muted-foreground text-sm">
                                No apps matching &ldquo;{searchQuery}&rdquo;
                            </div>
                        )}

                        {sortedToolkits.length === 0 && !searchQuery && (
                            <div className="text-center py-8 text-muted-foreground text-sm">
                                No apps configured.{" "}
                                <Link href="/settings?tab=mcp" className="text-primary hover:underline" onClick={() => setOpen(false)}>
                                    Add apps in settings
                                </Link>
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
