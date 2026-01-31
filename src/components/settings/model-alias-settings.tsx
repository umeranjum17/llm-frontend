"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getAllModelAliases, updateModelAlias, deleteModelAlias } from "@/lib/db/queries";
import { MODELS, getModelById } from "@/lib/constants/models";
import { useModelsStore } from "@/stores/models-store";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, Plus, ArrowRight, Settings2, Info } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import type { ModelAlias } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

export function ModelAliasSettings() {
    const aliases = useLiveQuery(() => getAllModelAliases(), []);
    const customModels = useModelsStore((s) => s.models);
    const allModels = customModels.length > 0 ? customModels : MODELS;

    const [selectedModelId, setSelectedModelId] = useState("");
    const [newAlias, setNewAlias] = useState("");
    const [newSystemPrompt, setNewSystemPrompt] = useState("");

    const handleAdd = async () => {
        if (!selectedModelId || !newAlias) {
            toast.error("Please select a model and provide an alias");
            return;
        }

        try {
            await updateModelAlias(selectedModelId, newAlias, newSystemPrompt);
            toast.success("Model alias saved");
            setSelectedModelId("");
            setNewAlias("");
            setNewSystemPrompt("");
        } catch (error) {
            toast.error("Failed to save alias");
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await deleteModelAlias(id);
            toast.success("Alias removed");
        } catch (error) {
            toast.error("Failed to remove alias");
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium">Model Aliases & Prompts</h3>
                <p className="text-sm text-muted-foreground">
                    Customize how models appear in the UI and set default system prompts per model.
                </p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-sm font-medium">Create New Alias</CardTitle>
                    <CardDescription className="text-xs">
                        Override a model&apos;s display name or system prompt.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground">Model</label>
                            <Select value={selectedModelId} onValueChange={setSelectedModelId}>
                                <SelectTrigger className="h-9">
                                    <SelectValue placeholder="Select a model..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {allModels.map((m) => (
                                        <SelectItem key={m.id} value={m.id}>
                                            {m.name} ({m.provider})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-muted-foreground">Custom Name (Alias)</label>
                            <Input
                                value={newAlias}
                                onChange={(e) => setNewAlias(e.target.value)}
                                placeholder="e.g. My Coding Assistant"
                                className="h-9"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-medium text-muted-foreground">Default System Prompt (Optional)</label>
                        <Textarea
                            value={newSystemPrompt}
                            onChange={(e) => setNewSystemPrompt(e.target.value)}
                            placeholder="Instructions to always include for this model..."
                            className="min-h-[100px] text-sm resize-none"
                        />
                    </div>

                    <Button onClick={handleAdd} className="w-full gap-2">
                        <Plus className="h-4 w-4" />
                        Save Model Configuration
                    </Button>
                </CardContent>
            </Card>

            <div className="space-y-4">
                <h4 className="text-sm font-medium flex items-center gap-2">
                    <Settings2 className="h-4 w-4" />
                    Configured Aliases
                </h4>

                {aliases && aliases.length > 0 ? (
                    <div className="grid grid-cols-1 gap-4">
                        {aliases.map((item: ModelAlias) => {
                            const originalModel = getModelById(item.id) || allModels.find(m => m.id === item.id);
                            return (
                                <Card key={item.id} className="border-border/50 overflow-hidden">
                                    <div className="p-4 flex items-start justify-between gap-4">
                                        <div className="space-y-1 flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-primary">{item.alias}</span>
                                                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                                <span className="text-xs text-muted-foreground truncate">{originalModel?.name || item.id}</span>
                                            </div>
                                            {item.systemPrompt && (
                                                <div className="mt-2 text-xs text-muted-foreground bg-muted/30 p-2 rounded border border-border/30 line-clamp-2 italic">
                                                    &quot;{item.systemPrompt}&quot;
                                                </div>
                                            )}
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleDelete(item.id)}
                                            className="text-muted-foreground hover:text-destructive shrink-0"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </Card>
                            );
                        })}
                    </div>
                ) : (
                    <div className="text-center py-12 border rounded-lg border-dashed bg-muted/10">
                        <Info className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
                        <p className="text-sm text-muted-foreground">No model aliases configured yet.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
