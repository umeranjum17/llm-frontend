"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogContent as DialogContentBase,
} from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Settings2, Plus, Trash2, Save, UserCircle } from "lucide-react";
import { useModelSettingsStore } from "@/stores/model-settings-store";
import { toast } from "sonner";

export function ParameterPresets() {
    const {
        presets,
        currentSettings,
        updateSettings,
        setSystemPrompt,
        addPreset,
        removePreset
    } = useModelSettingsStore();

    const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
    const [newPresetName, setNewPresetName] = useState("");
    const [newSystemPrompt, setNewSystemPrompt] = useState(currentSettings.systemPrompt || "");

    const handleApplyPreset = (settings: any) => {
        updateSettings(settings);
        toast.success("Preset applied (params + persona)");
    };

    const handleOpenSaveDialog = () => {
        setNewSystemPrompt(currentSettings.systemPrompt || "");
        setIsSaveDialogOpen(true);
    };

    const handleSavePreset = () => {
        if (!newPresetName.trim()) return;

        // Update current settings with the prompt from the dialog before saving
        const finalSettings = { ...currentSettings, systemPrompt: newSystemPrompt };
        addPreset(newPresetName, finalSettings);

        setNewPresetName("");
        setIsSaveDialogOpen(false);
        toast.success("Preset saved successfully");
    };

    return (
        <div className="flex items-center gap-2">
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 gap-2">
                        <Settings2 className="h-3.5 w-3.5" />
                        <span className="text-xs">Presets / Personas</span>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                        Select Persona / Preset
                    </div>
                    {presets.map((preset) => (
                        <DropdownMenuItem
                            key={preset.id}
                            onClick={() => handleApplyPreset(preset.settings)}
                            className="flex items-center justify-between"
                        >
                            <div className="flex flex-col min-w-0">
                                <span className="truncate">{preset.name}</span>
                                {preset.settings.systemPrompt && (
                                    <span className="text-[10px] text-muted-foreground truncate max-w-[150px]">
                                        {preset.settings.systemPrompt.slice(0, 30)}...
                                    </span>
                                )}
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 ml-2 opacity-0 group-hover:opacity-100 hover:text-destructive"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    removePreset(preset.id);
                                    toast.success("Preset removed");
                                }}
                            >
                                <Trash2 className="h-3 w-3" />
                            </Button>
                        </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={(e) => {
                        e.preventDefault();
                        handleOpenSaveDialog();
                    }}>
                        <Plus className="mr-2 h-4 w-4" />
                        <span>Save Current as Preset</span>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <Dialog open={isSaveDialogOpen} onOpenChange={setIsSaveDialogOpen}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>Save Persona & Parameters</DialogTitle>
                        <DialogDescription>
                            Save your current model settings and system instructions as a reusable persona.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="name">Name</Label>
                            <Input
                                id="name"
                                value={newPresetName}
                                onChange={(e) => setNewPresetName(e.target.value)}
                                placeholder="e.g. 'Senior React Dev', 'Copywriter'"
                            />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="prompt">System Prompt (Persona Instructions)</Label>
                            <Textarea
                                id="prompt"
                                value={newSystemPrompt}
                                onChange={(e) => setNewSystemPrompt(e.target.value)}
                                placeholder="You are an expert at..."
                                className="h-32 resize-none"
                            />
                            <p className="text-[10px] text-muted-foreground">
                                These instructions will be sent with every message to define the model&apos;s behavior.
                            </p>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsSaveDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleSavePreset} disabled={!newPresetName.trim()}>
                            <Save className="mr-2 h-4 w-4" />
                            Save Preset
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
