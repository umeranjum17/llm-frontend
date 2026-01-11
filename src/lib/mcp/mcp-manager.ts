import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { z } from "zod";
import { McpServer } from "@/lib/db/schema";

/**
 * Safety guard: Validate that URL is HTTPS and not localhost/private IP
 */
function validateRemoteUrl(urlString: string): { valid: boolean; error?: string } {
  try {
    const url = new URL(urlString);

    // Must be HTTPS
    if (url.protocol !== 'https:') {
      return { valid: false, error: 'Only HTTPS URLs are allowed for remote MCP servers' };
    }

    // Block localhost
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1') {
      return { valid: false, error: 'Localhost URLs are not allowed for security reasons' };
    }

    // Block private IP ranges (basic check)
    if (
      url.hostname.startsWith('192.168.') ||
      url.hostname.startsWith('10.') ||
      url.hostname.startsWith('172.16.') ||
      url.hostname.startsWith('172.17.') ||
      url.hostname.startsWith('172.18.') ||
      url.hostname.startsWith('172.19.') ||
      url.hostname.startsWith('172.20.') ||
      url.hostname.startsWith('172.21.') ||
      url.hostname.startsWith('172.22.') ||
      url.hostname.startsWith('172.23.') ||
      url.hostname.startsWith('172.24.') ||
      url.hostname.startsWith('172.25.') ||
      url.hostname.startsWith('172.26.') ||
      url.hostname.startsWith('172.27.') ||
      url.hostname.startsWith('172.28.') ||
      url.hostname.startsWith('172.29.') ||
      url.hostname.startsWith('172.30.') ||
      url.hostname.startsWith('172.31.')
    ) {
      return { valid: false, error: 'Private IP addresses are not allowed' };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: 'Invalid URL format' };
  }
}

export class McpManager {
  private clients: Map<string, Client> = new Map();
  private readonly DEFAULT_TOOL_CAP = 50; // Maximum tools per server by default
  private static instance: McpManager | null = null;

  /**
   * Get the singleton instance of McpManager
   * This ensures connection pooling across requests
   */
  static getInstance(): McpManager {
    if (!McpManager.instance) {
      McpManager.instance = new McpManager();
    }
    return McpManager.instance;
  }

  async connect(server: McpServer): Promise<Client> {
    if (this.clients.has(server.id)) {
      const client = this.clients.get(server.id);
      if (client) return client;
    }

    try {
      // Validate URL for remote servers
      const validation = validateRemoteUrl(server.url);
      if (!validation.valid) {
        throw new Error(validation.error || 'Invalid URL');
      }

      if (server.type !== 'sse') {
        throw new Error(`Unsupported transport type: ${server.type}. Only 'sse' is supported.`);
      }

      const transport = new SSEClientTransport(new URL(server.url), {
        eventSourceInit: {
          headers: server.apiKey ? { Authorization: `Bearer ${server.apiKey}` } : undefined,
        } as any
      });

      const client = new Client({
        name: "Lumina",
        version: "1.0.0",
      }, {
        capabilities: {
          tools: {},
        } as any
      });

      await client.connect(transport);
      this.clients.set(server.id, client);
      console.log(`[MCP] Connected to ${server.name} (${server.url})`);
      return client;

    } catch (error) {
      console.error(`[MCP] Failed to connect to ${server.name}:`, error);
      throw error;
    }
  }

  /**
   * Test connection to an MCP server and return tools list
   */
  async testConnection(server: McpServer): Promise<{
    success: boolean;
    tools?: any[];
    toolCount?: number;
    error?: string;
  }> {
    try {
      const client = await this.connect(server);
      const { tools } = await client.listTools();

      return {
        success: true,
        tools,
        toolCount: tools.length
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async getTools(servers: McpServer[]): Promise<Record<string, any>> {
    const allTools: Record<string, any> = {};

    for (const server of servers) {
      if (!server.enabled) continue;

      try {
        const client = await this.connect(server);
        const { tools } = await client.listTools();

        // Get disabled tools from policy
        const disabledTools = new Set(server.toolPolicy?.disabledTools || []);

        // Apply tool cap (max tools per server)
        const toolCap = server.toolCaps || this.DEFAULT_TOOL_CAP;
        let addedCount = 0;

        for (const tool of tools) {
          // Skip if tool is disabled
          if (disabledTools.has(tool.name)) {
            console.log(`[MCP] Skipping disabled tool: ${tool.name} from ${server.name}`);
            continue;
          }

          // Apply tool cap
          if (addedCount >= toolCap) {
            console.warn(`[MCP] Tool cap (${toolCap}) reached for ${server.name}, skipping remaining tools`);
            break;
          }

          // Namespace tools with server ID to avoid collisions and provide stable names
          const toolName = `${server.id}/${tool.name}`;

          allTools[toolName] = {
            description: tool.description,
            parameters: z.object({}).passthrough(),
            execute: async (args: any) => {
              try {
                console.log(`[MCP] Executing ${tool.name} on ${server.name} with args:`, args);
                const result = await client.callTool({
                  name: tool.name,
                  arguments: args,
                });
                console.log(`[MCP] Tool ${tool.name} completed successfully`);
                return result;
              } catch (error) {
                console.error(`[MCP] Tool execution failed for ${tool.name}:`, error);
                // Return structured error instead of throwing
                return {
                  content: [{
                    type: "text" as const,
                    text: `Error executing ${tool.name}: ${error instanceof Error ? error.message : 'Unknown error'}`
                  }],
                  isError: true
                };
              }
            }
          };

          addedCount++;
        }

        console.log(`[MCP] Loaded ${addedCount} tools from ${server.name} (${tools.length} total, ${disabledTools.size} disabled)`);
      } catch (error) {
        console.warn(`[MCP] Skipping server ${server.name} due to error:`, error);
      }
    }

    return allTools;
  }

  async cleanup() {
    for (const [id, client] of this.clients) {
      try {
        await client.close();
      } catch (e) {
        // ignore
      }
    }
    this.clients.clear();
  }
}
