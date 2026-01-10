import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
// In a real app we'd resolve the provider dynamically, similar to /api/chat
// For this client-side prototype, we'll verify if we can run this on server or need an API route.
// Since `ai` SDK is best used on server, we should probably move this execution to an API route: /api/workflows/execute
// However, to keep it simple for now, we'll assume we are calling an API route from here or using client-side if possible (but keys are risky).
// Actually, secure way implies we should create an API route.
// Let's create an API route `/api/agents/workflow` and call it from here.

import { Workflow } from "@/lib/db/schema";
import { getAgentById } from "@/lib/db/queries";

export class WorkflowEngine {
    async execute(workflow: Workflow, inputs: Record<string, string>): Promise<Record<string, string>> {
        const context = { ...inputs };

        for (const step of workflow.steps) {
            console.log(`[Workflow] Starting step: ${step.id}`);

            // Fetch agent details to get system prompt
            const agent = await getAgentById(step.agentId);
            if (!agent) throw new Error(`Agent ${step.agentId} not found`);

            // Prepare instruction with variable substitution
            let filledInstruction = step.instruction;
            for (const [key, value] of Object.entries(context)) {
                filledInstruction = filledInstruction.replace(new RegExp(`{{${key}}}`, "g"), value);
            }

            // Call API to execute step (to keep keys secure on server)
            const response = await fetch("/api/agents/run", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    agentId: agent.id,
                    systemPrompt: agent.systemPrompt,
                    userMessage: filledInstruction,
                    modelId: agent.modelId // Optional override
                })
            });

            if (!response.ok) {
                throw new Error(`Step failed: ${response.statusText}`);
            }

            const data = await response.json();
            const result = data.text;

            // Store result in context using a simplified key (e.g. step index or just append to history)
            // For now, let's just log it and maybe store if we had output variables
            console.log(`[Workflow] Step result:`, result);

            // Auto-save result to a context variable named after the step index for subsequent access
            // e.g. {{step_1_output}}
            const stepIndex = workflow.steps.findIndex(s => s.id === step.id);
            context[`step_${stepIndex + 1}_output`] = result;
        }

        return context;
    }
}

export const workflowEngine = new WorkflowEngine();
