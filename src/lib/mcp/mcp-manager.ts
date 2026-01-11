import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { z } from "zod";
import { McpServer } from "@/lib/db/schema";

export interface ToolMetadata {
  fullName: string;        // "server_id/tool_name"
  serverName: string;      // User-friendly server name
  toolName: string;        // Original tool name
  description: string;     // Tool description from MCP
  inputSchema?: any;       // Tool parameters schema
}

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

/**
 * Detect transport type from URL pattern
 * - URLs ending in /sse or containing /sse? use SSE
 * - URLs containing /mcp or Composio URLs use Streamable HTTP
 * - Default to SSE for backwards compatibility
 */
function detectTransportType(url: string): 'sse' | 'streamableHttp' {
  const urlLower = url.toLowerCase();

  // Composio and similar modern MCP servers use Streamable HTTP
  if (urlLower.includes('composio.dev')) {
    return 'streamableHttp';
  }

  // Explicit /mcp endpoint (not /mcp/sse) suggests Streamable HTTP
  if (urlLower.match(/\/mcp(?:\?|$)/) && !urlLower.includes('/sse')) {
    return 'streamableHttp';
  }

  // Default to SSE for backwards compatibility
  return 'sse';
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

  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY_MS = 1000;
  private readonly TIMEOUT_MS = 10000; // 10s timeout for MCP operations

  /**
   * Create transport based on URL pattern
   */
  private createTransport(server: McpServer) {
    const transportType = detectTransportType(server.url);
    const headers = server.apiKey ? { Authorization: `Bearer ${server.apiKey}` } : undefined;

    console.log(`[MCP] Using ${transportType} transport for ${server.name} (${server.url})`);

    if (transportType === 'streamableHttp') {
      return new StreamableHTTPClientTransport(new URL(server.url), {
        requestInit: {
          headers
        }
      });
    }

    // SSE transport (legacy)
    return new SSEClientTransport(new URL(server.url), {
      eventSourceInit: {
        headers
      } as any
    });
  }

  /**
   * Connect with retry logic and timeout
   */
  private async connectWithRetry(server: McpServer, attempt = 1): Promise<Client> {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Connection timeout after ${this.TIMEOUT_MS}ms`)), this.TIMEOUT_MS)
    );

    try {
      const transport = this.createTransport(server);

      const client = new Client({
        name: "Lumina",
        version: "1.0.0",
      }, {
        capabilities: {
          tools: {},
        } as any
      });

      console.log(`[MCP] Establishing connection to ${server.name} (Attempt ${attempt})...`);

      // Wrap connect in timeout
      await Promise.race([
        client.connect(transport),
        timeoutPromise
      ]);

      console.log(`[MCP] Successfully connected to ${server.name}`);
      return client;
    } catch (error) {
      console.error(`[MCP] Connection attempt ${attempt} failed for ${server.name}:`, error instanceof Error ? error.message : error);

      if (attempt < this.MAX_RETRIES && !(error instanceof Error && error.message.includes('timeout'))) {
        console.log(`[MCP] Retrying ${server.name} in ${this.RETRY_DELAY_MS * attempt}ms...`);
        await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY_MS * attempt));
        return this.connectWithRetry(server, attempt + 1);
      }
      throw error;
    }
  }

  /**
   * Format user-friendly error message
   */
  private formatErrorMessage(error: unknown, server: McpServer): string {
    const errorMsg = error instanceof Error ? error.message : String(error);

    if (errorMsg.includes('fetch') || errorMsg.includes('network')) {
      return `Cannot reach ${server.name}. Check if the server URL is correct and accessible.`;
    }
    if (errorMsg.includes('401') || errorMsg.includes('unauthorized')) {
      return `Authentication failed for ${server.name}. Check your API key.`;
    }
    if (errorMsg.includes('403') || errorMsg.includes('forbidden')) {
      return `Access denied to ${server.name}. Your API key may lack required permissions.`;
    }
    if (errorMsg.includes('404')) {
      return `MCP endpoint not found at ${server.url}. Verify the URL is correct.`;
    }
    if (errorMsg.includes('timeout') || errorMsg.includes('ETIMEDOUT')) {
      return `Connection to ${server.name} timed out. The server may be slow or unreachable.`;
    }
    if (errorMsg.includes('certificate') || errorMsg.includes('SSL')) {
      return `SSL/TLS error connecting to ${server.name}. The server may have certificate issues.`;
    }
    return errorMsg;
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

      const client = await this.connectWithRetry(server);
      this.clients.set(server.id, client);
      return client;
    } catch (error) {
      const userMessage = this.formatErrorMessage(error, server);
      console.error(`[MCP] Final connection failure for ${server.name}:`, userMessage);
      throw new Error(userMessage);
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

  async getTools(servers: McpServer[]): Promise<{ tools: Record<string, any>; metadata: ToolMetadata[] }> {
    const allTools: Record<string, any> = {};
    const metadata: ToolMetadata[] = [];

    for (const server of servers) {
      if (!server.enabled) continue;

      try {
        console.log(`[MCP] Fetching tools for ${server.name}...`);
        const client = await this.connect(server);

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`listTools timeout after ${this.TIMEOUT_MS}ms`)), this.TIMEOUT_MS)
        );

        // Wrap listTools in timeout
        const { tools } = await Promise.race([
          client.listTools(),
          timeoutPromise
        ]) as { tools: any[] };

        // Get disabled tools from policy
        const disabledTools = new Set(server.toolPolicy?.disabledTools || []);

        // Apply tool cap (max tools per server)
        const toolCap = server.toolCaps || this.DEFAULT_TOOL_CAP;
        let addedCount = 0;

        for (const tool of tools) {
          // Skip if tool is disabled
          if (disabledTools.has(tool.name)) {
            continue;
          }

          // Apply tool cap
          if (addedCount >= toolCap) {
            console.warn(`[MCP] Tool cap (${toolCap}) reached for ${server.name}`);
            break;
          }

          // Namespace tools with server ID to avoid collisions
          const fullName = `${server.id}/${tool.name}`;

          metadata.push({
            fullName,
            serverName: server.name,
            toolName: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
          });

          allTools[fullName] = {
            description: tool.description,
            parameters: z.record(z.any()), // Use z.record(z.any()) to allow all tool inputs as passed through
            execute: async (args: any) => {
              try {
                console.log(`[MCP] Executing ${tool.name} on ${server.name} with args:`, JSON.stringify(args));

                const execTimeoutPromise = new Promise((_, reject) =>
                  setTimeout(() => reject(new Error(`Execution timeout after 30s`)), 30000)
                );

                const result = await Promise.race([
                  client.callTool({
                    name: tool.name,
                    arguments: args,
                  }),
                  execTimeoutPromise
                ]);

                console.log(`[MCP] Tool ${tool.name} completed successfully`);
                return result;
              } catch (error) {
                console.error(`[MCP] Tool execution failed for ${tool.name}:`, error);
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

        console.log(`[MCP] Loaded ${addedCount} tools from ${server.name}`);
      } catch (error) {
        console.warn(`[MCP] Skipping ${server.name}:`, error instanceof Error ? error.message : error);
      }
    }

    return { tools: allTools, metadata };
  }

  /**
   * Build structured system instructions for MCP tools
   */
  buildToolInstructions(metadata: ToolMetadata[]): string {
    if (metadata.length === 0) return "";

    const groupedByServer = metadata.reduce((acc, tool) => {
      if (!acc[tool.serverName]) acc[tool.serverName] = [];
      acc[tool.serverName].push(tool);
      return acc;
    }, {} as Record<string, ToolMetadata[]>);

    let instructions = "You have access to the following external tools via MCP plugins. USE THE FULL NAMESPACED TOOL NAME (e.g., server_id/tool_name).\n\n";

    for (const [serverName, tools] of Object.entries(groupedByServer)) {
      instructions += `## ${serverName}\n`;
      for (const tool of tools) {
        const params = tool.inputSchema?.properties
          ? Object.keys(tool.inputSchema.properties).join(", ")
          : "none";
        instructions += `- \`${tool.fullName}\`: ${tool.description} (Params: ${params})\n`;
      }
      instructions += "\n";
    }

    instructions += "Always prefer using these tools for complex tasks or when direct integration is available.";
    return instructions;
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
