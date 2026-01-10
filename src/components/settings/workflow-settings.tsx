"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Play, MoreVertical } from "lucide-react";
import { useState } from "react";
// Placeholder for now, assuming we will add 'workflows' text table to Dexie schema later or store in generic storage
// For this step, I'll use local state to demonstrate the UI until DB schema update is applied
import { Badge } from "@/components/ui/badge";
import { WorkflowEditorDialog } from "./workflow-editor-dialog";

import { WorkflowRunnerDialog } from "@/components/agents/workflow-runner-dialog";
import { getAllWorkflows } from "@/lib/db/queries";

export function WorkflowSettings() {
    const workflows = useLiveQuery(() => getAllWorkflows(), []);
    const [isEditorOpen, setIsEditorOpen] = useState(false);

    // Runner state
    const [runningWorkflow, setRunningWorkflow] = useState<any>(null);

    return (
        <div className="space-y-6">
            {/* ... header ... */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h3 className="text-lg font-medium">Agent Workflows</h3>
                    <p className="text-sm text-muted-foreground">
                        Chain multiple agents together to perform complex tasks automatically.
                    </p>
                </div>
                <Button className="gap-2" onClick={() => setIsEditorOpen(true)}>
                    <Plus className="h-4 w-4" />
                    New Workflow
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {workflows?.map((workflow: any) => (
                    <Card key={workflow.id} className="cursor-pointer hover:border-primary/50 transition-colors">
                        <CardHeader className="pb-3">
                            <div className="flex justify-between items-start">
                                <CardTitle className="text-base font-medium">{workflow.name}</CardTitle>
                                <Button variant="ghost" size="icon" className="-mr-2 -mt-2 h-8 w-8">
                                    <MoreVertical className="h-4 w-4" />
                                </Button>
                            </div>
                            <CardDescription className="line-clamp-2">{workflow.description}</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center justify-between mt-2">
                                <Badge variant="secondary">{workflow.steps?.length || 0} Steps</Badge>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="gap-2 h-8"
                                    onClick={() => setRunningWorkflow(workflow)}
                                >
                                    <Play className="h-3 w-3" />
                                    Run
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <WorkflowEditorDialog open={isEditorOpen} onOpenChange={setIsEditorOpen} />

            <WorkflowRunnerDialog
                workflow={runningWorkflow}
                open={!!runningWorkflow}
                onOpenChange={(open) => !open && setRunningWorkflow(null)}
            />
        </div>
    );
}
