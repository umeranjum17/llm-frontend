import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { jsonSchema } from "ai";
import { McpServer } from "@/lib/db/schema";
import { type ToolCallingTier } from "@/lib/constants/model-capabilities";

/**
 * Router-first tool allowlist for Composio servers.
 *
 * Research shows that large tool lists degrade accuracy (BFCL, MCP-Bench).
 * By default, we only expose the router tools which let the model:
 * 1. COMPOSIO_SEARCH_TOOLS - Search for relevant tools
 * 2. MULTI_EXECUTE_TOOL - Execute searched tools
 *
 * This keeps the tool surface small and forces the search→execute pattern.
 */
export const COMPOSIO_ROUTER_TOOLS = [
  "COMPOSIO_SEARCH_TOOLS",    // Search for tools - MUST be called first
  "MULTI_EXECUTE_TOOL",       // Execute tools from search results
  // Helper tools that may be needed for session/auth management
  "COMPOSIO_CHECK_ACTIVE_CONNECTION",
  "COMPOSIO_INITIATE_CONNECTION",
  "COMPOSIO_GET_EXPECTED_PARAMS_FOR_USER",
] as const;

/**
 * Maximum number of tools to return from COMPOSIO_SEARCH_TOOLS.
 * Research shows even router-first fails if search returns 30-50 tools.
 * Cap at 8 to balance coverage vs accuracy.
 */
export const COMPOSIO_SEARCH_RESULTS_CAP = 8;

/**
 * Tool calling telemetry for debugging and improvement.
 */
export interface ToolCallTelemetry {
  timestamp: number;
  toolName: string;
  modelId?: string;
  success: boolean;
  error?: string;
  paramsMissing?: string[];
  executionTimeMs?: number;
}

// In-memory telemetry buffer (could be persisted later)
const telemetryBuffer: ToolCallTelemetry[] = [];
const MAX_TELEMETRY_ENTRIES = 100;

export function logToolTelemetry(entry: ToolCallTelemetry) {
  telemetryBuffer.push(entry);
  if (telemetryBuffer.length > MAX_TELEMETRY_ENTRIES) {
    telemetryBuffer.shift();
  }
  // Log to console for debugging
  if (!entry.success) {
    console.warn(`[MCP Telemetry] Tool failure:`, entry);
  }
}

export function getToolTelemetry(): ToolCallTelemetry[] {
  return [...telemetryBuffer];
}

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
 * Patch JSON Schema for OpenAI strict mode compatibility.
 *
 * OpenAI strict mode requires:
 * 1. All properties must be in the 'required' array
 * 2. additionalProperties must be false
 * 3. All types must be explicitly specified
 *
 * We patch the schema recursively to satisfy these requirements.
 * Using raw JSON Schema (via AI SDK's jsonSchema()) instead of Zod avoids
 * validation errors when the LLM omits optional fields.
 */
function patchSchemaForStrictMode(schema: any): any {
  if (!schema || typeof schema !== 'object') {
    return { type: "string" }; // Default to string for invalid schemas
  }

  // Deep clone to avoid mutating original
  const patched = JSON.parse(JSON.stringify(schema));

  return patchSchemaRecursive(patched);
}

function patchSchemaRecursive(schema: any): any {
  if (!schema || typeof schema !== 'object') {
    return schema;
  }

  // Handle object type
  if (schema.type === "object" || schema.properties) {
    schema.type = "object";
    schema.additionalProperties = false;

    if (schema.properties && typeof schema.properties === 'object') {
      // Make ALL properties required (OpenAI strict mode requirement)
      schema.required = Object.keys(schema.properties);

      // Recursively patch nested properties
      for (const key of Object.keys(schema.properties)) {
        schema.properties[key] = patchSchemaRecursive(schema.properties[key]);
      }
    } else {
      schema.properties = {};
      schema.required = [];
    }
  }

  // Handle array type - patch items schema
  if (schema.type === "array" && schema.items) {
    schema.items = patchSchemaRecursive(schema.items);
  }

  // Handle anyOf/oneOf - patch each variant
  if (schema.anyOf && Array.isArray(schema.anyOf)) {
    schema.anyOf = schema.anyOf.map(patchSchemaRecursive);
  }
  if (schema.oneOf && Array.isArray(schema.oneOf)) {
    schema.oneOf = schema.oneOf.map(patchSchemaRecursive);
  }

  // Ensure type is specified for primitives without type
  if (!schema.type && !schema.anyOf && !schema.oneOf && !schema.properties) {
    schema.type = "string"; // Default to string
  }

  return schema;
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
/**
 * Build a human-readable parameter guide from Composio tool schemas.
 * This helps smaller models understand required parameters for MULTI_EXECUTE_TOOL.
 *
 * The guide is injected into COMPOSIO_SEARCH_TOOLS results so models see it
 * exactly when they need it - right before calling MULTI_EXECUTE.
 */
function buildToolParameterGuide(toolSchemas: Record<string, any>): string {
  if (!toolSchemas || typeof toolSchemas !== 'object') return '';

  const entries = Object.entries(toolSchemas);
  if (entries.length === 0) return '';

  const lines: string[] = [
    '',
    '════════════════════════════════════════════════════════════════',
    '  ACTION REQUIRED: READ BEFORE CALLING MULTI_EXECUTE_TOOL',
    '════════════════════════════════════════════════════════════════',
    '',
  ];

  // Collect example for first tool with required params
  let exampleToolName: string | null = null;
  let exampleArgs: Record<string, any> = {};

  for (const [toolName, schema] of entries) {
    if (!schema?.properties) continue;

    const required = new Set(schema.required || []);
    const requiredParams: string[] = [];
    const optionalParams: string[] = [];

    for (const [param, def] of Object.entries(schema.properties)) {
      const d = def as any;
      const type = d.type || 'string';
      const desc = d.description ? ` — ${d.description.substring(0, 80)}` : '';

      if (required.has(param)) {
        requiredParams.push(`     ★ ${param} (${type})${desc}`);
        // Build example
        if (!exampleToolName) {
          exampleToolName = toolName;
          if (type === 'number' || type === 'integer') {
            exampleArgs[param] = 10;
          } else if (type === 'boolean') {
            exampleArgs[param] = true;
          } else {
            exampleArgs[param] = `<your_${param}>`;
          }
        }
      } else {
        optionalParams.push(param);
      }
    }

    lines.push(`  ${toolName}:`);
    if (requiredParams.length > 0) {
      lines.push('     REQUIRED:');
      lines.push(...requiredParams);
    } else {
      lines.push('     (no required parameters)');
    }
    if (optionalParams.length > 0) {
      lines.push(`     Optional: ${optionalParams.slice(0, 5).join(', ')}${optionalParams.length > 5 ? '...' : ''}`);
    }
    lines.push('');
  }

  // Add concrete example
  if (exampleToolName) {
    lines.push('────────────────────────────────────────────────────────────────');
    lines.push('  EXAMPLE MULTI_EXECUTE_TOOL CALL:');
    lines.push('────────────────────────────────────────────────────────────────');
    lines.push('');
    lines.push(JSON.stringify({
      tools: [{
        tool_slug: exampleToolName,
        arguments: exampleArgs
      }],
      session_id: '<use session.id from above>'
    }, null, 2));
    lines.push('');
  }

  lines.push('════════════════════════════════════════════════════════════════');
  lines.push('  ⚠️  NEVER call MULTI_EXECUTE_TOOL with empty arguments: {}');
  lines.push('  ⚠️  ALWAYS fill in ALL required (★) parameters above');
  lines.push('════════════════════════════════════════════════════════════════');
  lines.push('');

  return lines.join('\n');
}

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
   * Includes server ID, URL hash, API key hash, and headers hash to ensure:
   * - Different users don't share connections
   * - Session changes (e.g., Composio toolkit changes) create new connections
   */
  private getServerConnectionKey(server: McpServer): string {
    const urlHash = fnv1a32(server.url).toString(36);
    const apiKeyHash = server.apiKey ? fnv1a32(server.apiKey).toString(36) : 'nokey';
    // Also hash headers for servers that use header-based auth (like Composio sessions)
    const headersHash = server.headers ? fnv1a32(JSON.stringify(server.headers)).toString(36) : 'noheaders';
    return `${server.id}:${urlHash}:${apiKeyHash}:${headersHash}`;
  }

  /**
   * Generate a cache key from enabled servers configuration
   * Includes server IDs, URL hashes, API key hashes, headers hash, and tool policies to ensure:
   * - Per-user caching
   * - Cache invalidation when sessions change (e.g., Composio toolkit changes)
   */
  private generateCacheKey(servers: McpServer[]): string {
    const enabledServers = servers
      .filter(s => s.enabled)
      .map(s => {
        const urlHash = fnv1a32(s.url).toString(36);
        const apiKeyHash = s.apiKey ? fnv1a32(s.apiKey).toString(36) : 'nokey';
        const headersHash = s.headers ? fnv1a32(JSON.stringify(s.headers)).toString(36) : 'noheaders';
        return `${s.id}:${urlHash}:${apiKeyHash}:${headersHash}:${s.toolCaps || this.DEFAULT_TOOL_CAP}:${(s.toolPolicy?.disabledTools || []).sort().join(',')}`;
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

        // Check if this is a Composio server (for router-first mode)
        const isComposioServer = server.url.toLowerCase().includes('composio.dev') ||
                                  server.id.startsWith('composio-');

        // Log what tools Composio actually returned (detailed)
        if (isComposioServer) {
          console.log(`[MCP] ========== COMPOSIO TOOLS DEBUG ==========`);
          console.log(`[MCP] Composio listTools() returned ${tools.length} tools:`);
          tools.forEach((t, i) => {
            console.log(`[MCP]   ${i + 1}. ${t.name} - ${t.description?.substring(0, 80)}...`);
          });
          console.log(`[MCP] ==========================================`);
        }

        // Router-first: For Composio servers, we previously tried to filter to only
        // COMPOSIO_SEARCH_TOOLS + MULTI_EXECUTE_TOOL. However, Composio's tool router
        // may return different tool sets based on configuration:
        // - Some configs return only COMPOSIO_SEARCH_TOOLS (search-only mode)
        // - Some return SEARCH + EXECUTE (router-first mode)
        // - Some return all tools directly (legacy mode)
        //
        // Since we can't predict what Composio returns, we now:
        // 1. Let ALL tools through (no filtering)
        // 2. Adapt instructions based on what tools are actually available
        // 3. Power users can still use disableRouterFirst for explicit control
        const composioToolNames = new Set(tools.map(t => t.name));
        const hasSearchTool = composioToolNames.has('COMPOSIO_SEARCH_TOOLS');
        // Check both possible names for the execute tool
        const hasExecuteTool = composioToolNames.has('COMPOSIO_MULTI_EXECUTE_TOOL') || composioToolNames.has('MULTI_EXECUTE_TOOL');

        if (isComposioServer) {
          if (hasSearchTool && hasExecuteTool) {
            console.log(`[MCP] Composio router mode: search→execute (both tools present)`);
          } else if (hasSearchTool && !hasExecuteTool) {
            console.log(`[MCP] Composio router mode: search-only (execute tool not present)`);
          } else {
            console.log(`[MCP] Composio mode: direct tools (no search tool present)`);
          }
        }

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

          // Patch JSON Schema for strict mode compatibility (OpenAI, etc.)
          // Using jsonSchema() avoids Zod validation errors when LLM omits optional fields
          console.log(`[MCP] Patching schema for ${tool.name}:`, JSON.stringify(tool.inputSchema).substring(0, 200));
          const patchedSchema = patchSchemaForStrictMode(tool.inputSchema);
          console.log(`[MCP] Patched schema for ${tool.name}`);

          allTools[fullName] = {
            description: tool.description || "MCP tool",
            parameters: jsonSchema(patchedSchema),
            execute: async (args: any) => {
              const startTime = Date.now();
              console.log(`[MCP] Executing ${tool.name} on ${server.name} with args:`, JSON.stringify(args));

              // Check for empty/missing required args (common failure mode)
              const requiredParams = tool.inputSchema?.required || [];
              const missingParams = requiredParams.filter((p: string) =>
                args[p] === undefined || args[p] === null || args[p] === ''
              );

              if (missingParams.length > 0) {
                logToolTelemetry({
                  timestamp: Date.now(),
                  toolName: tool.name,
                  success: false,
                  error: 'Missing required parameters',
                  paramsMissing: missingParams,
                });
                console.warn(`[MCP] Tool ${tool.name} called with missing params: ${missingParams.join(', ')}`);
                // Don't fail - let the tool try anyway, but log for telemetry
              }

              try {
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

                const executionTimeMs = Date.now() - startTime;
                console.log(`[MCP] Tool ${tool.name} completed successfully in ${executionTimeMs}ms`);

                // Log success telemetry
                logToolTelemetry({
                  timestamp: Date.now(),
                  toolName: tool.name,
                  success: true,
                  executionTimeMs,
                });

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
                        const parsed = JSON.parse(extractedText);

                        // Enhance COMPOSIO_SEARCH_TOOLS results with parameter guide
                        // This helps smaller models understand required params for MULTI_EXECUTE
                        if (tool.name === 'COMPOSIO_SEARCH_TOOLS' && parsed?.data?.tool_schemas) {
                          // Log detailed search results for debugging
                          const schemas = parsed.data.tool_schemas;
                          const schemaKeys = Object.keys(schemas);
                          console.log(`[MCP] ========== COMPOSIO SEARCH RESULTS DEBUG ==========`);
                          console.log(`[MCP] Search returned ${schemaKeys.length} tool schemas:`);
                          schemaKeys.forEach((key, i) => {
                            console.log(`[MCP]   ${i + 1}. ${key}`);
                          });
                          if (parsed.data.session) {
                            console.log(`[MCP] Session:`, JSON.stringify(parsed.data.session));
                          }
                          if (parsed.data.next_steps_guidance) {
                            console.log(`[MCP] Next steps guidance:`, parsed.data.next_steps_guidance);
                          }
                          console.log(`[MCP] =====================================================`);

                          // Cap search results to prevent tool overload
                          if (schemaKeys.length > COMPOSIO_SEARCH_RESULTS_CAP) {
                            console.log(`[MCP] Capping search results from ${schemaKeys.length} to ${COMPOSIO_SEARCH_RESULTS_CAP} tools`);
                            const cappedSchemas: Record<string, any> = {};
                            schemaKeys.slice(0, COMPOSIO_SEARCH_RESULTS_CAP).forEach(key => {
                              cappedSchemas[key] = schemas[key];
                            });
                            parsed.data.tool_schemas = cappedSchemas;
                            parsed._search_capped = true;
                            parsed._original_count = schemaKeys.length;
                          }

                          const guide = buildToolParameterGuide(parsed.data.tool_schemas);
                          if (guide) {
                            parsed._parameter_guide = guide;
                            console.log(`[MCP] Injected parameter guide for ${Object.keys(parsed.data.tool_schemas).length} tool schemas`);
                          }
                        }

                        return parsed;
                      } catch {
                        return extractedText;
                      }
                    }
                    return extractedText;
                  }
                }

                // Return raw result if we can't extract text content
                return result;
              } catch (error) {
                const executionTimeMs = Date.now() - startTime;
                const errorMsg = error instanceof Error ? error.message : 'Unknown error';

                // Log failure telemetry
                logToolTelemetry({
                  timestamp: Date.now(),
                  toolName: tool.name,
                  success: false,
                  error: errorMsg,
                  executionTimeMs,
                });

                console.error(`[MCP] Tool ${tool.name} failed after ${executionTimeMs}ms:`, errorMsg);
                throw error;
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
  buildToolInstructions(metadata: ToolMetadata[], tier: ToolCallingTier = "basic"): string {
    if (metadata.length === 0) return "";

    const groupedByServer = metadata.reduce((acc, tool) => {
      if (!acc[tool.serverName]) acc[tool.serverName] = [];
      acc[tool.serverName].push(tool);
      return acc;
    }, {} as Record<string, ToolMetadata[]>);

    // Check if Composio tools are present (router-first mode)
    // Look up the ACTUAL provider-safe names the model must use
    const searchTool = metadata.find(t => t.toolName === 'COMPOSIO_SEARCH_TOOLS');
    // Check both possible names for the execute tool
    const executeTool = metadata.find(t => t.toolName === 'COMPOSIO_MULTI_EXECUTE_TOOL' || t.toolName === 'MULTI_EXECUTE_TOOL');
    const hasComposioSearchOnly = searchTool && !executeTool;
    const hasComposioSearchAndExecute = searchTool && executeTool;

    let instructions = "You have access to the following external tools via MCP plugins. Use the exact tool name shown (provider-safe).\n\n";

    // Add Composio-specific instructions based on what tools are actually available
    if (hasComposioSearchAndExecute) {
      // Full router-first flow: search → execute
      instructions += `## ⚠️ CRITICAL: Composio Tool Usage Rules

**MANDATORY WORKFLOW - You MUST follow this order:**

1. **ALWAYS call \`${searchTool.fullName}\` first** before any execute call
   - Search describes what action you need (e.g., "send email", "create github issue")
   - The search returns tool schemas with required parameters

2. **Follow the returned plan from search results:**
   - Execute \`recommended_plan_steps\` sequentially - these are optimized for the task
   - Check \`known_pitfalls\` before each tool call to avoid common errors
   - Use \`tool_schemas\` for exact parameter requirements
   - Only execute steps marked "Required" - skip "Optional" steps unless needed

3. **THEN call \`${executeTool.fullName}\`** with the exact tool_slug from search results
   - Use the parameter guide in search results to fill ALL required parameters
   - NEVER call with empty arguments \`{}\` - this will fail

4. **ALWAYS follow \`next_steps\` guidance in tool responses:**
   - Tool responses include \`next_steps\` telling you what to do (or NOT do) next
   - If \`next_steps\` says "DO NOT call workbench tools" - do NOT call them
   - This runtime guidance overrides optional steps in the original plan

5. **If \`${executeTool.fullName}\` fails:**
   - Check the error message for missing parameters
   - Re-read the _parameter_guide from search results
   - Retry with correct parameters, or ask the user for missing information

**NEVER skip the search tool and guess tool names - this causes failures.**

`;
    } else if (hasComposioSearchOnly) {
      // Search-only mode: search returns tool schemas, call those tools directly
      instructions += `## ⚠️ CRITICAL: Composio Tool Usage Rules

**WORKFLOW:**

1. **First call \`${searchTool.fullName}\`** to find available tools
   - Search describes what action you need (e.g., "send email", "search reddit")
   - The search returns tool_schemas with the tools you can call

2. **Follow the returned plan from search results:**
   - Execute \`recommended_plan_steps\` sequentially - these are optimized by Composio for the task
   - Check \`known_pitfalls\` before each tool call to avoid common errors (e.g., pagination limits, rate limits, response shapes)
   - Use \`tool_schemas\` for exact parameter requirements
   - Focus on "Required" steps first - skip "Optional" steps unless specifically needed

3. **Then call the specific tools** returned in the search results (e.g., REDDIT_SEARCH_ACROSS_SUBREDDITS)
   - Use the exact tool names from the tool_schemas in search results
   - Fill ALL required parameters as shown in the _parameter_guide

4. **ALWAYS follow \`next_steps\` guidance in tool responses:**
   - Tool responses include \`next_steps\` telling you what to do (or NOT do) next
   - If \`next_steps\` says "DO NOT call workbench tools" - do NOT call them
   - This runtime guidance overrides optional steps in the original plan

**NEVER guess tool names - always search first to find available tools.**

`;
    }

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

    instructions += "Only use these tools when external service integration is explicitly needed (e.g., posting to Reddit, sending emails, fetching live data). For tasks you can do directly (writing code, answering questions, creating content), respond without tools.\n";

    // Add tier-based efficiency guidance
    const tierGuidance: Record<ToolCallingTier, string> = {
      none: "",
      basic: "Complete tool operations in 2-3 calls maximum. ",
      advanced: "Complete tool operations in 4-5 calls. ",
      elite: "Use as many tool calls as needed for complex tasks. ",
    };

    instructions += "\n## Response Requirements\n";
    instructions += tierGuidance[tier] || tierGuidance.basic;
    instructions += "After completing tool operations, ALWAYS provide a final text response summarizing what was accomplished. ";
    instructions += "Never end your turn with only tool calls.\n";

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
