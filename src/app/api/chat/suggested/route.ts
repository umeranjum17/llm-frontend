import { generateSimpleText, DEFAULT_UTILITY_MODELS } from "@/lib/ai/chat-executor";

export async function POST(req: Request) {
    try {
        const { messages, providerId = "openrouter", providerBaseUrl, apiKey } = await req.json();

        if (!messages || messages.length === 0) {
            return new Response("No messages provided", { status: 400 });
        }

        const configuredModel = DEFAULT_UTILITY_MODELS[providerId] || "gpt-4o-mini";

        const { text } = await generateSimpleText({
            providerId,
            providerBaseUrl,
            modelId: configuredModel,
            apiKey,
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
                    role: m.role as "system" | "user" | "assistant",
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
