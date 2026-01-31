"use client";

import { useState, useEffect, useCallback } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { formatDistanceToNow } from "date-fns";
import { Brain, Trash2, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { getSettings, updateSettings } from "@/lib/db/queries";
import {
    getAllMemories,
    addMemory,
    deleteMemory,
    clearMemoryCache,
    type MemoryItem,
} from "@/lib/memory";
import { useApiKeysStore } from "@/stores/api-keys-store";

export function MemorySettings() {
    const settings = useLiveQuery(() => getSettings());
    const { keys: apiKeys, addKey, removeKey, getKeyForProvider } = useApiKeysStore();

    // Use proper state for async API calls (not useLiveQuery)
    const [memories, setMemories] = useState<MemoryItem[]>([]);
    const [isLoadingMemories, setIsLoadingMemories] = useState(false);
    const [newMemory, setNewMemory] = useState("");
    const [isAdding, setIsAdding] = useState(false);
    const [userIdInput, setUserIdInput] = useState("");

    // Load memories on mount and when refreshed
    const loadMemories = useCallback(async () => {
        setIsLoadingMemories(true);
        try {
            const result = await getAllMemories();
            setMemories(result || []);
        } catch (error) {
            console.error("Failed to load memories:", error);
        } finally {
            setIsLoadingMemories(false);
        }
    }, []);

    // Load memories once on mount
    useEffect(() => {
        loadMemories();
    }, [loadMemories]);

    // Sync userIdInput with settings when settings load
    useEffect(() => {
        if (settings?.memoryUserId !== undefined) {
            setUserIdInput(settings.memoryUserId || "default-user");
        } else if (settings) {
            setUserIdInput("default-user");
        }
    }, [settings?.memoryUserId]);

    const handleToggleMemory = async (enabled: boolean) => {
        await updateSettings({ memoryEnabled: enabled });
        toast.success(enabled ? "Memory enabled" : "Memory disabled");
    };

    const handleAddMemory = async () => {
        if (!newMemory.trim()) return;

        setIsAdding(true);
        try {
            await addMemory(newMemory.trim());
            setNewMemory("");
            toast.success("Memory added/extracted");
            // Refresh the list after adding
            await loadMemories();
        } catch (error) {
            console.error(error);
            toast.error("Failed to add memory");
        } finally {
            setIsAdding(false);
        }
    };

    const handleDeleteMemory = async (id: string) => {
        try {
            await deleteMemory(id);
            // Optimistically remove from local state
            setMemories(prev => prev.filter(m => m.id !== id));
            toast.success("Memory deleted");
        } catch (error) {
            console.error(error);
            toast.error("Failed to delete memory");
            // Reload to restore state on error
            await loadMemories();
        }
    };

    const memoryEnabled = settings?.memoryEnabled ?? true;

    return (
        <div className="space-y-8">
            {/* Header with Master Toggle */}
            <div className="flex items-center justify-between p-4 border rounded-lg bg-card">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                        <Brain className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                        <h3 className="font-semibold">Memory</h3>
                        <p className="text-sm text-muted-foreground">
                            Lumina remembers information about you across all chats
                        </p>
                    </div>
                </div>
                <Switch
                    checked={memoryEnabled}
                    onCheckedChange={handleToggleMemory}
                />
            </div>

            {memoryEnabled && (
                <>
                    {/* Mem0 Configuration */}
                    <div className="space-y-4 p-4 border rounded-lg bg-card text-card-foreground shadow-sm">
                        <div className="flex items-center gap-2">
                            <h4 className="font-semibold">Mem0 Configuration</h4>
                            <Badge variant="secondary" className="text-xs">
                                Managed Service
                            </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            Lumina uses <strong>Mem0.ai</strong> for long-term memory. This managed service automatically handles extraction, deduplication, and retrieval.
                        </p>

                        <div className="space-y-3">
                            <div className="space-y-2">
                                <Label>Mem0 API Key</Label>
                                <div className="flex gap-2">
                                    <Input
                                        type="password"
                                        value={getKeyForProvider("mem0")?.key || ""}
                                        placeholder="m0-xxxxxxxxxxxxxxxxxxxxxxxx"
                                        autoComplete="off"
                                        data-1p-ignore
                                        data-lpignore="true"
                                        data-form-type="other"
                                        onChange={async (e) => {
                                            const key = e.target.value;
                                            const existingKey = getKeyForProvider("mem0");
                                            if (key) {
                                                if (existingKey) {
                                                    // Remove old key first, then add new one
                                                    await removeKey(existingKey.id);
                                                }
                                                await addKey("mem0", key);
                                                // Reset cache/invalid state so we retry with the new key
                                                clearMemoryCache();
                                                // Initialize Mem0 user by adding a seed memory
                                                // This prevents "User not found" errors on first search
                                                try {
                                                    await addMemory("Lumina memory system initialized.");
                                                    toast.success("Mem0 connected successfully!");
                                                } catch (initError) {
                                                    console.error("Failed to initialize Mem0 user:", initError);
                                                    // Don't show error toast - the key is saved, initialization might fail for valid keys on existing users
                                                }
                                            } else if (existingKey) {
                                                await removeKey(existingKey.id);
                                                clearMemoryCache();
                                            }
                                        }}
                                    />
                                    <Button
                                        variant="outline"
                                        onClick={() => window.open("https://app.mem0.ai/dashboard/api-keys", "_blank")}
                                    >
                                        Get Key
                                    </Button>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    The Free Tier provides 10,000 memories, which is enough for years of typical usage. Manage all API keys in Settings → API Keys.
                                </p>
                            </div>

                            {/* User ID Setting */}
                            <div className="space-y-2 pt-3 border-t">
                                <Label>User ID</Label>
                                <Input
                                    type="text"
                                    value={userIdInput}
                                    placeholder="default-user"
                                    onChange={(e) => setUserIdInput(e.target.value)}
                                    onBlur={async (e) => {
                                        const value = e.target.value.trim() || "default-user";
                                        const currentValue = settings?.memoryUserId || "default-user";
                                        if (value !== currentValue) {
                                            await updateSettings({ memoryUserId: value });
                                            clearMemoryCache();
                                            toast.success("User ID updated");
                                            await loadMemories();
                                        }
                                    }}
                                />
                                <p className="text-xs text-muted-foreground">
                                    The user identifier for Mem0. Change this to sync memories across devices or use different memory profiles.
                                </p>
                            </div>

                            {/* Auto-Extract Toggle */}
                            <div className="flex items-center justify-between pt-3 border-t">
                                <div>
                                    <Label>Auto-learn from conversations</Label>
                                    <p className="text-xs text-muted-foreground">
                                        Automatically extract and save key facts from your chats
                                    </p>
                                </div>
                                <Switch
                                    checked={settings?.memoryAutoExtract ?? true}
                                    onCheckedChange={async (checked) => {
                                        await updateSettings({ memoryAutoExtract: checked });
                                        toast.success(checked ? "Auto-learning enabled" : "Auto-learning disabled");
                                    }}
                                />
                            </div>

                            {/* Memory Decay */}
                            <div className="flex items-center justify-between pt-3 border-t">
                                <div>
                                    <Label>Memory decay</Label>
                                    <p className="text-xs text-muted-foreground">
                                        Gradually forget old memories that haven&apos;t been reinforced
                                    </p>
                                </div>
                                <Switch
                                    checked={settings?.memoryDecayEnabled ?? false}
                                    onCheckedChange={async (checked) => {
                                        await updateSettings({ memoryDecayEnabled: checked });
                                        toast.success(checked ? "Memory decay enabled" : "Memory decay disabled");
                                    }}
                                />
                            </div>

                            {(settings?.memoryDecayEnabled) && (
                                <div className="flex items-center justify-between pl-4">
                                    <div>
                                        <Label>Decay after</Label>
                                        <p className="text-xs text-muted-foreground">
                                            Memories untouched for this long get pruned (max 3/day, only when &gt;20 total)
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Input
                                            type="number"
                                            min={14}
                                            max={365}
                                            className="w-20 h-8 text-sm"
                                            value={settings?.memoryDecayDays ?? 60}
                                            onChange={async (e) => {
                                                const value = Math.max(14, Math.min(365, parseInt(e.target.value) || 60));
                                                await updateSettings({ memoryDecayDays: value });
                                            }}
                                        />
                                        <span className="text-sm text-muted-foreground">days</span>
                                    </div>
                                </div>
                            )}

                            {/* Cache TTL Setting */}
                            <div className="flex items-center justify-between pt-3 border-t">
                                <div>
                                    <Label>Cache Duration</Label>
                                    <p className="text-xs text-muted-foreground">
                                        How long to cache memory results (reduces API calls)
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Input
                                        type="number"
                                        min={5}
                                        max={300}
                                        className="w-20 h-8 text-sm"
                                        value={settings?.memoryCacheTTL ?? 30}
                                        onChange={async (e) => {
                                            const value = Math.max(5, Math.min(300, parseInt(e.target.value) || 30));
                                            await updateSettings({ memoryCacheTTL: value });
                                        }}
                                    />
                                    <span className="text-sm text-muted-foreground">seconds</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Memory List */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h4 className="font-semibold">
                                Stored Memories ({memories?.length || 0})
                            </h4>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={loadMemories}
                                disabled={isLoadingMemories}
                            >
                                <RefreshCw className={`h-4 w-4 mr-2 ${isLoadingMemories ? 'animate-spin' : ''}`} />
                                Refresh
                            </Button>
                        </div>

                        {!memories || memories.length === 0 ? (
                            <div className="text-center py-12 text-muted-foreground border rounded-lg border-dashed">
                                <Brain className="h-10 w-10 mx-auto mb-3 opacity-30" />
                                <p className="font-medium">No memories yet</p>
                                <p className="text-sm mt-1">
                                    Start chatting and Lumina will learn about you!
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                                {memories.map((memory: any) => (
                                    <div
                                        key={memory.id}
                                        className="flex items-start gap-3 p-3 border rounded-lg group hover:bg-accent/50 transition-colors"
                                    >
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm">{memory.memory}</p>
                                            <p className="text-xs text-muted-foreground mt-1">
                                                {memory.updated_at ? formatDistanceToNow(new Date(memory.updated_at), { addSuffix: true }) : "Just now"}
                                            </p>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="opacity-0 group-hover:opacity-100 h-8 w-8 shrink-0"
                                            onClick={() => handleDeleteMemory(memory.id)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Add Manual Memory */}
                    <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
                        <Label>Add Memory Manually</Label>
                        <div className="flex gap-2">
                            <Input
                                placeholder="e.g., I prefer TypeScript over JavaScript..."
                                value={newMemory}
                                onChange={(e) => setNewMemory(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && handleAddMemory()}
                                className="flex-1"
                            />
                            <Button onClick={handleAddMemory} disabled={!newMemory.trim() || isAdding}>
                                <Plus className="h-4 w-4 mr-2" />
                                Add
                            </Button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
