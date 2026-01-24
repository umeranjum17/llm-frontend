import { generateSimpleText, DEFAULT_UTILITY_MODELS } from "@/lib/ai/chat-executor";
import { createErrorResponse, createUpstreamErrorResponse } from "@/lib/utils/api-error-response";

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

        // Require user-provided API key - return empty summary silently (not an error case)
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
        // Return 200 with empty summary so UI doesn't crash - summarization is optional
        // But include structured error info for debugging
        const { classifyUpstreamError } = await import("@/lib/utils/api-error-response");
        const classified = classifyUpstreamError(error, providerId);
        return new Response(JSON.stringify({
            summary: "",
            error: classified.message,
            errorCode: classified.errorCode,
            provider: providerId,
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    }
}
