import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

export const runtime = "edge";

const RequestSchema = z.object({
    agentId: z.string(),
    systemPrompt: z.string(),
    userMessage: z.string(),
    modelId: z.string().optional(),
    providerId: z.string().optional(),
    providerBaseUrl: z.string().optional(),
});

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { systemPrompt, userMessage, modelId, providerId, providerBaseUrl } = RequestSchema.parse(body);

        // Get API key from header (user-provided)
        const apiKey = req.headers.get("X-API-Key");

        // Require user-provided API key
        if (!apiKey) {
            return new Response(JSON.stringify({ error: "API key required" }), {
                status: 401,
                headers: { "Content-Type": "application/json" },
            });
        }

        const effectiveProviderId = providerId || "openrouter";
        const modelName = modelId || "openai/gpt-4o-mini";

        let model;

        if (effectiveProviderId === "anthropic") {
            const anthropic = createAnthropic({ apiKey });
            model = anthropic(modelName);
        } else if (effectiveProviderId === "openai") {
            const openai = createOpenAI({
                apiKey,
                baseURL: providerBaseUrl,
            });
            model = openai(modelName);
        } else {
            // Default to OpenRouter or custom OpenAI-compatible
            const openai = createOpenAI({
                apiKey,
                baseURL: providerBaseUrl || "https://openrouter.ai/api/v1"
            });
            model = openai(modelName);
        }

        const result = await generateText({
            model,
            system: systemPrompt,
            messages: [{ role: "user", content: userMessage }],
        });

        return new Response(JSON.stringify({ text: result.text }), {
            headers: { "Content-Type": "application/json" },
        });

    } catch (error) {
        console.error("Agent execution failed:", error);
        return new Response(JSON.stringify({ error: "Execution failed" }), { status: 500 });
    }
}
