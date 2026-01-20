import { generateSimpleText, DEFAULT_UTILITY_MODELS } from "@/lib/ai/chat-executor";

export async function POST(req: Request) {
    try {
        const { messages, providerId = "openrouter", providerBaseUrl, titleModelId, apiKey } = await req.json();

        if (!messages || messages.length === 0) {
            return new Response("No messages provided", { status: 400 });
        }

        // Use the titleModelId passed from client, or fall back to provider default
        const configuredTitleModel = titleModelId || DEFAULT_UTILITY_MODELS[providerId] || "gpt-5-nano";


        // Require user-provided API key for all providers
        if (!apiKey) {
            return new Response(JSON.stringify({ title: "New Chat" }), {
                headers: { "Content-Type": "application/json" },
            });
        }

        // Build conversation summary for title generation
        const conversationPreview = messages.slice(0, 3).map((m: any) => {
            const content = typeof m.content === 'string' ? m.content : '[Complex Content]';
            return `${m.role}: ${content.slice(0, 200)}`;
        }).join('\n');

        const { text, usage } = await generateSimpleText({
            providerId,
            providerBaseUrl,
            modelId: configuredTitleModel,
            apiKey,
            messages: [
                {
                    role: "user",
                    content: `Generate a short title (3-6 words) for this conversation. Reply with ONLY the title, nothing else.

Conversation:
${conversationPreview}

Title:`,
                },
            ],
            maxTokens: 30,
            temperature: 0.5,
        });

        // Clean up the title - remove quotes, "Title:" prefix, newlines
        let title = text.trim()
            .replace(/^["']|["']$/g, "")
            .replace(/^title:\s*/i, "")
            .replace(/\n.*/g, "") // Take only first line
            .trim();

        // Fallback if title is empty or too short
        if (!title || title.length < 2) {
            // Try to extract something meaningful from the first user message
            const firstUserMsg = messages.find((m: any) => m.role === 'user');
            if (firstUserMsg) {
                const content = typeof firstUserMsg.content === 'string'
                    ? firstUserMsg.content
                    : '';
                // Take first 50 chars and truncate at word boundary
                title = content.slice(0, 50).replace(/\s+\S*$/, '').trim() || "New Chat";
            } else {
                title = "New Chat";
            }
        }


        return new Response(JSON.stringify({
            title,
            cost: usage?.cost ?? 0,
            inputTokens: usage?.inputTokens ?? 0,
            outputTokens: usage?.outputTokens ?? 0,
        }), {
            headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        console.error("Title generation failed:", error);
        // Don't fail the client, just return generic
        return new Response(JSON.stringify({ title: "New Chat" }), { status: 200 });
    }
}
