"use client";

import { useState, memo, useMemo, useRef, useCallback, useDeferredValue } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Link2,
  Loader2,
  CheckCircle2,
  ExternalLink,
  AlertCircle,
  Zap,
  Box,
  RefreshCw,
  Key,
  Trash2,
  Eye,
  EyeOff,
  Search,
} from "lucide-react";
import { useComposioApps, type ComposioToolkit } from "@/hooks/use-composio-apps";
import { useSettingsStore } from "@/stores/settings-store";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Memoized logo component
const ToolkitLogo = memo(function ToolkitLogo({ src, alt }: { src?: string; alt: string }) {
  const [hasError, setHasError] = useState(false);

  if (!src || hasError) {
    return <Box className="h-5 w-5 text-muted-foreground" />;
  }

  return (
    <img
      src={src}
      alt={alt}
      width={20}
      height={20}
      className="w-5 h-5 object-contain"
      onError={() => setHasError(true)}
      loading="lazy"
    />
  );
});

// Memoized toolkit item component for virtualization
const ToolkitItem = memo(function ToolkitItem({
  toolkit,
  isConnecting,
  onToggle,
  onAuthorize,
}: {
  toolkit: ComposioToolkit;
  isConnecting: boolean;
  onToggle: (toolkit: ComposioToolkit, currentEnabled: boolean) => void;
  onAuthorize: (key: string, name: string) => void;
}) {
  const needsAuth = !toolkit.isConnected && !toolkit.noAuth;

  return (
    <div
      className={cn(
        "flex items-center justify-between p-3 rounded-lg border transition-colors",
        toolkit.isEnabled && "bg-primary/5 border-primary/20",
        toolkit.isConnected && "border-green-500/30",
        needsAuth && !toolkit.isEnabled && "opacity-60 border-dashed"
      )}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className={cn(
          "h-8 w-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0",
          needsAuth && "grayscale"
        )}>
          <ToolkitLogo src={toolkit.logo} alt={toolkit.name} />
        </div>
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium truncate max-w-[120px] sm:max-w-none">{toolkit.name}</span>
            {toolkit.isConnected && (
              <Badge variant="outline" className="text-[10px] h-4 px-1 text-green-600 border-green-600/30 flex-shrink-0">
                Connected
              </Badge>
            )}
            {needsAuth && (
              <Badge variant="outline" className="text-[10px] h-4 px-1 text-yellow-600 border-yellow-600/30 flex-shrink-0">
                Auth
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {toolkit.description || (needsAuth ? "Connect to enable" : "")}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
        {needsAuth && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs gap-1"
            onClick={() => onAuthorize(toolkit.key, toolkit.name)}
            disabled={isConnecting}
          >
            {isConnecting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <>
                <Link2 className="h-3 w-3" />
                Connect
              </>
            )}
          </Button>
        )}
        <Switch
          checked={toolkit.isEnabled}
          onCheckedChange={() => onToggle(toolkit, toolkit.isEnabled)}
          disabled={needsAuth && !toolkit.isEnabled}
          className="data-[state=checked]:bg-primary"
        />
      </div>
    </div>
  );
});

export function ComposioAppsSection() {
  const {
    apiKey,
    hasApiKey,
    setApiKey,
    removeApiKey,
    toolkits,
    toggleToolkit,
    enabledCount,
    mcpUrl,
    isLoading,
    isLoadingToolkits,
    error,
    connectingToolkit,
    authorize,
    fetchToolkits,
    fetchConnectionStatus,
    resetMcpServers,
  } = useComposioApps();

  // Settings store for master toggle
  const storeDefaultMcpServerIds = useSettingsStore((s) => s.defaultMcpServerIds);
  const defaultMcpServerIds = useMemo(() => storeDefaultMcpServerIds ?? [], [storeDefaultMcpServerIds]);
  const updateDefaultMcpServerIds = useSettingsStore((s) => s.updateDefaultMcpServerIds);

  // Check if Composio is enabled (in default server IDs)
  const isComposioEnabled = defaultMcpServerIds.includes("composio-consolidated");

  // Handler for master toggle
  const handleMasterToggle = useCallback(async () => {
    const newServerIds = isComposioEnabled
      ? defaultMcpServerIds.filter(id => id !== "composio-consolidated")
      : [...defaultMcpServerIds, "composio-consolidated"];

    await updateDefaultMcpServerIds(newServerIds);
    toast.success(isComposioEnabled ? "Composio disabled" : "Composio enabled");
  }, [isComposioEnabled, defaultMcpServerIds, updateDefaultMcpServerIds]);

  const [inputApiKey, setInputApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Use deferred value for search to keep input responsive
  const deferredSearchQuery = useDeferredValue(searchQuery);

  // Ref for virtualized list container
  const parentRef = useRef<HTMLDivElement>(null);

  // Filter toolkits based on search query (uses deferred value)
  const filteredToolkits = useMemo(() => {
    if (!deferredSearchQuery.trim()) return toolkits;
    const query = deferredSearchQuery.toLowerCase();
    return toolkits.filter(
      (toolkit) =>
        toolkit.name.toLowerCase().includes(query) ||
        toolkit.key.toLowerCase().includes(query) ||
        toolkit.description?.toLowerCase().includes(query) ||
        toolkit.categories?.some((c) => c.name.toLowerCase().includes(query))
    );
  }, [toolkits, deferredSearchQuery]);

  // Sort: connected first, then noAuth apps, then apps needing auth
  const sortedToolkits = useMemo(() => {
    return [...filteredToolkits].sort((a, b) => {
      // Priority: connected+enabled (0) > connected (1) > noAuth (2) > needs auth (3)
      const getPriority = (t: ComposioToolkit) => {
        if (t.isConnected && t.isEnabled) return 0;
        if (t.isConnected) return 1;
        if (t.noAuth) return 2; // No auth required - ready to use
        return 3; // Needs auth but not connected
      };
      const priorityDiff = getPriority(a) - getPriority(b);
      if (priorityDiff !== 0) return priorityDiff;
      // Within same priority, sort alphabetically
      return a.name.localeCompare(b.name);
    });
  }, [filteredToolkits]);

  // Virtualizer for individual items
  const rowVirtualizer = useVirtualizer({
    count: sortedToolkits.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 68, // Approximate height of each item
    overscan: 5,
  });

  const handleSaveApiKey = useCallback(async () => {
    if (!inputApiKey.trim()) {
      toast.error("Please enter an API key");
      return;
    }
    await setApiKey(inputApiKey.trim());
    setInputApiKey("");
    toast.success("Composio connected");
  }, [inputApiKey, setApiKey]);

  const handleRemoveApiKey = useCallback(async () => {
    await removeApiKey();
    toast.success("Composio disconnected");
  }, [removeApiKey]);

  const handleAuthorize = useCallback(async (toolkit: string, name: string) => {
    try {
      await authorize(toolkit);
      toast.success(`Authorizing ${name}`, {
        description: "Complete authentication in the new window",
      });
      setTimeout(() => fetchConnectionStatus(), 3000);
    } catch {
      toast.error(`Failed to authorize ${name}`);
    }
  }, [authorize, fetchConnectionStatus]);

  const handleToggle = useCallback(async (toolkit: ComposioToolkit, currentEnabled: boolean) => {
    // Don't allow enabling if not connected (unless it's a no-auth toolkit)
    if (!currentEnabled && !toolkit.isConnected && !toolkit.noAuth) {
      toast.error(`Connect ${toolkit.name} first`, {
        description: "Click the link icon to authenticate before enabling",
      });
      return;
    }

    await toggleToolkit(toolkit.key);
    toast.success(currentEnabled ? `Disabled ${toolkit.name}` : `Enabled ${toolkit.name}`);
    // Session will auto-recreate via useEffect when mcpUrl becomes null
  }, [toggleToolkit]);

  const handleRefresh = useCallback(async () => {
    await fetchToolkits();
    await fetchConnectionStatus();
  }, [fetchToolkits, fetchConnectionStatus]);

  const handleResetMcp = useCallback(async () => {
    await resetMcpServers();
    toast.success("MCP servers reset and synced with Composio");
  }, [resetMcpServers]);

  const connectedCount = useMemo(() => toolkits.filter((t) => t.isConnected).length, [toolkits]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Composio Tools
            {hasApiKey && (
              <Badge variant={isComposioEnabled ? "secondary" : "outline"} className="text-xs ml-2">
                {isComposioEnabled ? "Enabled" : "Disabled"}
              </Badge>
            )}
          </CardTitle>
          {hasApiKey && (
            <div onClick={(e) => e.stopPropagation()}>
              <Switch
                checked={isComposioEnabled}
                onCheckedChange={handleMasterToggle}
              />
            </div>
          )}
        </div>
        <CardDescription>
          Connect 150+ apps and services through Composio&apos;s unified API
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* API Key Section */}
        {!hasApiKey ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type={showApiKey ? "text" : "password"}
                  placeholder="Enter your Composio API key"
                  value={inputApiKey}
                  onChange={(e) => setInputApiKey(e.target.value)}
                  className="pl-9 pr-9"
                  onKeyDown={(e) => e.key === "Enter" && handleSaveApiKey()}
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <Button onClick={handleSaveApiKey}>Connect</Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Get your API key from{" "}
              <a
                href="https://platform.composio.dev"
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline"
              >
                Composio Platform
              </a>
              {" → Settings → API Keys"}
            </p>
          </div>
        ) : (
          <>
            {/* Connected Status */}
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-green-500/20 flex items-center justify-center">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                </div>
                <div>
                  <div className="text-sm font-medium">API Key Connected</div>
                  <div className="text-xs text-muted-foreground">
                    {apiKey?.slice(0, 8)}...{apiKey?.slice(-4)}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={isLoading || isLoadingToolkits}
                  title="Refresh toolkits"
                >
                  <RefreshCw className={cn("h-4 w-4", (isLoading || isLoadingToolkits) && "animate-spin")} />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetMcp}
                  disabled={isLoading}
                  title="Reset MCP servers (removes old servers)"
                >
                  <AlertCircle className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={handleRemoveApiKey} title="Disconnect Composio">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="p-3 bg-destructive/10 text-destructive rounded-lg flex items-center gap-2 text-sm">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {error}
              </div>
            )}

            {/* Stats */}
            <div className="flex items-center gap-4">
              {toolkits.length > 0 && (
                <Badge variant="outline" className="text-xs">
                  {toolkits.length} available
                </Badge>
              )}
              {connectedCount > 0 && (
                <Badge variant="outline" className="text-xs">
                  {connectedCount} authenticated
                </Badge>
              )}
              {enabledCount > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {enabledCount} enabled
                </Badge>
              )}
            </div>

            {/* Toolkit Catalog */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium">Toolkit Catalog</h4>
                <span className="text-xs text-muted-foreground">
                  Toggle to enable, click to authenticate
                </span>
              </div>

              {/* Search Input */}
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search toolkits..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              {/* Loading State */}
              {isLoadingToolkits && toolkits.length === 0 && (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  Loading toolkits...
                </div>
              )}

              {/* Virtualized Toolkit List */}
              {sortedToolkits.length > 0 && (
                <div
                  ref={parentRef}
                  className="h-[400px] overflow-y-auto pr-1"
                >
                  <div
                    style={{
                      height: `${rowVirtualizer.getTotalSize()}px`,
                      width: "100%",
                      position: "relative",
                    }}
                  >
                    {rowVirtualizer.getVirtualItems().map((virtualItem) => {
                      const toolkit = sortedToolkits[virtualItem.index];
                      return (
                        <div
                          key={virtualItem.key}
                          style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: "100%",
                            height: `${virtualItem.size}px`,
                            transform: `translateY(${virtualItem.start}px)`,
                          }}
                          className="pb-2"
                        >
                          <ToolkitItem
                            toolkit={toolkit}
                            isConnecting={connectingToolkit === toolkit.key}
                            onToggle={handleToggle}
                            onAuthorize={handleAuthorize}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* No Results */}
              {!isLoadingToolkits && sortedToolkits.length === 0 && searchQuery && (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No toolkits found matching &quot;{searchQuery}&quot;
                </div>
              )}

              {/* Empty State */}
              {!isLoadingToolkits && toolkits.length === 0 && !searchQuery && (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  Click refresh to load available toolkits
                </div>
              )}
            </div>

            {/* Info */}
            <div className="text-xs text-muted-foreground space-y-1">
              <p>
                <strong>Enable:</strong> Adds toolkit to MCP Tools panel for use in chats
              </p>
              <p>
                <strong>Authenticate:</strong> Connect your account (click the link icon)
              </p>
            </div>
          </>
        )}

        {/* Dashboard Link */}
        <div className="pt-2 border-t">
          <a
            href="https://platform.composio.dev"
            target="_blank"
            rel="noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
          >
            Manage on Composio Platform
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>

      </CardContent>
    </Card>
  );
}
