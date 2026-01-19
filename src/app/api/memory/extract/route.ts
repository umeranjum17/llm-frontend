import { z } from "zod";
import { generateStructuredOutput, validateProvider } from "@/lib/ai/chat-executor";

export const runtime = "edge";

const MemoryExtractionSchema = z.object({
  memories: z.array(
    z.object({
      content: z.string().min(5).max(500),
      category: z.enum(["fact", "preference", "project", "skill", "other"]),
      confidence: z.number().min(0).max(1),
    })
  ),
});

const ExtractRequestSchema = z.object({
  providerId: z.string().min(1),
  providerBaseUrl: z.string().url().optional(),
  modelId: z.string().min(1),
  conversation: z.string().min(1),
});

const EXTRACTION_PROMPT = `Analyze this conversation and extract key facts about the user that would be useful to remember for future conversations.

RULES:
- Only extract CLEAR, FACTUAL information directly stated or strongly implied
- Focus on stable, long-term information (not temporary situations)
- Avoid sensitive info (passwords, financial details)

What to extract: name, profession, skills, projects, tools/languages, preferences, goals

Categories:
- fact: Personal info (name, job, location, company)
- skill: Technical abilities, languages, frameworks
- project: Current work, projects, products
- preference: Style/communication preferences
- other: Anything else useful

Examples:
- "I work at Google" → {"content": "Works at Google", "category": "fact", "confidence": 0.95}
- "I prefer TypeScript" → {"content": "Prefers TypeScript over JavaScript", "category": "preference", "confidence": 0.85}

Return JSON array. Empty [] if no significant facts.

CONVERSATION:
{{CONVERSATION}}`;

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsedBody = ExtractRequestSchema.safeParse(body);

    if (!parsedBody.success) {
      return new Response(
        JSON.stringify({
          error: "Invalid request body",
          details: parsedBody.error.flatten(),
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const { providerId, providerBaseUrl, modelId, conversation } = parsedBody.data;
    const apiKey = req.headers.get("X-API-Key");

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "X-API-Key header required" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // Validate provider
    const validation = validateProvider(providerId, providerBaseUrl, apiKey);
    if ("error" in validation) {
      return validation.error;
    }

    const prompt = EXTRACTION_PROMPT.replace("{{CONVERSATION}}", conversation);

    const result = await generateStructuredOutput({
      providerId,
      providerBaseUrl,
      modelId,
      apiKey,
      prompt,
      schema: MemoryExtractionSchema,
    });

    return new Response(
      JSON.stringify({ memories: result.object.memories }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Memory extraction API error:", error);

    // Check for rate limit errors
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const isRateLimit = errorMessage.includes("429") || errorMessage.includes("rate-limited");

    return new Response(
      JSON.stringify({
        error: isRateLimit ? "Rate limited - try a different model" : "Failed to extract memories",
        message: errorMessage,
        isRateLimit,
      }),
      {
        status: isRateLimit ? 429 : 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
