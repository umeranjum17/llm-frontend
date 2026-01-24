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

        const configuredModel = DEFAULT_UTILITY_MODELS[providerId] || "gpt-5-nano";

        const { text } = await generateSimpleText({
            providerId,
            providerBaseUrl,
            modelId: configuredModel,
            apiKey,
            messages: [
                {
                    role: "system",
                    content: `Suggest 3 follow-up questions (3-8 words each). Output 3 lines, one per suggestion. No numbering, bullets, or intro text.`,
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
        // Return 200 with empty suggestions so UI doesn't crash - suggestions are optional
        // Include structured error info for debugging
        const { classifyUpstreamError } = await import("@/lib/utils/api-error-response");
        const classified = classifyUpstreamError(error, providerId);
        return new Response(JSON.stringify({
            suggestions: [],
            error: classified.message,
            errorCode: classified.errorCode,
            provider: providerId,
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    }
}
