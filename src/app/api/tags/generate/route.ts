import { generateSimpleText, DEFAULT_UTILITY_MODELS } from "@/lib/ai/chat-executor";

export async function POST(req: Request) {
    try {
        const { messages, providerId = "openrouter", providerBaseUrl, apiKey } = await req.json();

        if (!messages || messages.length === 0) {
            return new Response("No messages provided", { status: 400 });
        }

        // Require user-provided API key
        if (!apiKey) {
            return new Response(JSON.stringify({ tags: [] }), {
                headers: { "Content-Type": "application/json" },
            });
        }

        const configuredModel = DEFAULT_UTILITY_MODELS[providerId] || "gpt-4o-mini";
        console.log(`[Tags] Using model ${configuredModel} for provider ${providerId}`);

        const { text } = await generateSimpleText({
            providerId,
            providerBaseUrl,
            modelId: configuredModel,
            apiKey,
            messages: [
                {
                    role: "system",
                    content: `You are a helpful assistant. Generate 1-3 short, relevant tags for the following conversation.
Rules:
- Return ONLY a JSON array of strings, e.g. ["react", "frontend", "debugging"].
- No markdown code blocks.
- Tags should be short (1-2 words).
- Lowercase only.
- Minimize generic tags like "coding" or "help". Focus on specific topics.`,
                },
                ...messages.slice(0, 5).map((m: any) => ({
                    role: m.role as "system" | "user" | "assistant",
                    content: typeof m.content === 'string' ? m.content : '[Complex Content]'
                }))
            ],
            maxTokens: 50,
            temperature: 0.3,
        });

        console.log("[Tags] Raw model output:", text);

        // Clean up response if it contains markdown code blocks
        let cleanText = text.trim();
        if (cleanText.startsWith("```")) {
            cleanText = cleanText.replace(/^```(json)?/, "").replace(/```$/, "").trim();
        }

        console.log("[Tags] Cleaned text:", cleanText);

        let tags: string[] = [];
        try {
            tags = JSON.parse(cleanText);
        } catch (e) {
            console.error("[Tags] JSON parse failed, trying comma split fallback.");
            console.error(e);
            // Fallback: try to reset cleanText to just comma separation if JSON failed
            tags = cleanText.split(",").map(t => t.trim().replace(/^["']|["']$/g, ""));
        }

        // Validate
        if (!Array.isArray(tags)) {
            console.log("[Tags] Parsed result is not an array:", tags);
            tags = [];
        }
        tags = tags.slice(0, 3); // Max 3 tags

        console.log("[Tags] Final Generated:", tags);

        return new Response(JSON.stringify({ tags }), {
            headers: { "Content-Type": "application/json" },
        });
    } catch (error: any) {
        console.error("Tag generation failed:", error);
        return new Response(JSON.stringify({
            tags: [],
            error: error.message || "Unknown error",
            stack: error.stack
        }), { status: 200 });
    }
}
