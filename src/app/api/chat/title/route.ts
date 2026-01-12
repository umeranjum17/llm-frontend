import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";

// Smart defaults per provider for title generation (cheap, fast models)
const DEFAULT_TITLE_MODELS: Record<string, string> = {
    openrouter: "openai/gpt-4o-mini", // Using OpenAI model via OpenRouter
    openai: "gpt-4o-mini",
    anthropic: "claude-3-haiku-20240307",
    groq: "llama-3.1-8b-instant",
};

export async function POST(req: Request) {
    try {
        const { messages, providerId, providerBaseUrl, modelId, apiKey, titleModelId } = await req.json();

        if (!messages || messages.length === 0) {
            return new Response("No messages provided", { status: 400 });
        }

        // Use the titleModelId passed from client, or fall back to provider default
        const configuredTitleModel = titleModelId || DEFAULT_TITLE_MODELS[providerId] || "gpt-4o-mini";

        console.log(`[Title] Using model ${configuredTitleModel} for provider ${providerId}`);

        // Construct the model instance
        let titleModel;

        // Helper to Create model based on provider
        if (providerId === "openai") {
            const openai = createOpenAI({
                apiKey: apiKey || process.env.OPENAI_API_KEY,
                baseURL: providerBaseUrl
            });
            titleModel = openai(configuredTitleModel);
        } else if (providerId === "anthropic") {
            const anthropic = createAnthropic({ apiKey: apiKey || process.env.ANTHROPIC_API_KEY });
            titleModel = anthropic(configuredTitleModel);
        } else if (providerId === "openrouter") {
            const openrouter = createOpenAI({
                apiKey: apiKey || process.env.OPENROUTER_API_KEY,
                baseURL: "https://openrouter.ai/api/v1",
            });
            // Use configured model or default to cheapest option
            titleModel = openrouter(configuredTitleModel);
        } else {
            // Fallback for custom providers or google (via openai-compatible if needed)
            // Default to a generic OpenAI-compatible client
            const generic = createOpenAI({
                apiKey: apiKey,
                baseURL: providerBaseUrl
            });
            // If modelId is something helpful, use it, otherwise fallback might fail
            titleModel = generic(modelId || configuredTitleModel);
        }

        console.log("[Title] Generating title using provider:", providerId);

        // Request usage data from OpenRouter
        const providerOptions: Record<string, any> = {};
        if (providerId === "openrouter") {
            providerOptions.openrouter = { usage: { include: true } };
        }

        // Build conversation summary for title generation
        const conversationPreview = messages.slice(0, 3).map((m: any) => {
            const content = typeof m.content === 'string' ? m.content : '[Complex Content]';
            return `${m.role}: ${content.slice(0, 200)}`;
        }).join('\n');

        const { text, usage } = await generateText({
            model: titleModel,
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
            providerOptions,
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

        // Extract cost from usage if available
        const cost = (usage as any)?.cost ?? 0;
        const inputTokens = usage?.promptTokens ?? 0;
        const outputTokens = usage?.completionTokens ?? 0;

        console.log("[Title] Generated title:", title, `(cost: $${cost}, tokens: ${inputTokens}/${outputTokens})`);

        return new Response(JSON.stringify({
            title,
            cost,
            inputTokens,
            outputTokens,
        }), {
            headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        console.error("Title generation failed:", error);
        // Don't fail the client, just return generic
        return new Response(JSON.stringify({ title: "New Chat" }), { status: 200 });
    }
}
