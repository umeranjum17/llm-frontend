"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash, GripVertical, ArrowDown } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { getAllAgents, addWorkflow } from "@/lib/db/queries";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

interface WorkflowStep {
    id: string;
    agentId: string;
    instruction: string;
}

interface WorkflowEditorDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    // onSave: (workflow: any) => void; // We'll implement saving logic later
}

export function WorkflowEditorDialog({ open, onOpenChange }: WorkflowEditorDialogProps) {
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [steps, setSteps] = useState<WorkflowStep[]>([
        { id: "1", agentId: "", instruction: "" }
    ]);

    const agents = useLiveQuery(() => getAllAgents(), []);

    const addStep = () => {
        setSteps([...steps, { id: crypto.randomUUID(), agentId: "", instruction: "" }]);
    };

    const removeStep = (id: string) => {
        if (steps.length === 1) return;
        setSteps(steps.filter(s => s.id !== id));
    };

    const updateStep = (id: string, field: keyof WorkflowStep, value: string) => {
        setSteps(steps.map(s => s.id === id ? { ...s, [field]: value } : s));
    };

    // ...

    const handleSave = async () => {
        try {
            if (!name) return;

            await addWorkflow({
                name,
                description,
                steps // Dexie handles array storage
            });

            toast.success("Workflow saved");
            onOpenChange(false);
            // Reset form
            setName("");
            setDescription("");
            setSteps([{ id: crypto.randomUUID(), agentId: "", instruction: "" }]);
        } catch (error) {
            console.error("Failed to save workflow:", error);
            toast.error("Failed to save workflow");
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Create Workflow</DialogTitle>
                    <DialogDescription>
                        Define a sequence of steps for agents to execute.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto py-4 space-y-6">
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Workflow Name</Label>
                            <Input
                                placeholder="e.g. Research & Summarize"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Description</Label>
                            <Textarea
                                placeholder="Briefly describe what this workflow does..."
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <Label>Workflow Steps</Label>
                            <Button variant="outline" size="sm" onClick={addStep} className="gap-2">
                                <Plus className="h-4 w-4" /> Add Step
                            </Button>
                        </div>

                        <div className="space-y-2">
                            {steps.map((step, index) => (
                                <div key={step.id} className="relative group">
                                    {index > 0 && (
                                        <div className="flex justify-center py-2 text-muted-foreground/30">
                                            <ArrowDown className="h-5 w-5" />
                                        </div>
                                    )}

                                    <div className="border rounded-lg p-4 bg-muted/30 space-y-3 relative">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex items-center justify-center h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-bold mt-2">
                                                {index + 1}
                                            </div>

                                            <div className="flex-1 space-y-3">
                                                <div className="flex-1">
                                                    <Label className="text-xs text-muted-foreground mb-1 block">Agent</Label>
                                                    <Select
                                                        value={step.agentId}
                                                        onValueChange={(val) => updateStep(step.id, "agentId", val)}
                                                    >
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Select an agent..." />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {agents?.map(agent => (
                                                                <SelectItem key={agent.id} value={agent.id}>
                                                                    {agent.avatar} {agent.name}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>

                                                <div className="flex-1">
                                                    <Label className="text-xs text-muted-foreground mb-1 block">Instruction</Label>
                                                    <Textarea
                                                        placeholder="What should this agent do? Use {{variable}} for inputs."
                                                        value={step.instruction}
                                                        onChange={(e) => updateStep(step.id, "instruction", e.target.value)}
                                                        className="min-h-[80px]"
                                                    />
                                                </div>
                                            </div>

                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="text-muted-foreground hover:text-destructive self-start"
                                                onClick={() => removeStep(step.id)}
                                                disabled={steps.length === 1}
                                            >
                                                <Trash className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <DialogFooter className="pt-2 border-t">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleSave} disabled={!name || steps.some(s => !s.agentId || !s.instruction)}>
                        Save Workflow
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
