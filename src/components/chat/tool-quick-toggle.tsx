"use client";

import { useState, memo, useMemo, useDeferredValue, useCallback, useEffect, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { useLiveQueryWithTimeout } from "@/hooks/use-live-query-with-timeout";
import { Plug, PlugZap, Check, AlertCircle, Loader2, Box, Search, X, Settings, Zap, RefreshCw } from "lucide-react";
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
import { SkeletonLoader } from "@/components/ui/skeleton";
import { getMcpServerById, getChatById, updateChat, getAgentById } from "@/lib/db/queries";
import { useSettingsStore } from "@/stores/settings-store";
import { useComposioStore } from "@/stores/composio-store";
import { useShallow } from "zustand/react/shallow";
import { useApiKeysStore } from "@/stores/api-keys-store";
import { toast } from "sonner";
import Link from "next/link";

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
    const hasFetchedForKeyRef = useRef<string | null>(null);

    const deferredSearch = useDeferredValue(searchQuery);

    // Composio store - single source of truth
    // Use useShallow to prevent infinite re-renders from array selectors
    const allToolkits = useComposioStore((s) => s.toolkits);
    const enabledToolkitKeys = useComposioStore(useShallow((s) => s.enabledToolkitKeys));

    // Filter connected toolkits in useMemo to avoid selector creating new array each render
    const toolkits = useMemo(() =>
        allToolkits.filter((t) => t.isConnected || t.noAuth),
        [allToolkits]
    );
    const toggleToolkit = useComposioStore((s) => s.toggleToolkit);
    const enableAllToolkits = useComposioStore((s) => s.enableAllToolkits);
    const disableAllToolkits = useComposioStore((s) => s.disableAllToolkits);
    const fetchToolkits = useComposioStore((s) => s.fetchToolkits);
    const fetchConnectionStatus = useComposioStore((s) => s.fetchConnectionStatus);
    const isLoadingToolkits = useComposioStore((s) => s.isLoadingToolkits);

    // API key from secure store
    const composioKey = useApiKeysStore((s) => s.getKeyForProvider("composio"));
    const hasComposioKey = !!composioKey?.key;

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

    /**
     * PERFORMANCE CRITICAL - Lazy Database Queries
     * Only query when dialog is open - button uses store state directly
     */
    const composioServerQuery = useLiveQueryWithTimeout(
        () => open ? getMcpServerById("composio-consolidated") : undefined,
        [open],
        { timeoutMs: 3000 }
    );
    const composioServer = composioServerQuery.data;

    const chatQuery = useLiveQueryWithTimeout(
        () => (open && chatId) ? getChatById(chatId) : undefined,
        [open, chatId],
        { timeoutMs: 3000 }
    );
    const chat = chatQuery.data;

    // Get agent if chat has one - only when dialog is open
    const agent = useLiveQuery(
        () => (open && chat?.agentId) ? getAgentById(chat.agentId) : undefined,
        [open, chat?.agentId]
    );

    /**
     * PERFORMANCE CRITICAL - Lazy-load Composio data when dialog opens
     * Tracks per-apiKey to avoid refetching on every dialog open
     * Uses existing deduplication in store for concurrent requests
     */
    useEffect(() => {
        if (open && hasComposioKey && composioKey?.key && hasFetchedForKeyRef.current !== composioKey.key) {
            hasFetchedForKeyRef.current = composioKey.key;
            // Fetch in background, don't block - uses deduplication
            Promise.all([
                fetchToolkits(composioKey.key),
                fetchConnectionStatus(composioKey.key)
            ]).catch(() => {});
        }
    }, [open, hasComposioKey, composioKey?.key, fetchToolkits, fetchConnectionStatus]);

    // Settings store for persisting default MCP servers
    const updateDefaultMcpServerIds = useSettingsStore((s) => s.updateDefaultMcpServerIds);
    const defaultMcpServerIds = useSettingsStore((s) => s.defaultMcpServerIds);

    // Check if Composio is active
    const activeMcpIds = chat?.activeMcpServerIds ?? defaultMcpServerIds ?? [];
    const isComposioActive = activeMcpIds.includes("composio-consolidated");

    // Count enabled toolkits from store
    const enabledToolkitsCount = enabledToolkitKeys.length;

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
        const toolkit = toolkits.find(t => t.key === toolkitKey);
        const wasEnabled = toolkit?.isEnabled;
        toggleToolkit(toolkitKey);
        toast.success(wasEnabled ? `Disabled ${toolkit?.name}` : `Enabled ${toolkit?.name}`);
    }, [toggleToolkit, toolkits]);

    // Handler for master Composio toggle
    const handleToggleComposio = useCallback(async () => {
        const currentActive = chat?.activeMcpServerIds ?? defaultMcpServerIds ?? [];
        const newActive = isComposioActive
            ? currentActive.filter((id: string) => id !== "composio-consolidated")
            : [...currentActive, "composio-consolidated"];

        await updateDefaultMcpServerIds(newActive);

        if (chatId) {
            await updateChat(chatId, { activeMcpServerIds: newActive });
        }

        toast.success(isComposioActive ? "Composio disconnected" : "Composio connected");
    }, [chatId, chat?.activeMcpServerIds, defaultMcpServerIds, isComposioActive, updateDefaultMcpServerIds]);

    // Enable all toolkits
    const handleEnableAll = useCallback(() => {
        enableAllToolkits();
        toast.success("All apps enabled");
    }, [enableAllToolkits]);

    // Disable all toolkits
    const handleDisableAll = useCallback(() => {
        disableAllToolkits();
        toast.success("All apps disabled");
    }, [disableAllToolkits]);

    // Get status icon for Composio connection
    // Only show loading if we don't have data yet (preemptive loading should have data ready)
    const getStatusIcon = () => {
        if (!isComposioActive) return null;
        if (isLoadingToolkits && toolkits.length === 0) {
            return <Loader2 className="h-3 w-3 text-muted-foreground animate-spin" />;
        }
        switch (composioServer?.status) {
            case "connected":
                return <Check className="h-3 w-3 text-green-500" />;
            case "error":
                return <AlertCircle className="h-3 w-3 text-destructive" />;
            default:
                return null;
        }
    };

    // Retry handler for timed out queries
    const handleRetry = useCallback(() => {
        if (composioServerQuery.isTimedOut) {
            composioServerQuery.retry();
        }
        if (chatQuery.isTimedOut) {
            chatQuery.retry();
        }
    }, [composioServerQuery, chatQuery]);

    // Check if queries have timed out - only show error if we have no toolkit data to display
    // The queries can return undefined legitimately when the server doesn't exist yet
    const isQueryTimedOut = (composioServerQuery.isTimedOut || chatQuery.isTimedOut) && toolkits.length === 0;

    // Hide for pipeline agents
    const isPipelineAgent = open && agent?.pipeline?.steps && agent.pipeline.steps.length > 0;
    if (isPipelineAgent) {
        return null;
    }

    // Button state - simple check
    const hasComposio = hasComposioKey;
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
            <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col p-0 overflow-hidden [&>button]:hidden">
                <DialogHeader className="px-4 pt-4 pb-2">
                    <div className="flex items-center justify-between">
                        <DialogTitle className="flex items-center gap-2">
                            <Zap className="h-5 w-5 text-primary" />
                            Composio Tools
                            {getStatusIcon()}
                        </DialogTitle>
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <Switch
                                checked={isComposioActive}
                                onCheckedChange={handleToggleComposio}
                            />
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => setOpen(false)}
                            >
                                <X className="h-4 w-4" />
                            </Button>
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
                        onClick={handleEnableAll}
                        disabled={!isComposioActive}
                    >
                        Enable All
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="text-xs h-7"
                        onClick={handleDisableAll}
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
                <div className="flex-1 min-h-0 max-h-[50vh] overflow-y-auto px-4 pb-4">
                    {isQueryTimedOut ? (
                        <div className="flex flex-col items-center justify-center py-8 gap-3">
                            <AlertCircle className="h-8 w-8 text-destructive" />
                            <p className="text-sm text-muted-foreground text-center">
                                Database connection timed out
                            </p>
                            <Button
                                variant="outline"
                                size="sm"
                                className="gap-2"
                                onClick={handleRetry}
                            >
                                <RefreshCw className="h-4 w-4" />
                                Retry
                            </Button>
                        </div>
                    ) : isLoadingToolkits && toolkits.length === 0 ? (
                        <SkeletonLoader variant="list" count={6} className="py-2" />
                    ) : (
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
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
