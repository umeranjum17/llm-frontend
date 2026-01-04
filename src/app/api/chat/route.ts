import { streamText, tool } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";
import { webSearch } from "@/lib/tools/web-search";

export const runtime = "edge";

const ChatRequestSchema = z.object({
  modelId: z.string().min(1),
  messages: z
    .array(
      z.object({
        role: z.enum(["system", "user", "assistant"]),
        content: z.string(),
      })
    )
    .min(1),
  enabledTools: z.array(z.string()).optional(),
  webSearch: z
    .object({
      provider: z.enum(["tavily", "serper", "brave", "searxng", "mock"]).optional(),
      apiKey: z.string().optional(),
      baseUrl: z.string().optional(),
    })
    .optional(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsedBody = ChatRequestSchema.safeParse(body);
    if (!parsedBody.success) {
      return new Response(
        JSON.stringify({
          error: "Invalid request body",
          details: parsedBody.error.flatten(),
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const { modelId, messages, enabledTools = [], webSearch: webSearchConfig } = parsedBody.data;
    const apiKey = req.headers.get("X-API-Key");

    if (!apiKey) {
      return new Response("No API key provided", { status: 401 });
    }

    // Create OpenRouter provider instance with the user's API key
    const openrouter = createOpenAI({
      apiKey: apiKey,
      baseURL: "https://openrouter.ai/api/v1",
    });

    const model = openrouter(modelId);

    const toolInstructionMessages = enabledTools.includes("web-search")
      ? [
          {
            role: "system" as const,
            content:
              "If you use webSearch, call it as many times as needed (within the step limit), then include a final `Sources` section with numbered markdown links to the URLs you relied on. If you did not use webSearch, do not add a Sources section.",
          },
        ]
      : [];

    // Build tools object
    const tools = enabledTools.includes("web-search")
      ? {
        webSearch: tool({
          description: "Search the web for current information",
          parameters: z.object({
            query: z.string().describe("The search query"),
            maxResults: z.number().default(5).describe("Maximum number of results"),
          }),
          execute: async ({ query, maxResults }) => {
            return await webSearch(query, maxResults, webSearchConfig);
          },
        }),
      }
      : undefined;

    // Stream the response
    const result = streamText({
      model,
      messages: [...toolInstructionMessages, ...messages],
      tools,
      maxSteps: 5, // Enable multi-step agentic behavior
    });

    // Return the streaming response
    return result.toDataStreamResponse();
  } catch (error) {
    console.error("Chat API error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to process chat request" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
