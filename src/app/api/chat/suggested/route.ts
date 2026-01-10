import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";

const DEFAULT_SUGGESTION_MODELS: Record<string, string> = {
    openrouter: "openai/gpt-4o-mini",
    openai: "gpt-4o-mini",
    anthropic: "claude-3-haiku-20240307",
    google: "gemini-1.5-flash",
};

export async function POST(req: Request) {
    try {
        const { messages, providerId, providerBaseUrl, modelId, apiKey } = await req.json();

        if (!messages || messages.length === 0) {
            return new Response("No messages provided", { status: 400 });
        }

        const configuredModel = DEFAULT_SUGGESTION_MODELS[providerId] || "gpt-4o-mini";

        let suggestionModel;

        if (providerId === "openrouter") {
            const openrouter = createOpenAI({
                apiKey,
                baseURL: "https://openrouter.ai/api/v1",
            });
            suggestionModel = openrouter(configuredModel);
        } else if (providerId === "openai") {
            const openai = createOpenAI({ apiKey, baseURL: providerBaseUrl });
            suggestionModel = openai(configuredModel);
        } else if (providerId === "anthropic") {
            const anthropic = createAnthropic({ apiKey });
            suggestionModel = anthropic(configuredModel);
        } else {
            // Default to OpenAI-compatible for other providers
            const custom = createOpenAI({ apiKey, baseURL: providerBaseUrl });
            suggestionModel = custom(modelId || "gpt-4o-mini");
        }

        const { text } = await generateText({
            model: suggestionModel,
            messages: [
                {
                    role: "system",
                    content: `You are a helpful assistant. Based on the conversation history, suggest 3 short follow-up prompts or questions the user might want to ask next.
Rules:
- Keep them very short (3-8 words each).
- Make them diverse and helpful.
- Format: Just the 3 suggestions separated by newlines.
- No numbering, no bullets, no introductory text.`,
                },
                ...messages.slice(-5).map((m: any) => ({
                    role: m.role,
                    content: typeof m.content === 'string' ? m.content : '[Complex Content]'
                }))
            ],
            maxTokens: 100,
            temperature: 0.7,
        });

        const suggestions = text
            .split("\n")
            .map(s => s.trim())
            .filter(s => s.length > 0 && !s.startsWith("-") && !/^\d\./.test(s))
            .slice(0, 3);

        return new Response(JSON.stringify({ suggestions }), {
            headers: { "Content-Type": "application/json" },
        });
    } catch (error: any) {
        console.error("Suggestion generation failed:", error);
        return new Response(JSON.stringify({
            suggestions: [],
            error: error.message || "Unknown error"
        }), { status: 200 });
    }
}
