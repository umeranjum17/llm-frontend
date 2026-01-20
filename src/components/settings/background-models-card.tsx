"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Sparkles, Tag, Brain, MessageSquare, FileText, Save, Info } from "lucide-react";
import { useSettingsStore } from "@/stores/settings-store";
import { toast } from "sonner";
import { getSettings, updateSettings } from "@/lib/db/queries";
import { useLiveQuery } from "dexie-react-hooks";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { CheapModelSelector } from "@/components/model-picker/model-selector";
import { useAvailableModels } from "@/hooks/use-available-models";

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
        defaultModel: "openai/gpt-5-nano", // $0.05/$0.40 - ultra cheap, great for classification
    },
    {
        id: "tagging",
        label: "Auto-Tagging",
        description: "Model used to generate tags for chats",
        icon: Tag,
        settingKey: "taggingModelId",
        defaultModel: "openai/gpt-5-nano", // $0.05/$0.40 - perfect for tagging/classification
    },
    {
        id: "memory",
        label: "Memory Extraction",
        description: "Model used to extract facts and preferences",
        icon: Brain,
        settingKey: "memoryModelId",
        defaultModel: "openai/gpt-5-nano", // $0.05/$0.40 - 3x cheaper, excellent at extraction
    },
    {
        id: "summary",
        label: "Summarization",
        description: "Model used to generate chat summaries",
        icon: MessageSquare,
        settingKey: "summaryModelId",
        defaultModel: "openai/gpt-5-nano", // $0.05/$0.40 - excels at summarization
    },
];

export function BackgroundModelsCard() {
    const settings = useLiveQuery(() => getSettings());
    const { autoTaggingEnabled, updateAutoTagging } = useSettingsStore();
    const [localSettings, setLocalSettings] = useState<Record<string, string>>({});
    const [hasChanges, setHasChanges] = useState(false);

    // Use centralized hook for models
    const { models: allModels } = useAvailableModels({ maxCost: 10, includeLegacy: true });

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

    return (
        <Card>
            <CardHeader className="pb-3 sm:pb-4 px-3 sm:px-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                        <CardTitle className="text-base sm:text-lg">Background Models</CardTitle>
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
                <CardDescription className="text-xs sm:text-sm">
                    Configure which models power automatic features
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 sm:space-y-4 px-3 sm:px-6">
                {BACKGROUND_MODELS.map((bg) => {
                    const Icon = bg.icon;
                    const currentModel = localSettings[bg.settingKey] || bg.defaultModel;
                    const isTagging = bg.id === "tagging";
                    const isDisabled = isTagging && !autoTaggingEnabled;

                    return (
                        <div key={bg.id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                            <div className="flex items-center gap-3 sm:gap-4">
                                <div className={`flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg bg-muted ${isDisabled ? "opacity-50" : ""}`}>
                                    <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
                                </div>
                                <div className={`flex-1 min-w-0 ${isDisabled ? "opacity-50" : ""}`}>
                                    <div className="flex items-center gap-2">
                                        <Label className="text-xs sm:text-sm font-medium">{bg.label}</Label>
                                        {isTagging && !autoTaggingEnabled && (
                                            <Badge variant="secondary" className="text-[10px] h-4">
                                                Disabled
                                            </Badge>
                                        )}
                                    </div>
                                    <p className="text-[10px] sm:text-xs text-muted-foreground truncate hidden sm:block">
                                        {bg.description}
                                    </p>
                                </div>
                                {isTagging && (
                                    <Switch
                                        checked={autoTaggingEnabled}
                                        onCheckedChange={updateAutoTagging}
                                        className="sm:hidden"
                                    />
                                )}
                            </div>
                            <div className="flex items-center gap-2 pl-11 sm:pl-0 sm:ml-auto">
                                {isTagging && (
                                    <Switch
                                        checked={autoTaggingEnabled}
                                        onCheckedChange={updateAutoTagging}
                                        className="hidden sm:flex"
                                    />
                                )}
                                <div className={`w-full sm:w-[220px] ${isDisabled ? "opacity-50 pointer-events-none" : ""}`}>
                                    <CheapModelSelector
                                        value={currentModel}
                                        onValueChange={(v) => handleModelChange(bg.settingKey, v)}
                                        disabled={isDisabled}
                                        placeholder="Select model..."
                                        compact
                                    />
                                </div>
                            </div>
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
