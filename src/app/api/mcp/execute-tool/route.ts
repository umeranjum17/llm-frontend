import { z } from "zod";
import { McpManager } from "@/lib/mcp/mcp-manager";
import type { McpServer } from "@/lib/db/schema";

export const runtime = "nodejs";

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

    const manager = McpManager.getInstance();

    // Cast servers to McpServer type (we have required fields)
    const mcpServers = servers.map(s => ({
      ...s,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })) as McpServer[];

    // Get all tools to find the one we need
    const { tools, metadata } = await manager.getTools(mcpServers);

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
      // Try to parse input as JSON, otherwise use as a query/input param
      try {
        toolArgs = JSON.parse(input);
      } catch {
        // Use input as a generic query parameter if the tool accepts it
        toolArgs = { query: input, input: input };
      }
    }

    console.log(`[MCP Execute] Running tool ${toolMeta.fullName} with args:`, toolArgs);

    // Execute the tool
    const result = await tool.execute(toolArgs);

    console.log(`[MCP Execute] Tool ${toolMeta.fullName} completed`);

    return new Response(
      JSON.stringify({
        result,
        toolName: toolMeta.fullName,
        serverName: toolMeta.serverName,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[MCP Execute] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Tool execution failed";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
