"use client";

import { useState, useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { formatDistanceToNow } from "date-fns";
import { Brain, Trash2, Plus, Settings2, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { getSettings, updateSettings } from "@/lib/db/queries";
import {
    getAllMemories,
    addMemoryManual,
    deleteMemory,
    deleteAllMemories,
    getMemoryStats,
    syncMemoriesToVectorStore,
} from "@/lib/memory";
import type { UserMemory } from "@/lib/db/schema";

const CATEGORY_COLORS: Record<string, string> = {
    fact: "bg-blue-500/10 text-blue-500 border-blue-500/30",
    preference: "bg-purple-500/10 text-purple-500 border-purple-500/30",
    project: "bg-green-500/10 text-green-500 border-green-500/30",
    skill: "bg-orange-500/10 text-orange-500 border-orange-500/30",
    other: "bg-gray-500/10 text-gray-500 border-gray-500/30",
};

const AVAILABLE_MODELS = [
    { id: "openai/gpt-4o-mini", name: "GPT-4o Mini (Cheapest)" },
    { id: "openai/gpt-4o", name: "GPT-4o (Best Quality)" },
    { id: "anthropic/claude-3-haiku", name: "Claude 3 Haiku (Fast)" },
    { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet (Best)" },
    { id: "google/gemini-flash-1.5", name: "Gemini Flash 1.5 (Fast)" },
];

const RETENTION_OPTIONS = [
    { value: "forever", label: "Forever", days: null },
    { value: "365", label: "1 Year", days: 365 },
    { value: "180", label: "6 Months", days: 180 },
    { value: "90", label: "3 Months", days: 90 },
    { value: "30", label: "1 Month", days: 30 },
];

const CATEGORY_OPTIONS: { value: UserMemory["category"]; label: string }[] = [
    { value: "fact", label: "Fact" },
    { value: "skill", label: "Skill" },
    { value: "project", label: "Project" },
    { value: "preference", label: "Preference" },
    { value: "other", label: "Other" },
];

export function MemorySettings() {
    const settings = useLiveQuery(() => getSettings());
    const memories = useLiveQuery(() => getAllMemories());
    const stats = useLiveQuery(() => getMemoryStats());

    const [newMemory, setNewMemory] = useState("");
    const [newCategory, setNewCategory] = useState<UserMemory["category"]>("fact");
    const [isAdding, setIsAdding] = useState(false);

    const handleToggleMemory = async (enabled: boolean) => {
        await updateSettings({ memoryEnabled: enabled });
        toast.success(enabled ? "Memory enabled" : "Memory disabled");
    };

    const handleToggleAutoExtract = async (enabled: boolean) => {
        await updateSettings({ memoryAutoExtract: enabled });
        toast.success(enabled ? "Auto-learning enabled" : "Auto-learning disabled");
    };

    const handleModelChange = async (modelId: string) => {
        await updateSettings({ memoryModelId: modelId });
        toast.success("Extraction model updated");
    };

    const handleRetentionChange = async (value: string) => {
        const days = value === "forever" ? undefined : parseInt(value);
        await updateSettings({ memoryRetentionDays: days });
        toast.success("Retention period updated");
    };

    const handleAddMemory = async () => {
        if (!newMemory.trim()) return;

        setIsAdding(true);
        try {
            await addMemoryManual(newMemory.trim(), newCategory);
            setNewMemory("");
            toast.success("Memory added");
        } catch (error) {
            toast.error("Failed to add memory");
        } finally {
            setIsAdding(false);
        }
    };

    const handleDeleteMemory = async (id: string) => {
        await deleteMemory(id);
        toast.success("Memory deleted");
    };

    const handleClearAll = async () => {
        if (confirm("Are you sure you want to delete all memories? This cannot be undone.")) {
            await deleteAllMemories();
            toast.success("All memories cleared");
        }
    };

    const handleReindex = async () => {
        toast.promise(syncMemoriesToVectorStore(), {
            loading: "Re-indexing memories...",
            success: (count) => `Re-indexed ${count} memories`,
            error: "Failed to re-index memories",
        });
    };

    const memoryEnabled = settings?.memoryEnabled ?? true;
    const autoExtract = settings?.memoryAutoExtract ?? true;
    const currentModel = settings?.memoryModelId || "gpt-4o-mini";
    const currentRetention = settings?.memoryRetentionDays
        ? String(settings.memoryRetentionDays)
        : "forever";

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
                    {/* Stats */}
                    {stats && stats.total > 0 && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="p-3 border rounded-lg text-center">
                                <p className="text-2xl font-bold">{stats.total}</p>
                                <p className="text-xs text-muted-foreground">Total Memories</p>
                            </div>
                            <div className="p-3 border rounded-lg text-center">
                                <p className="text-2xl font-bold">{stats.active}</p>
                                <p className="text-xs text-muted-foreground">Active</p>
                            </div>
                            <div className="p-3 border rounded-lg text-center">
                                <p className="text-2xl font-bold">{stats.bySource?.auto || 0}</p>
                                <p className="text-xs text-muted-foreground">Auto-Learned</p>
                            </div>
                            <div className="p-3 border rounded-lg text-center">
                                <p className="text-2xl font-bold">{stats.bySource?.manual || 0}</p>
                                <p className="text-xs text-muted-foreground">Manual</p>
                            </div>
                        </div>
                    )}

                    {/* Settings Grid */}
                    <div className="grid gap-4 md:grid-cols-2">
                        {/* Extraction Model */}
                        <div className="space-y-2">
                            <Label>Extraction Model</Label>
                            <p className="text-xs text-muted-foreground">
                                Which model extracts memories from your conversations
                            </p>
                            <Select value={currentModel} onValueChange={handleModelChange}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select model" />
                                </SelectTrigger>
                                <SelectContent>
                                    {AVAILABLE_MODELS.map((m) => (
                                        <SelectItem key={m.id} value={m.id}>
                                            {m.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Retention Period */}
                        <div className="space-y-2">
                            <Label>Retention Period</Label>
                            <p className="text-xs text-muted-foreground">
                                How long to keep memories before auto-deleting
                            </p>
                            <Select value={currentRetention} onValueChange={handleRetentionChange}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {RETENTION_OPTIONS.map((opt) => (
                                        <SelectItem key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Auto-Extract Toggle */}
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                        <div>
                            <p className="font-medium">Auto-Learn</p>
                            <p className="text-xs text-muted-foreground">
                                Automatically extract key facts from your conversations
                            </p>
                        </div>
                        <Switch
                            checked={autoExtract}
                            onCheckedChange={handleToggleAutoExtract}
                        />
                    </div>

                    {/* Memory List */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h4 className="font-semibold">
                                Stored Memories ({memories?.length || 0})
                            </h4>
                            {memories && memories.length > 0 && (
                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleReindex}
                                        title="Re-index for search"
                                    >
                                        <RefreshCcw className="h-4 w-4 mr-2" />
                                        Re-index
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleClearAll}
                                        className="text-destructive hover:text-destructive"
                                    >
                                        <Trash2 className="h-4 w-4 mr-2" />
                                        Clear All
                                    </Button>
                                </div>
                            )}
                        </div>

                        {!memories || memories.length === 0 ? (
                            <div className="text-center py-12 text-muted-foreground border rounded-lg border-dashed">
                                <Brain className="h-10 w-10 mx-auto mb-3 opacity-30" />
                                <p className="font-medium">No memories yet</p>
                                <p className="text-sm mt-1">
                                    Start chatting and Lumina will learn about you!
                                </p>
                                <p className="text-xs mt-2 opacity-70">
                                    Or add memories manually below
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                                {memories.map((memory) => (
                                    <div
                                        key={memory.id}
                                        className="flex items-start gap-3 p-3 border rounded-lg group hover:bg-accent/50 transition-colors"
                                    >
                                        <Badge
                                            variant="outline"
                                            className={`text-xs shrink-0 ${CATEGORY_COLORS[memory.category]}`}
                                        >
                                            {memory.category}
                                        </Badge>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm">{memory.content}</p>
                                            <p className="text-xs text-muted-foreground mt-1">
                                                {memory.source === "auto" ? "🤖 Learned" : "✍️ Manual"} •{" "}
                                                {formatDistanceToNow(memory.createdAt, { addSuffix: true })}
                                                {memory.confidence < 1 && (
                                                    <span className="ml-2 opacity-70">
                                                        {Math.round(memory.confidence * 100)}% confidence
                                                    </span>
                                                )}
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
                            <Select
                                value={newCategory}
                                onValueChange={(v) => setNewCategory(v as UserMemory["category"])}
                            >
                                <SelectTrigger className="w-[120px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {CATEGORY_OPTIONS.map((opt) => (
                                        <SelectItem key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
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
