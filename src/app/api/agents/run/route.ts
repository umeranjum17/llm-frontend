import { generateText } from "ai";
import { z } from "zod";
import { BUILTIN_AGENTS } from "@/lib/constants/agents";
import { getAgentById } from "@/lib/db/queries";
import type { Agent } from "@/lib/db/schema";
import { createModel } from "@/lib/ai/chat-executor";

export const runtime = "nodejs";

/**
 * Sanitize error messages to avoid leaking implementation details
 */
function sanitizeErrorMessage(error: unknown): string {
    if (!(error instanceof Error)) {
        return "Agent execution failed";
    }

    const message = error.message;

    // Whitelist of safe error patterns to pass through
    const safePatterns = [
        /^API key required$/i,
        /^Agent not found:/i,
        /^Pipeline execution failed$/i,
        /^Invalid request/i,
        /rate limit/i,
        /unauthorized/i,
        /forbidden/i,
        /timeout/i,
    ];

    for (const pattern of safePatterns) {
        if (pattern.test(message)) {
            return message;
        }
    }

    // Generic message for other errors
    return "Agent execution failed. Please try again.";
}

const RequestSchema = z.object({
    agentId: z.string(),
    userMessage: z.string(),
    chatId: z.string().optional(),
    // Optional overrides (for backwards compatibility)
    systemPrompt: z.string().optional(),
    modelId: z.string().optional(),
    providerId: z.string().optional(),
});

/**
 * Run a simple agent (single LLM call)
 */
async function runSimpleAgent(
    systemPrompt: string,
    userMessage: string,
    modelId: string,
    providerId: string,
    apiKey: string
): Promise<string> {
    const model = createModel({
        providerId,
        modelId,
        apiKey,
    });

    const result = await generateText({
        model: model as any,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
        maxOutputTokens: 2000,
    });

    return result.text;
}

/**
 * Run a pipeline agent by calling the pipeline API
 */
async function runPipelineAgent(
    agent: Agent,
    userMessage: string,
    chatId: string,
    apiKey: string,
    baseUrl: string
): Promise<any> {
    if (!agent.pipeline) {
        throw new Error("Pipeline agent missing pipeline configuration");
    }

    const response = await fetch(`${baseUrl}/api/agents/pipeline`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-API-Key": apiKey,
        },
        body: JSON.stringify({
            pipeline: agent.pipeline,
            userInput: userMessage,
            chatId,
        }),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error((errorData as any)?.error || "Pipeline execution failed");
    }

    // Parse SSE stream to get final result
    const reader = response.body?.getReader();
    if (!reader) {
        throw new Error("No response body");
    }

    const decoder = new TextDecoder();
    let result: any = null;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split("\n");

        for (const line of lines) {
            if (line.startsWith("data: ")) {
                try {
                    const data = JSON.parse(line.slice(6));
                    if (data.type === "pipeline-complete") {
                        result = data.result;
                    } else if (data.type === "pipeline-error") {
                        throw new Error(data.error);
                    }
                } catch (e) {
                    // Ignore parse errors for incomplete chunks
                }
            }
        }
    }

    return result;
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const parsed = RequestSchema.safeParse(body);

        if (!parsed.success) {
            return new Response(
                JSON.stringify({ error: "Invalid request", details: parsed.error.flatten() }),
                { status: 400, headers: { "Content-Type": "application/json" } }
            );
        }

        const { agentId, userMessage, chatId, systemPrompt: overridePrompt, modelId: overrideModel, providerId: overrideProvider } = parsed.data;
        const apiKey = req.headers.get("X-API-Key");

        if (!apiKey) {
            return new Response(
                JSON.stringify({ error: "API key required" }),
                { status: 401, headers: { "Content-Type": "application/json" } }
            );
        }

        // Find agent from built-in agents or database
        let agent: Agent | undefined = BUILTIN_AGENTS.find((a) => a.id === agentId);

        // If not found in built-in agents, check database for user-created agents
        if (!agent) {
            const dbAgent = await getAgentById(agentId);
            if (dbAgent && dbAgent.isActive) {
                agent = dbAgent;
            }
        }

        if (!agent) {
            return new Response(
                JSON.stringify({ error: `Agent not found: ${agentId}` }),
                { status: 404, headers: { "Content-Type": "application/json" } }
            );
        }

        const baseUrl = new URL(req.url).origin;
        let result: any;

        if (agent.executionType === "pipeline" && agent.pipeline) {
            result = await runPipelineAgent(agent, userMessage, chatId || "temp", apiKey, baseUrl);
        } else {
            // Simple agent
            const systemPrompt = overridePrompt || agent.systemPrompt || "";
            const modelId = overrideModel || agent.modelId || "openai/gpt-4o-mini";
            const providerId = overrideProvider || "openrouter";
            result = await runSimpleAgent(systemPrompt, userMessage, modelId, providerId, apiKey);
        }

        return new Response(
            JSON.stringify({ result }),
            { status: 200, headers: { "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("[Agent Run API] Error:", error);
        // Sanitize error message to avoid leaking implementation details
        const sanitizedMessage = sanitizeErrorMessage(error);
        return new Response(
            JSON.stringify({ error: sanitizedMessage }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
}
