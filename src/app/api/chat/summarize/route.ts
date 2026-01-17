import { generateSimpleText, DEFAULT_UTILITY_MODELS } from "@/lib/ai/chat-executor";

export async function POST(req: Request) {
    try {
        const { messages, providerId = "openrouter", providerBaseUrl, apiKey } = await req.json();

        if (!messages || messages.length === 0) {
            return new Response("No messages provided", { status: 400 });
        }

        // Require user-provided API key
        if (!apiKey) {
            return new Response(JSON.stringify({ summary: "" }), {
                headers: { "Content-Type": "application/json" },
            });
        }

        const configuredModel = DEFAULT_UTILITY_MODELS[providerId] || "gpt-4o-mini";
        console.log(`[Summary] Using model ${configuredModel} for provider ${providerId}`);

        const { text, usage } = await generateSimpleText({
            providerId,
            providerBaseUrl,
            modelId: configuredModel,
            apiKey,
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
                    role: m.role as "system" | "user" | "assistant",
                    content: typeof m.content === 'string' ? m.content : '[Complex Content]'
                }))
            ],
            maxTokens: 100,
            temperature: 0.3,
        });

        const summary = text.trim();

        console.log("[Summary] Generated:", summary, `(cost: $${usage?.cost ?? 0}, tokens: ${usage?.inputTokens ?? 0}/${usage?.outputTokens ?? 0})`);

        return new Response(JSON.stringify({
            summary,
            cost: usage?.cost ?? 0,
            inputTokens: usage?.inputTokens ?? 0,
            outputTokens: usage?.outputTokens ?? 0,
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
