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

        const configuredModel = DEFAULT_UTILITY_MODELS[providerId] || "gpt-5-nano";

        const { text } = await generateSimpleText({
            providerId,
            providerBaseUrl,
            modelId: configuredModel,
            apiKey,
            messages: [
                {
                    role: "system",
                    content: `Generate 1-3 specific tags for this conversation.

CRITICAL: Output ONLY a valid JSON array. Do not include any other text, explanations, or markdown.

Format: ["tag1", "tag2", "tag3"]
Rules:
- lowercase only
- 1-2 words each
- specific topics, not generic tags like "coding" or "help"

Example outputs:
["react", "hooks"]
["python", "api"]
["css", "flexbox"]`,
                },
                ...messages.slice(0, 5).map((m: any) => ({
                    role: m.role as "system" | "user" | "assistant",
                    content: typeof m.content === 'string' ? m.content : '[Complex Content]'
                }))
            ],
            maxTokens: 50,
            temperature: 0.3,
        });


        // Clean up response if it contains markdown code blocks
        let cleanText = text.trim();
        if (cleanText.startsWith("```")) {
            cleanText = cleanText.replace(/^```(json)?/, "").replace(/```$/, "").trim();
        }

        let tags: string[] = [];

        // Handle empty or invalid responses
        if (!cleanText) {
            console.warn("[Tags] Empty response from model");
            return new Response(JSON.stringify({ tags: [] }), {
                headers: { "Content-Type": "application/json" },
            });
        }

        try {
            tags = JSON.parse(cleanText);
        } catch (e) {
            console.error("[Tags] JSON parse failed, trying comma split fallback.");
            console.error("[Tags] Raw text:", cleanText);

            // Fallback 1: Try to extract JSON array pattern from text
            const jsonMatch = cleanText.match(/\[.*\]/);
            if (jsonMatch) {
                try {
                    tags = JSON.parse(jsonMatch[0]);
                } catch {
                    // Fallback 2: Comma-separated values
                    tags = cleanText.split(",").map(t => t.trim().replace(/^["'\[\]]/g, "").replace(/["'\[\]]$/g, ""));
                }
            } else {
                // Fallback 2: Comma-separated values
                tags = cleanText.split(",").map(t => t.trim().replace(/^["'\[\]]/g, "").replace(/["'\[\]]$/g, ""));
            }
        }

        // Validate
        if (!Array.isArray(tags)) {
            tags = [];
        }
        tags = tags.slice(0, 3); // Max 3 tags


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
