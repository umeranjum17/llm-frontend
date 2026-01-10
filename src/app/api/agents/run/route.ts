
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
});

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { systemPrompt, userMessage, modelId } = RequestSchema.parse(body);

        // Default to a model if none provided
        // In production, we should resolve provider based on modelId (same logic as /api/chat)
        // For this prototype, we'll try to use a default or infer from env
        // Simplified provider resolution:

        // Check if we have OpenRouter key
        const apiKey = process.env.OPENROUTER_API_KEY || "";
        // In a real app we might need to look up keys from DB if user provided, 
        // but typically specialized agents run on system keys or we'd pass them in headers.
        // For now assuming system env or public demo.

        const openai = createOpenAI({
            apiKey: apiKey,
            baseURL: "https://openrouter.ai/api/v1"
        });

        const modelName = modelId || "openai/gpt-4o-mini"; // Fallback

        const result = await generateText({
            model: openai(modelName),
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
