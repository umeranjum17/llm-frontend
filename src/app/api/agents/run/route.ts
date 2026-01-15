import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { BUILTIN_AGENTS } from "@/lib/constants/agents";
import { PROVIDERS } from "@/lib/providers/registry";

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
 * Get provider base URL from provider ID
 */
function getProviderBaseUrl(providerId: string): string {
    const provider = PROVIDERS.find((p) => p.id === providerId);
    return provider?.baseUrl || "https://openrouter.ai/api/v1";
}

/**
 * Create a model instance based on provider and model ID
 */
function createModel(modelId: string, apiKey: string, providerId?: string) {
    const effectiveProviderId = providerId || "openrouter";

    // Handle Anthropic provider (direct API)
    if (effectiveProviderId === "anthropic") {
        const anthropic = createAnthropic({ apiKey });
        return anthropic(modelId.replace("anthropic/", ""));
    }

    // Handle OpenAI direct (not via OpenRouter)
    if (effectiveProviderId === "openai") {
        const openai = createOpenAI({ apiKey });
        return openai(modelId.replace("openai/", ""));
    }

    // Default to OpenRouter or other OpenAI-compatible providers
    const baseUrl = getProviderBaseUrl(effectiveProviderId);
    const openai = createOpenAI({
        apiKey,
        baseURL: baseUrl,
    });
    return openai(modelId);
}

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
    const model = createModel(modelId, apiKey, providerId);

    const result = await generateText({
        model,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
        maxTokens: 2000,
    });

    return result.text;
}

/**
 * Run a pipeline agent by calling the pipeline API
 */
async function runPipelineAgent(
    agent: typeof BUILTIN_AGENTS[0],
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

        // Find agent from built-in agents
        // TODO: Also check database for user-created agents
        const agent = BUILTIN_AGENTS.find((a) => a.id === agentId);
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
