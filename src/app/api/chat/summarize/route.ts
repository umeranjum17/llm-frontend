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

        const configuredModel = DEFAULT_UTILITY_MODELS[providerId] || "gpt-5-nano";

        const { text, usage } = await generateSimpleText({
            providerId,
            providerBaseUrl,
            modelId: configuredModel,
            apiKey,
            messages: [
                {
                    role: "system",
                    content: `Summarize this conversation in 1-2 sentences (max 30 words). Capture the main topic and outcome. Output only the summary text, no labels.`,
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
