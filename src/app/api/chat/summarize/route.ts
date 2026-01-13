import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";

// Smart defaults per provider (cheap, fast models)
const DEFAULT_SUMMARY_MODELS: Record<string, string> = {
    openrouter: "openai/gpt-4o-mini",
    openai: "gpt-4o-mini",
    anthropic: "claude-3-haiku-20240307",
    groq: "llama-3.1-8b-instant",
};

export async function POST(req: Request) {
    try {
        const { messages, providerId, providerBaseUrl, modelId, apiKey } = await req.json();

        if (!messages || messages.length === 0) {
            return new Response("No messages provided", { status: 400 });
        }

        // Require user-provided API key
        if (!apiKey) {
            return new Response(JSON.stringify({ summary: "" }), {
                headers: { "Content-Type": "application/json" },
            });
        }

        const configuredModel = DEFAULT_SUMMARY_MODELS[providerId] || "gpt-4o-mini";
        console.log(`[Summary] Using model ${configuredModel} for provider ${providerId}`);

        let summaryModel;

        if (providerId === "openai") {
            const openai = createOpenAI({
                apiKey,
                baseURL: providerBaseUrl
            });
            summaryModel = openai(configuredModel);
        } else if (providerId === "anthropic") {
            const anthropic = createAnthropic({ apiKey });
            summaryModel = anthropic(configuredModel);
        } else if (providerId === "openrouter") {
            const openrouter = createOpenAI({
                apiKey,
                baseURL: "https://openrouter.ai/api/v1",
            });
            summaryModel = openrouter(configuredModel);
        } else {
            const generic = createOpenAI({
                apiKey: apiKey,
                baseURL: providerBaseUrl
            });
            summaryModel = generic(modelId || configuredModel);
        }

        // Request usage data from OpenRouter
        const providerOptions: Record<string, any> = {};
        if (providerId === "openrouter") {
            providerOptions.openrouter = { usage: { include: true } };
        }

        const { text, usage } = await generateText({
            model: summaryModel,
            messages: [
                {
                    role: "system",
                    content: `You are a helpful assistant. Summarize the following conversation in 1-2 short sentences.
Rules:
- Capture the main topic and key decision/outcome.
- Be concise (max 30 words).
- No labels like "Summary:" or "Topic:".
- Just the text.`,
                },
                ...messages.slice(-10).map((m: any) => ({
                    role: m.role,
                    content: typeof m.content === 'string' ? m.content : '[Complex Content]'
                }))
            ],
            maxTokens: 100,
            temperature: 0.3,
            providerOptions,
        });

        const summary = text.trim();

        // Extract cost from usage if available
        const cost = (usage as any)?.cost ?? 0;
        const inputTokens = usage?.promptTokens ?? 0;
        const outputTokens = usage?.completionTokens ?? 0;

        console.log("[Summary] Generated:", summary, `(cost: $${cost}, tokens: ${inputTokens}/${outputTokens})`);

        return new Response(JSON.stringify({
            summary,
            cost,
            inputTokens,
            outputTokens,
        }), {
            headers: { "Content-Type": "application/json" },
        });
    } catch (error: any) {
        console.error("Summary generation failed:", error);
        return new Response(JSON.stringify({
            summary: "",
            error: error.message || "Unknown error"
        }), { status: 200 }); // Return 200 so we don't crash UI, just no summary
    }
}
