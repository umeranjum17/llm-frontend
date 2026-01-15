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
 * Some providers (notably Google/Gemini via OpenRouter) enforce strict tool/function naming:
 * - Must start with a letter or underscore
 * - Allowed chars: a-zA-Z0-9 _ . : -
 * - Max length: 64
 *
 * MCP server IDs (e.g. nanoid) can start with digits, and tool names can contain invalid chars
 * or be too long. We generate a safe, deterministic name with a short hash to avoid collisions.
 */
function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // 32-bit FNV-1a prime
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function sanitizeToolFunctionName(raw: string): string {
  // Replace invalid chars with underscore
  let name = raw.replace(/[^a-zA-Z0-9_.:-]/g, "_");
  // Must start with a letter or underscore
  if (!/^[a-zA-Z_]/.test(name)) {
    name = `mcp_${name}`;
  }
  // Hard cap length
  if (name.length > 64) {
    name = name.slice(0, 64);
  }
  return name;
}

function buildSafeMcpToolName(serverId: string, toolName: string): string {
  const hash = fnv1a32(`${serverId}::${toolName}`).toString(36);
  // Keep tool name reasonably readable, but bounded.
  const toolPart = sanitizeToolFunctionName(toolName).slice(0, 40);
  return sanitizeToolFunctionName(`mcp_${hash}_${toolPart}`);
}

/**
 * Convert JSON Schema to Zod schema for proper AI SDK compatibility.
 * This ensures tool parameters are properly typed instead of using generic z.record(z.any()).
 *
 * Properties not in the 'required' array are made optional with .optional().
 */
function jsonSchemaToZod(schema: any, isTopLevel: boolean = true, requiredProps?: Set<string>, propName?: string): z.ZodTypeAny {
  // Fallback for missing or invalid schemas
  if (!schema || typeof schema !== 'object') {
    return z.any().describe("Any value");
  }

  // Handle object type (most common for tool parameters)
  if (schema.type === "object" || schema.properties) {
    const properties = schema.properties || {};
    const required = new Set<string>(schema.required || []);

    const shape: Record<string, z.ZodTypeAny> = {};
    for (const [key, prop] of Object.entries(properties)) {
      const propSchema = prop as any;

      // Skip properties without any type info
      if (!propSchema || typeof propSchema !== 'object') {
        console.warn(`[MCP] Skipping property '${key}' without schema`);
        continue;
      }

      let zodType = jsonSchemaToZod(propSchema, false, undefined, key);

      // Add description if available
      if (propSchema.description) {
        zodType = zodType.describe(propSchema.description);
      }

      // Make optional if not in required array
      if (!required.has(key)) {
        zodType = zodType.optional();
      }

      shape[key] = zodType;
    }

    // Use passthrough to allow additional properties (more lenient)
    return z.object(shape).passthrough();
  }

  // Handle primitive types
  switch (schema.type) {
    case "string":
      if (schema.enum && Array.isArray(schema.enum) && schema.enum.length > 0) {
        return z.enum(schema.enum as [string, ...string[]]);
      }
      return z.string();

    case "number":
    case "integer":
      return z.number();

    case "boolean":
      return z.boolean();

    case "array":
      const itemSchema = schema.items ? jsonSchemaToZod(schema.items, false) : z.string();
      return z.array(itemSchema);

    case "null":
      return z.null();

    default:
      // Handle anyOf/oneOf by taking the first option (simplified)
      if (schema.anyOf && Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
        return jsonSchemaToZod(schema.anyOf[0], false);
      }
      if (schema.oneOf && Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
        return jsonSchemaToZod(schema.oneOf[0], false);
      }

      // For unknown types or missing type field, use z.any() to be lenient
      // This allows the LLM to pass any value without validation errors
      console.warn('[MCP] Unknown schema type, using any:', schema.type || 'undefined');
      return z.any().describe(schema.description || "Value");
  }
}

/**
 * Safety guard: Validate that URL is a valid Composio URL.
 * STRICT: Only allows *.composio.dev domains.
 */
function validateRemoteUrl(urlString: string): { valid: boolean; error?: string } {
  try {
    const url = new URL(urlString);

    // Must be HTTPS
    if (url.protocol !== 'https:') {
      return { valid: false, error: 'Only HTTPS URLs are allowed for remote MCP servers' };
    }

    // STRICT: Only allow composio.dev subdomains
    if (!url.hostname.endsWith('composio.dev') || (!url.hostname.endsWith('.composio.dev') && url.hostname !== 'composio.dev')) {
      return { valid: false, error: 'Security restriction: Only composio.dev domains are allowed.' };
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

  // Explicit SSE endpoint wins, even for Composio domains.
  // Some Composio docs/registry entries use /sse, which must use SSE transport.
  if (urlLower.includes('/sse')) {
    return 'sse';
  }

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

interface CachedTools {
  tools: Record<string, any>;
  metadata: ToolMetadata[];
  timestamp: number;
}

export class McpManager {
  private clients: Map<string, Client> = new Map();
  private readonly DEFAULT_TOOL_CAP = 50; // Maximum tools per server by default
  private static instance: McpManager | null = null;

  // Tools cache: key is a hash of enabled server IDs, value is the cached tools
  private toolsCache: Map<string, CachedTools> = new Map();
  private readonly TOOLS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache TTL

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
   * Generate a unique key for a server connection
   * Includes server ID, API key hash, and headers hash to ensure:
   * - Different users don't share connections
   * - Session changes (e.g., Composio toolkit changes) create new connections
   */
  private getServerConnectionKey(server: McpServer): string {
    const apiKeyHash = server.apiKey ? fnv1a32(server.apiKey).toString(36) : 'nokey';
    // Also hash headers for servers that use header-based auth (like Composio sessions)
    const headersHash = server.headers ? fnv1a32(JSON.stringify(server.headers)).toString(36) : 'noheaders';
    return `${server.id}:${apiKeyHash}:${headersHash}`;
  }

  /**
   * Generate a cache key from enabled servers configuration
   * Includes server IDs, API key hashes, headers hash, and tool policies to ensure:
   * - Per-user caching
   * - Cache invalidation when sessions change (e.g., Composio toolkit changes)
   */
  private generateCacheKey(servers: McpServer[]): string {
    const enabledServers = servers
      .filter(s => s.enabled)
      .map(s => {
        const apiKeyHash = s.apiKey ? fnv1a32(s.apiKey).toString(36) : 'nokey';
        const headersHash = s.headers ? fnv1a32(JSON.stringify(s.headers)).toString(36) : 'noheaders';
        return `${s.id}:${apiKeyHash}:${headersHash}:${s.toolCaps || this.DEFAULT_TOOL_CAP}:${(s.toolPolicy?.disabledTools || []).sort().join(',')}`;
      })
      .sort()
      .join('|');
    return enabledServers;
  }

  /**
   * Create transport based on URL pattern
   */
  private createTransport(server: McpServer) {
    const transportType = detectTransportType(server.url);

    // Build headers based on server configuration
    // First check for explicit headers (Composio Tool Router uses this)
    // Then fall back to apiKey-based headers
    let headers: Record<string, string> | undefined;

    if (server.headers && Object.keys(server.headers).length > 0) {
      // Use explicit headers from server config (e.g., Composio sessions)
      headers = { ...server.headers };
    } else if (server.apiKey) {
      // Fall back to apiKey-based auth
      if (server.url.includes('composio.dev')) {
        headers = { 'x-api-key': server.apiKey };
      } else {
        headers = { 'Authorization': `Bearer ${server.apiKey}` };
      }
    }

    console.log(`[MCP] Using ${transportType} transport for ${server.name} (${server.url})`, headers ? 'with headers' : 'no auth');

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
    // Use composite key including API key hash to prevent cross-user connection sharing
    const connectionKey = this.getServerConnectionKey(server);

    if (this.clients.has(connectionKey)) {
      const client = this.clients.get(connectionKey);
      if (client) return client;
    }

    try {
      // Validate URL for remote servers
      const validation = validateRemoteUrl(server.url);
      if (!validation.valid) {
        throw new Error(validation.error || 'Invalid URL');
      }

      const client = await this.connectWithRetry(server);
      this.clients.set(connectionKey, client);
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
    // Check cache first
    const cacheKey = this.generateCacheKey(servers);
    const cached = this.toolsCache.get(cacheKey);

    if (cached && (Date.now() - cached.timestamp) < this.TOOLS_CACHE_TTL_MS) {
      console.log(`[MCP] Using cached tools (${cached.metadata.length} tools, age: ${Math.round((Date.now() - cached.timestamp) / 1000)}s)`);
      return { tools: cached.tools, metadata: cached.metadata };
    }

    console.log(`[MCP] Cache miss or expired, fetching tools...`);
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

          // Build a provider-safe tool/function name.
          // We also keep server/tool metadata for UX (display names) separately.
          const fullName = buildSafeMcpToolName(server.id, tool.name);

          metadata.push({
            fullName,
            serverName: server.name,
            toolName: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
          });

          // Convert JSON Schema to Zod for proper AI SDK compatibility
          console.log(`[MCP] Converting schema for ${tool.name}:`, JSON.stringify(tool.inputSchema).substring(0, 200));
          const zodParameters = jsonSchemaToZod(tool.inputSchema);
          console.log(`[MCP] Converted to Zod schema for ${tool.name}`);

          allTools[fullName] = {
            description: tool.description || "MCP tool",
            parameters: zodParameters,
            execute: async (args: any) => {
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
              ]) as any;

              console.log(`[MCP] Tool ${tool.name} completed successfully`);

              // Extract text content from MCP result format
              // MCP returns: { content: [{ type: "text", text: "..." }], isError: boolean }
              if (result?.content && Array.isArray(result.content)) {
                const textParts = result.content
                  .filter((c: any) => c.type === "text" && c.text)
                  .map((c: any) => c.text);

                if (textParts.length > 0) {
                  const extractedText = textParts.join("\n");
                  // If it looks like JSON, try to parse and return as object for better model interpretation
                  if (extractedText.trim().startsWith("{") || extractedText.trim().startsWith("[")) {
                    try {
                      return JSON.parse(extractedText);
                    } catch {
                      return extractedText;
                    }
                  }
                  return extractedText;
                }
              }

              // Return raw result if we can't extract text content
              return result;
            }
          };

          addedCount++;
        }

        console.log(`[MCP] Loaded ${addedCount} tools from ${server.name}`);
      } catch (error) {
        console.warn(`[MCP] Skipping ${server.name}:`, error instanceof Error ? error.message : error);
      }
    }

    // Cache the result
    this.toolsCache.set(cacheKey, {
      tools: allTools,
      metadata,
      timestamp: Date.now()
    });
    console.log(`[MCP] Cached ${metadata.length} tools`);

    return { tools: allTools, metadata };
  }

  /**
   * Invalidate tools cache (call when server config changes)
   */
  invalidateToolsCache() {
    this.toolsCache.clear();
    console.log(`[MCP] Tools cache invalidated`);
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

    let instructions = "You have access to the following external tools via MCP plugins. Use the exact tool name shown (provider-safe).\n\n";

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
    this.toolsCache.clear();
  }
}
