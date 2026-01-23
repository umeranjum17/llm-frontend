import { generateSimpleText, DEFAULT_UTILITY_MODELS } from "@/lib/ai/chat-executor";

/**
 * Context Summary API
 *
 * Generates a summary of older messages for context compaction.
 * Unlike chat summaries (1-2 sentences), this preserves:
 * - Key decisions and conclusions
 * - Technical details and constraints
 * - User preferences and requirements
 * - Important context for ongoing conversation
 */

const SYSTEM_PROMPT = `You are summarizing older conversation messages to preserve context while reducing token count.

Your summary MUST preserve:
1. **Key Decisions**: What was decided, chosen, or concluded
2. **Technical Details**: Code snippets, configurations, error messages, API responses
3. **Constraints**: Limitations, requirements, deadlines mentioned
4. **User Preferences**: Stated preferences, working styles, project context
5. **Important Context**: Names, projects, files, technologies discussed

Format your summary as structured bullet points grouped by topic. Be comprehensive but concise.
Do NOT include conversational filler, greetings, or redundant information.
Focus on information that would be needed to continue the conversation effectively.

Example format:
## Project Context
- Working on [project name] using [technologies]
- Goal: [main objective]

## Key Decisions
- Decided to use [approach] because [reason]
- Ruled out [alternative] due to [constraint]

## Technical Details
- [Relevant code/config snippets]
- [Error messages or API responses that matter]

## Open Items
- [Unresolved questions or pending tasks]`;

export async function POST(req: Request) {
  try {
    const {
      messages,
      providerId = "openrouter",
      providerBaseUrl,
      apiKey,
      maxSummaryTokens = 2000
    } = await req.json();

    if (!messages || messages.length === 0) {
      return new Response(JSON.stringify({
        error: "No messages provided"
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Require user-provided API key
    if (!apiKey) {
      return new Response(JSON.stringify({
        summary: "",
        error: "API key required for summarization"
      }), {
        status: 200, // Don't crash UI
        headers: { "Content-Type": "application/json" },
      });
    }

    const configuredModel = DEFAULT_UTILITY_MODELS[providerId] || "gpt-4o-mini";

    // Format messages for summarization
    const formattedMessages = messages.map((m: any, idx: number) => {
      const role = m.role === "user" ? "User" : "Assistant";
      const content = typeof m.content === "string"
        ? m.content
        : Array.isArray(m.content)
          ? m.content
              .filter((p: any) => p.type === "text")
              .map((p: any) => p.text || "")
              .join("\n")
          : "[Complex content]";

      // Include timestamp if available for context
      const timestamp = m.createdAt
        ? new Date(m.createdAt).toLocaleString()
        : `Message ${idx + 1}`;

      return `[${timestamp}] ${role}:\n${content}`;
    }).join("\n\n---\n\n");

    const { text, usage } = await generateSimpleText({
      providerId,
      providerBaseUrl,
      modelId: configuredModel,
      apiKey,
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: `Please summarize the following ${messages.length} messages:\n\n${formattedMessages}`,
        },
      ],
      maxTokens: maxSummaryTokens,
      temperature: 0.3, // Low temperature for consistent summaries
    });

    const summary = text.trim();

    return new Response(JSON.stringify({
      summary,
      originalMessageCount: messages.length,
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
      cost: usage?.cost ?? 0,
    }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("[context-summary] Generation failed:", error);
    return new Response(JSON.stringify({
      summary: "",
      error: error.message || "Summary generation failed",
    }), {
      status: 200, // Return 200 so fallback can trigger
      headers: { "Content-Type": "application/json" },
    });
  }
}
