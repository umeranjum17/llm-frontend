"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Plug, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { availableConnectors } from "@/lib/connectors/registry";
import { Connector } from "@/lib/connectors/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function ConnectorsSettings() {
    const [connectors, setConnectors] = useState<Connector[]>(availableConnectors);
    const [statuses, setStatuses] = useState<Record<string, boolean>>({});
    const [loading, setLoading] = useState<Record<string, boolean>>({});

    useEffect(() => {
        // Initial check
        const checkStatuses = async () => {
            const newStatuses: Record<string, boolean> = {};
            for (const c of connectors) {
                newStatuses[c.id] = await c.isConnected();
            }
            setStatuses(newStatuses);
        };
        checkStatuses();
    }, [connectors]);

    const handleToggle = async (connector: Connector) => {
        setLoading((prev) => ({ ...prev, [connector.id]: true }));
        const isConnected = statuses[connector.id];

        try {
            if (isConnected) {
                await connector.disconnect();
                setStatuses((prev) => ({ ...prev, [connector.id]: false }));
                toast.success(`Disconnected from ${connector.name}`);
            } else {
                await connector.connect();
                setStatuses((prev) => ({ ...prev, [connector.id]: true }));
                toast.success(`Connected to ${connector.name}`);
            }
        } catch (error) {
            toast.error(`Failed to ${isConnected ? "disconnect" : "connect"} ${connector.name}`);
        } finally {
            setLoading((prev) => ({ ...prev, [connector.id]: false }));
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium">Connectors</h3>
                <p className="text-sm text-muted-foreground">
                    Connect your data sources to give agents access to your documents and knowledge.
                </p>
            </div>

            <div className="grid gap-4">
                {connectors.map((connector) => {
                    const isConnected = statuses[connector.id];
                    const isLoading = loading[connector.id];

                    return (
                        <div
                            key={connector.id}
                            className="flex items-center justify-between rounded-xl border bg-card p-4 transition-all hover:bg-accent/5"
                        >
                            <div className="flex items-center gap-4">
                                <div className={cn(
                                    "flex h-12 w-12 items-center justify-center rounded-lg border bg-background",
                                    isConnected ? "border-primary/20 bg-primary/5" : "border-muted"
                                )}>
                                    {/* We can dynamically render Lucide icon here if we map string to component */}
                                    <Plug className={cn("h-6 w-6", isConnected ? "text-primary" : "text-muted-foreground")} />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h4 className="font-medium">{connector.name}</h4>
                                        {isConnected && (
                                            <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 text-[10px] h-5 px-1.5 gap-0.5">
                                                <Check className="h-3 w-3" /> Connected
                                            </Badge>
                                        )}
                                    </div>
                                    <p className="text-sm text-muted-foreground max-w-[300px] truncate">
                                        {connector.description}
                                    </p>
                                </div>
                            </div>

                            <Button
                                variant={isConnected ? "outline" : "default"}
                                size="sm"
                                onClick={() => handleToggle(connector)}
                                disabled={isLoading}
                                className={cn(isConnected && "hover:bg-destructive hover:text-destructive-foreground hover:border-destructive")}
                            >
                                {isLoading ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : isConnected ? (
                                    "Disconnect"
                                ) : (
                                    "Connect"
                                )}
                            </Button>
                        </div>
                    );
                })}
            </div>

            <div className="rounded-lg border border-dashed p-8 text-center bg-muted/20">
                <p className="text-sm text-muted-foreground">
                    More connectors coming soon (Google Drive, GitHub, Slack)...
                </p>
            </div>
        </div>
    );
}
