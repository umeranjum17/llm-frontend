import { z } from "zod";
import { ComposioToolExecutor } from "@/lib/composio/composio-tool-executor";
import type { McpServer } from "@/lib/db/schema";

export const runtime = "nodejs";

const MAX_INPUT_SIZE = 100000; // 100KB max input size

/**
 * Sanitize error messages to avoid leaking implementation details
 */
function sanitizeErrorMessage(error: unknown): string {
    if (!(error instanceof Error)) {
        return "Tool execution failed";
    }

    const message = error.message;

    // Whitelist of safe error patterns to pass through
    const safePatterns = [
        /^Tool not found:/i,
        /^No MCP servers/i,
        /^Invalid request/i,
        /rate limit/i,
        /timeout/i,
        /connection refused/i,
    ];

    for (const pattern of safePatterns) {
        if (pattern.test(message)) {
            return message;
        }
    }

    // Generic message for other errors
    return "Tool execution failed. Please try again.";
}

const RequestSchema = z.object({
  toolName: z.string().min(1),
  args: z.record(z.any()).optional(),
  input: z.string().optional(), // Fallback input if args not provided
  serverId: z.string().optional(), // Optional: specific server to use
  // Server config passed from client (since we can't access IndexedDB server-side)
  servers: z.array(z.object({
    id: z.string(),
    name: z.string(),
    url: z.string(),
    apiKey: z.string().optional(),
    enabled: z.boolean(),
    type: z.enum(["sse", "stdio"]),
    collection: z.enum(["curated", "custom"]),
    toolPolicy: z.object({
      disabledTools: z.array(z.string()).optional(),
    }).optional(),
    toolCaps: z.number().optional(),
  })).optional(),
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

    const { toolName, args, input, serverId, servers } = parsed.data;

    if (!servers || servers.length === 0) {
      return new Response(
        JSON.stringify({ error: "No MCP servers provided" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const executor = ComposioToolExecutor.getInstance();

    // Cast servers to McpServer type (we have required fields)
    const mcpServers = servers.map(s => ({
      ...s,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })) as McpServer[];

    // Get all tools to find the one we need
    const { tools, metadata } = await executor.getTools(mcpServers);

    // Find the tool by name (fullName)
    const toolMeta = metadata.find(m => m.fullName === toolName || m.toolName === toolName);
    if (!toolMeta) {
      return new Response(
        JSON.stringify({
          error: `Tool not found: ${toolName}`,
          availableTools: metadata.map(m => m.fullName)
        }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get the tool executor
    const tool = tools[toolMeta.fullName];
    if (!tool || !tool.execute) {
      return new Response(
        JSON.stringify({ error: `Tool ${toolName} has no execute function` }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Build arguments
    // If args provided, use them; otherwise use input as a fallback
    let toolArgs = args || {};
    if (Object.keys(toolArgs).length === 0 && input) {
      // Validate input size to prevent DoS
      if (typeof input !== "string" || input.length > MAX_INPUT_SIZE) {
        return new Response(
          JSON.stringify({ error: "Invalid input: must be a string under 100KB" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      // Try to parse input as JSON, otherwise use as a query/input param
      try {
        const parsed = JSON.parse(input);
        // Ensure parsed result is a plain object (not array or primitive)
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          toolArgs = parsed;
        } else {
          toolArgs = { query: input, input: input };
        }
      } catch {
        // Only use as raw input if it doesn't look like malformed JSON
        if (!input.startsWith("{") && !input.startsWith("[")) {
          toolArgs = { query: input, input: input };
        } else {
          return new Response(
            JSON.stringify({ error: "Invalid JSON in input parameter" }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
      }
    }


    // Execute the tool
    const result = await tool.execute(toolArgs);


    return new Response(
      JSON.stringify({
        result,
        toolName: toolMeta.fullName,
        serverName: toolMeta.serverName,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[Composio Execute] Error:", error);
    const errorMessage = sanitizeErrorMessage(error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
