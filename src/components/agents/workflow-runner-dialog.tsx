"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Workflow } from "@/lib/db/schema";
import { workflowEngine } from "@/lib/agents/workflow-engine";
import { Loader2 } from "lucide-react";

interface WorkflowRunnerDialogProps {
    workflow: Workflow | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function WorkflowRunnerDialog({ workflow, open, onOpenChange }: WorkflowRunnerDialogProps) {
    const [isRunning, setIsRunning] = useState(false);
    const [inputs, setInputs] = useState<Record<string, string>>({});
    const [logs, setLogs] = useState<string[]>([]);
    const [result, setResult] = useState<Record<string, string> | null>(null);

    if (!workflow) return null;

    // Extract variables from all steps: {{var}}
    const variables = new Set<string>();
    workflow.steps.forEach(step => {
        const matches = step.instruction.match(/{{([^}]+)}}/g);
        if (matches) {
            matches.forEach((m: string) => variables.add(m.slice(2, -2)));
        }
    });
    // Filter out auto-generated variables (step_X_output)
    const inputVariables = Array.from(variables).filter(v => !v.startsWith("step_"));

    const handleRun = async () => {
        setIsRunning(true);
        setLogs(["Starting workflow..."]);
        setResult(null);
        try {
            const finalContext = await workflowEngine.execute(workflow, inputs);
            setResult(finalContext);
            setLogs(prev => [...prev, "Workflow completed successfully."]);
        } catch (error) {
            console.error(error);
            setLogs(prev => [...prev, `Error: ${error}`]);
        } finally {
            setIsRunning(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Run Workflow: {workflow.name}</DialogTitle>
                    <DialogDescription>
                        Provide inputs and execute the workflow.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Inputs */}
                    {inputVariables.length > 0 && (
                        <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
                            <h4 className="text-sm font-medium">Inputs</h4>
                            {inputVariables.map(variable => (
                                <div key={variable} className="space-y-1">
                                    <Label className="text-xs">{variable}</Label>
                                    <Input
                                        value={inputs[variable] || ""}
                                        onChange={(e) => setInputs({ ...inputs, [variable]: e.target.value })}
                                        placeholder={`Value for ${variable}`}
                                        disabled={isRunning}
                                    />
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Logs / Progress */}
                    <div className="space-y-2">
                        <h4 className="text-sm font-medium">Execution Log</h4>
                        <div className="h-40 overflow-y-auto rounded-md border bg-black text-xs font-mono p-3 text-green-400 space-y-1">
                            {logs.map((log, i) => (
                                <div key={i}>{log}</div>
                            ))}
                            {isRunning && <Loader2 className="h-3 w-3 animate-spin mt-2" />}
                        </div>
                    </div>

                    {/* Result */}
                    {result && (
                        <div className="space-y-2">
                            <h4 className="text-sm font-medium">Final Output</h4>
                            <div className="max-h-60 overflow-y-auto rounded-md border p-3 text-sm bg-muted/50 whitespace-pre-wrap">
                                {/* Show the output of the last step by default, or all context */}
                                {Object.entries(result).filter(([k]) => k.startsWith("step_")).map(([k, v]) => (
                                    <div key={k} className="mb-4">
                                        <div className="font-bold text-xs uppercase text-muted-foreground mb-1">{k.replace(/_/g, " ")}</div>
                                        <div>{v}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    {!isRunning && (
                        <Button onClick={handleRun}>
                            Run Workflow
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
