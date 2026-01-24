import { generateSimpleText, DEFAULT_UTILITY_MODELS } from "@/lib/ai/chat-executor";
import { createErrorResponse } from "@/lib/utils/api-error-response";

export async function POST(req: Request) {
    let providerId = "openrouter";
    try {
        const body = await req.json();
        const { messages, providerId: bodyProviderId = "openrouter", providerBaseUrl, apiKey } = body;
        providerId = bodyProviderId;

        if (!messages || messages.length === 0) {
            return createErrorResponse("VALIDATION_ERROR", {
                message: "No messages provided",
            });
        }

        // Require user-provided API key - return empty tags silently (not an error case)
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
        // Return 200 with empty tags so UI doesn't crash - tags are optional
        // Include structured error info for debugging
        const { classifyUpstreamError } = await import("@/lib/utils/api-error-response");
        const classified = classifyUpstreamError(error, providerId);
        return new Response(JSON.stringify({
            tags: [],
            error: classified.message,
            errorCode: classified.errorCode,
            provider: providerId,
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    }
}
