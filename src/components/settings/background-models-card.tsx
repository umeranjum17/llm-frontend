"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Sparkles, Tag, Brain, MessageSquare, FileText, Save, Info } from "lucide-react";
import { useSettingsStore } from "@/stores/settings-store";
import { toast } from "sonner";
import { getSettings, updateSettings } from "@/lib/db/queries";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/schema";
import { useModelsStore } from "@/stores/models-store";
import { MODELS } from "@/lib/constants/models";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

interface BackgroundModel {
    id: string;
    label: string;
    description: string;
    icon: React.ElementType;
    settingKey: "titleModelId" | "taggingModelId" | "memoryModelId" | "summaryModelId";
    defaultModel: string;
}

const BACKGROUND_MODELS: BackgroundModel[] = [
    {
        id: "title",
        label: "Title Generation",
        description: "Model used to generate chat titles automatically",
        icon: FileText,
        settingKey: "titleModelId",
        defaultModel: "openai/gpt-4o-mini",
    },
    {
        id: "tagging",
        label: "Auto-Tagging",
        description: "Model used to generate tags for chats",
        icon: Tag,
        settingKey: "taggingModelId",
        defaultModel: "openai/gpt-4o-mini",
    },
    {
        id: "memory",
        label: "Memory Extraction",
        description: "Model used to extract facts and preferences",
        icon: Brain,
        settingKey: "memoryModelId",
        defaultModel: "openai/gpt-4o-mini",
    },
    {
        id: "summary",
        label: "Summarization",
        description: "Model used to generate chat summaries",
        icon: MessageSquare,
        settingKey: "summaryModelId",
        defaultModel: "openai/gpt-4o-mini",
    },
];

// Recommended fast/cheap models for background tasks
const RECOMMENDED_MODELS = [
    "openai/gpt-4o-mini",
    "anthropic/claude-3-haiku-20240307",
    "google/gemini-flash-1.5",
    "meta-llama/llama-3.1-8b-instruct",
];

export function BackgroundModelsCard() {
    const settings = useLiveQuery(() => getSettings());
    const { models } = useModelsStore();
    const { autoTaggingEnabled, updateAutoTagging } = useSettingsStore();
    const [localSettings, setLocalSettings] = useState<Record<string, string>>({});
    const [hasChanges, setHasChanges] = useState(false);

    // Use fetched models or fall back to constants
    const allModels = models.length > 0 ? models : MODELS;

    // Filter to fast/cheap models suitable for background tasks
    const availableModels = useMemo(() => {
        // Include recommended models and any model with "mini", "haiku", "flash", or "instant" in the name
        return allModels.filter(m =>
            RECOMMENDED_MODELS.includes(m.id) ||
            m.id.toLowerCase().includes("mini") ||
            m.id.toLowerCase().includes("haiku") ||
            m.id.toLowerCase().includes("flash") ||
            m.id.toLowerCase().includes("instant") ||
            m.id.toLowerCase().includes("8b")
        ).slice(0, 20); // Limit to 20 for performance
    }, [allModels]);

    useEffect(() => {
        if (settings) {
            const settingsMap: Record<string, string> = {};
            BACKGROUND_MODELS.forEach(bg => {
                settingsMap[bg.settingKey] = (settings as any)[bg.settingKey] || bg.defaultModel;
            });
            setLocalSettings(settingsMap);
        }
    }, [settings]);

    const handleModelChange = (settingKey: string, modelId: string) => {
        setLocalSettings(prev => ({ ...prev, [settingKey]: modelId }));
        setHasChanges(true);
    };

    const handleSave = async () => {
        try {
            await updateSettings(localSettings);
            setHasChanges(false);
            toast.success("Background model settings saved");
        } catch (error) {
            toast.error("Failed to save settings");
        }
    };

    const getModelName = (modelId: string) => {
        const model = allModels.find(m => m.id === modelId);
        if (model) return model.name;
        // Extract a friendly name from the model ID
        const parts = modelId.split("/");
        return parts[parts.length - 1] || modelId;
    };

    return (
        <Card>
            <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-primary" />
                        <CardTitle className="text-lg">Background Models</CardTitle>
                    </div>
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6">
                                    <Info className="h-4 w-4 text-muted-foreground" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="max-w-[280px]">
                                <p className="text-xs">
                                    These models run in the background to enhance your chat experience.
                                    Choose fast, cheap models for optimal performance.
                                </p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
                <CardDescription>
                    Configure which models power automatic features
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {BACKGROUND_MODELS.map((bg) => {
                    const Icon = bg.icon;
                    const currentModel = localSettings[bg.settingKey] || bg.defaultModel;
                    const isTagging = bg.id === "tagging";
                    const isDisabled = isTagging && !autoTaggingEnabled;

                    return (
                        <div key={bg.id} className="flex items-center gap-4">
                            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted ${isDisabled ? "opacity-50" : ""}`}>
                                <Icon className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div className={`flex-1 min-w-0 ${isDisabled ? "opacity-50" : ""}`}>
                                <div className="flex items-center gap-2">
                                    <Label className="text-sm font-medium">{bg.label}</Label>
                                    {!isDisabled && (
                                        <Badge variant="outline" className="text-[10px] h-4">
                                            {getModelName(currentModel)}
                                        </Badge>
                                    )}
                                    {isTagging && !autoTaggingEnabled && (
                                        <Badge variant="secondary" className="text-[10px] h-4">
                                            Disabled
                                        </Badge>
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground truncate">
                                    {bg.description}
                                </p>
                            </div>
                            {isTagging && (
                                <Switch
                                    checked={autoTaggingEnabled}
                                    onCheckedChange={updateAutoTagging}
                                />
                            )}
                            <Select
                                value={currentModel}
                                onValueChange={(v) => handleModelChange(bg.settingKey, v)}
                                disabled={isDisabled}
                            >
                                <SelectTrigger className={`w-[200px] h-8 text-xs ${isDisabled ? "opacity-50" : ""}`}>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableModels.map((model) => (
                                        <SelectItem key={model.id} value={model.id} className="text-xs">
                                            {model.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    );
                })}

                {hasChanges && (
                    <div className="flex justify-end pt-2 border-t">
                        <Button onClick={handleSave} size="sm" className="gap-2">
                            <Save className="h-3.5 w-3.5" />
                            Save Changes
                        </Button>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
