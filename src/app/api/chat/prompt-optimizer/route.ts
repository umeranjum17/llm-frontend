import { z } from "zod";
import { generateSimpleText } from "@/lib/ai/chat-executor";

export const runtime = "nodejs";

const RequestSchema = z.object({
  userPrompt: z.string().min(1),
  systemPrompt: z.string().min(1),
  providerBaseUrl: z.string().url().optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = RequestSchema.safeParse(body);

    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.flatten() }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const { userPrompt, systemPrompt, providerBaseUrl } = parsed.data;
    const apiKey = req.headers.get("X-API-Key");

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "API key required" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const { text } = await generateSimpleText({
      providerId: "openrouter",
      providerBaseUrl: providerBaseUrl || undefined,
      modelId: "openai/gpt-4o-mini",
      apiKey,
      messages: [
        {
          role: "system",
          content: `You are an expert image prompt engineer. Your job is to transform user requests into optimized prompts for AI image generators.

${systemPrompt}

## YOUR TASK
Take the user's request and transform it into a detailed, professional image generation prompt that follows all the guidelines in your system prompt above.

## RULES
1. Output ONLY the optimized prompt - no explanations, no quotes, no markdown
2. Include ALL technical requirements from your system prompt (centering, aspect ratio, background, etc.)
3. Be specific and detailed about visual elements
4. Include style keywords appropriate for the request
5. Keep the prompt under 500 characters for best results
6. Do NOT include any conversational text or questions - just the prompt`,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
      maxTokens: 300,
      temperature: 0.7,
    });


    return new Response(
      JSON.stringify({ optimizedPrompt: text.trim() }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[Prompt Optimizer] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Failed to optimize prompt";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
