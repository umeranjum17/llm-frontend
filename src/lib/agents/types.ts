import { z } from "zod";

export const WorkflowStepSchema = z.object({
    id: z.string(),
    name: z.string(),
    agentId: z.string(), // "researcher", "writer", etc.
    instruction: z.string(), // "Research {{topic}}"
    inputVariables: z.array(z.string()).optional(), // variables required from previous step or user
    outputVariable: z.string().optional(), // key to store result in e.g. "research_notes"
});

export const WorkflowSchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    steps: z.array(WorkflowStepSchema),
    createdAt: z.number(),
    updatedAt: z.number(),
});

export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;
export type Workflow = z.infer<typeof WorkflowSchema>;
