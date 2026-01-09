import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";

export async function POST(req: Request) {
    try {
        const { messages, providerId, providerBaseUrl, modelId, apiKey } = await req.json();

        if (!messages || messages.length === 0) {
            return new Response("No messages provided", { status: 400 });
        }

        // Construct the model instance
        let titleModel;

        // Helper to Create model based on provider
        if (providerId === "openai") {
            const openai = createOpenAI({
                apiKey: apiKey || process.env.OPENAI_API_KEY,
                baseURL: providerBaseUrl
            });
            titleModel = openai("gpt-4o-mini");
        } else if (providerId === "anthropic") {
            const anthropic = createAnthropic({ apiKey: apiKey || process.env.ANTHROPIC_API_KEY });
            titleModel = anthropic("claude-3-haiku-20240307");
        } else if (providerId === "openrouter") {
            const openrouter = createOpenAI({
                apiKey: apiKey || process.env.OPENROUTER_API_KEY,
                baseURL: "https://openrouter.ai/api/v1",
            });
            // Use a stable, cheap model on OpenRouter
            titleModel = openrouter("google/gemini-flash-1.5");
        } else {
            // Fallback for custom providers or google (via openai-compatible if needed)
            // Default to a generic OpenAI-compatible client
            const generic = createOpenAI({
                apiKey: apiKey,
                baseURL: providerBaseUrl
            });
            // If modelId is something helpful, use it, otherwise fallback might fail
            titleModel = generic(modelId || "gpt-3.5-turbo");
        }

        console.log("[Title] Generating title using provider:", providerId);

        const { text } = await generateText({
            model: titleModel,
            messages: [
                {
                    role: "system",
                    content: `You are a helpful assistant. Generate a short, concise title (max 6 words) for the following conversation. 
Do not include quotation marks or "Title:" prefix. Just the title text.
Examples:
- "Debugging React Hooks"
- "Python Async Tutorial"
- "Recipe for Chocolate Cake"`,
                },
                // We only need the first few messages
                ...messages.slice(0, 3).map((m: any) => ({
                    role: m.role,
                    content: typeof m.content === 'string' ? m.content : '[Complex Content]'
                }))
            ],
            maxTokens: 20,
            temperature: 0.3,
        });

        const title = text.trim().replace(/^["']|["']$/g, "");
        console.log("[Title] Generated title:", title);

        return new Response(JSON.stringify({ title }), {
            headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        console.error("Title generation failed:", error);
        // Don't fail the client, just return generic
        return new Response(JSON.stringify({ title: "New Chat" }), { status: 200 });
    }
}
