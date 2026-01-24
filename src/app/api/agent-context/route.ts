import { NextRequest } from "next/server";
import { ComposioToolExecutor } from "@/lib/composio/composio-tool-executor";
import { getActiveMcpServersForChat } from "@/lib/db/queries";
import { MODELS } from "@/lib/constants/models";
import { isImageGenerationModel } from "@/lib/constants/model-capabilities";

export const runtime = "nodejs";

/**
 * API endpoint to fetch available tools and models for agent creation/editing skills
 * This provides context to the AI when creating agents
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { chatId, mcpServerIds } = body;

    // Fetch MCP servers and their tools
    let toolsList: Array<{ name: string; description?: string; server: string }> = [];
    if (mcpServerIds && Array.isArray(mcpServerIds) && mcpServerIds.length > 0) {
      try {
        const mcpServers = await getActiveMcpServersForChat(mcpServerIds);
        const executor = ComposioToolExecutor.getInstance();
        const { tools, metadata } = await executor.getTools(mcpServers);
        
        // Build a concise list of available tools (cap at 50 to avoid token bloat)
        toolsList = metadata.slice(0, 50).map(m => ({
          name: m.fullName || m.toolName,
          description: m.description,
          server: m.serverName || "unknown",
        }));
      } catch (error) {
        console.error("[Agent Context] Failed to fetch tools:", error);
        // Continue without tools - not critical
      }
    }

    // Get available models (cap at 30 per provider to avoid token bloat)
    const modelsByProvider: Record<string, Array<{ id: string; name: string; provider: string }>> = {};
    const providers = new Set<string>();
    
    MODELS.forEach(model => {
      const provider = model.provider;
      providers.add(provider);
      if (!modelsByProvider[provider]) {
        modelsByProvider[provider] = [];
      }
      if (modelsByProvider[provider].length < 30) {
        modelsByProvider[provider].push({
          id: model.id,
          name: model.name,
          provider: model.provider,
        });
      }
    });

    // Build context message
    let contextMessage = "## Available Resources for Agent Creation\n\n";

    if (toolsList.length > 0) {
      contextMessage += `### Available Tools (${toolsList.length} shown)\n`;
      toolsList.forEach(tool => {
        contextMessage += `- **${tool.name}**`;
        if (tool.description) {
          contextMessage += `: ${tool.description}`;
        }
        contextMessage += ` (from ${tool.server})\n`;
      });
      contextMessage += "\n";
    } else {
      contextMessage += "### Available Tools\nNo MCP tools configured. Agents can still use LLM capabilities.\n\n";
    }

    contextMessage += `### Available Models by Provider\n`;
    for (const provider of Array.from(providers).sort()) {
      const models = modelsByProvider[provider];
      if (models.length > 0) {
        contextMessage += `\n**${provider}**:\n`;
        models.forEach(model => {
          const isImage = isImageGenerationModel(model.id);
          contextMessage += `- ${model.id}${isImage ? " (image generation)" : ""}\n`;
        });
      }
    }

    return new Response(
      JSON.stringify({
        tools: toolsList,
        modelsByProvider,
        contextMessage,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[Agent Context API] Error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch agent context" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
