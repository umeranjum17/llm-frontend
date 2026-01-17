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

IMPORTANT RULES:
- Only extract CLEAR, FACTUAL information directly stated or strongly implied
- Do NOT make assumptions or inferences beyond what's stated
- Focus on stable, long-term information (not temporary situations)
- Avoid extracting sensitive information (passwords, financial details, etc.)

What to extract:
- User's name, profession, or role
- Technical skills and expertise areas
- Current projects or companies they work with
- Communication preferences and style
- Tools, languages, or frameworks they use
- Goals or objectives they've mentioned

Return a JSON array. If no significant facts to extract, return empty array.

Categories:
- fact: Personal info (name, job title, location, company)
- skill: Technical abilities, languages, frameworks
- project: Current work, projects, products
- preference: Style preferences, communication preferences
- other: Anything else useful

CONVERSATION:
{{CONVERSATION}}

Extract memories as a JSON array with content, category, and confidence (0.0-1.0).`;

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
