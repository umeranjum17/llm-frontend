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
 * Global tool blacklist - tools that cause issues and should never be exposed.
 * These are automatically filtered out regardless of server configuration.
 *
 * COMPOSIO_MANAGE_CONNECTIONS - Causes token waste loop:
 *   1. Connection already exists but Composio reports has_active_connection: false
 *   2. Model calls MANAGE_CONNECTIONS following Composio's instructions
 *   3. Fails with "Connected account already defined"
 *   4. Model retries, wasting tokens
 *   Solution: Blacklist it. If connection truly doesn't exist, user must connect via UI.
 */
export const TOOL_BLACKLIST = new Set<string>([
  "COMPOSIO_MANAGE_CONNECTIONS",
]);

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
    console.warn(`[Composio Telemetry] Tool failure:`, entry);
  }
}

export function getToolTelemetry(): ToolCallTelemetry[] {
  return [...telemetryBuffer];
}

export interface ComposioToolMetadata {
  fullName: string;        // "server_id/tool_name"
  serverName: string;      // User-friendly server name
  toolName: string;        // Original tool name
  description: string;     // Tool description from MCP
  inputSchema?: any;       // Tool parameters schema
}

// Export ToolMetadata as alias for backwards compatibility
export type ToolMetadata = ComposioToolMetadata;

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

function buildSafeComposioToolName(serverId: string, toolName: string): string {
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
/**
 * Valid JSON Schema types
 */
const VALID_JSON_SCHEMA_TYPES = new Set([
  'object', 'array', 'string', 'number', 'integer', 'boolean', 'null'
]);

/**
 * Default valid object schema for OpenAI strict mode
 */
const DEFAULT_OBJECT_SCHEMA = {
  type: "object" as const,
  properties: {},
  required: [] as string[],
  additionalProperties: false
};

/**
 * Check if a schema type is valid for JSON Schema
 */
function isValidSchemaType(type: any): boolean {
  if (type === null || type === undefined) return false;
  if (typeof type !== 'string') return false;
  // Case-insensitive check for "None" variants from Python backends
  const normalized = type.toLowerCase();
  if (normalized === 'none' || normalized === 'nonetype') return false;
  return VALID_JSON_SCHEMA_TYPES.has(type);
}

/**
 * Deep recursive sanitization of JSON Schema to fix Azure-incompatible values.
 * Azure OpenAI rejects schemas with type: "None" anywhere in the tree.
 */
function deepSanitizeSchema(obj: any, path: string = ''): any {
  if (obj === null || obj === undefined) {
    return undefined;
  }

  if (Array.isArray(obj)) {
    return obj.map((item, i) => deepSanitizeSchema(item, `${path}[${i}]`)).filter(x => x !== undefined);
  }

  if (typeof obj !== 'object') {
    // Check if this is a "None" string value
    if (typeof obj === 'string') {
      const lower = obj.toLowerCase();
      if (lower === 'none' || lower === 'nonetype') {
        return 'string';
      }
    }
    return obj;
  }

  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    const currentPath = path ? `${path}.${key}` : key;

    // Special handling for "type" field
    if (key === 'type') {
      if (typeof value === 'string') {
        const lower = value.toLowerCase();
        if (lower === 'none' || lower === 'nonetype' || lower === 'null') {
          result[key] = 'string';
          continue;
        }
      }
      if (value === null || value === undefined) {
        result[key] = 'string';
        continue;
      }
    }

    // Recursively sanitize nested objects
    const sanitized = deepSanitizeSchema(value, currentPath);
    if (sanitized !== undefined) {
      result[key] = sanitized;
    }
  }

  return result;
}

function patchSchemaForStrictMode(schema: any): any {
  // Handle null, undefined, or non-object schemas
  if (schema === null || schema === undefined) {
    return { ...DEFAULT_OBJECT_SCHEMA };
  }

  if (typeof schema !== 'object') {
    return { ...DEFAULT_OBJECT_SCHEMA };
  }

  // Deep clone to avoid mutating original
  let patched: any;
  try {
    patched = JSON.parse(JSON.stringify(schema));
  } catch (e) {
    return { ...DEFAULT_OBJECT_SCHEMA };
  }

  // CRITICAL: Deep sanitize the entire schema tree to fix Azure-incompatible "None" values
  patched = deepSanitizeSchema(patched, 'root');
  if (!patched || typeof patched !== 'object') {
    return { ...DEFAULT_OBJECT_SCHEMA };
  }

  // CRITICAL: Check for invalid type values FIRST
  // This handles Python "None" serialization and other invalid types
  const rootType = patched.type;

  return patchSchemaRecursive(patched);
}

function patchSchemaRecursive(schema: any): any {
  if (!schema || typeof schema !== 'object') {
    return schema;
  }

  // CRITICAL: Check for invalid type values FIRST (before any other processing)
  // This handles Python "None" serialization at ANY nesting level
  if (schema.type !== undefined && schema.type !== null) {
    const typeStr = String(schema.type).toLowerCase();
    if (typeStr === 'none' || typeStr === 'nonetype' || !VALID_JSON_SCHEMA_TYPES.has(schema.type)) {
      // Invalid type detected - convert to string type
      schema.type = "string";
      // Remove any properties that don't apply to string type
      delete schema.properties;
      delete schema.required;
      delete schema.additionalProperties;
      delete schema.items;
      return schema;
    }
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
 * Slim down tool_schemas to reduce token usage dramatically.
 * Keeps only: description, required params with types.
 * Removes: examples, defaults, verbose metadata, optional params.
 */
function slimToolSchemas(toolSchemas: Record<string, any>): Record<string, any> {
  if (!toolSchemas || typeof toolSchemas !== 'object') return {};

  const slimmed: Record<string, any> = {};

  for (const [toolName, schema] of Object.entries(toolSchemas)) {
    const inputSchema = schema?.input_schema || schema;
    const properties = inputSchema?.properties || {};
    const required = new Set(inputSchema?.required || []);

    // Build slim properties - only required ones with type and short description
    const slimProps: Record<string, any> = {};
    for (const [param, def] of Object.entries(properties)) {
      const d = def as any;
      if (required.has(param)) {
        slimProps[param] = {
          type: d.type || 'string',
          desc: d.description ? d.description.substring(0, 80) : undefined,
        };
      }
    }

    slimmed[toolName] = {
      desc: schema?.description?.substring(0, 120),
      required: Array.from(required),
      params: slimProps,
    };
  }

  return slimmed;
}

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
    // Handle both direct schema format (properties at root) and Composio format (properties under input_schema)
    const inputSchema = schema?.input_schema || schema;
    const properties = inputSchema?.properties;
    if (!properties) continue;

    const required = new Set(inputSchema.required || []);
    const requiredParams: string[] = [];
    const optionalParams: string[] = [];

    for (const [param, def] of Object.entries(properties)) {
      const d = def as any;
      const type = d.type || 'string';
      const desc = d.description ? ` — ${d.description.substring(0, 80)}` : '';

      if (required.has(param)) {
        requiredParams.push(`     ★ ${param} (${type})${desc}`);
        // Build example with realistic values from schema examples if available
        if (!exampleToolName || requiredParams.length === 1) {
          if (!exampleToolName) exampleToolName = toolName;
          if (type === 'number' || type === 'integer') {
            exampleArgs[param] = d.examples?.[0] ?? d.default ?? 10;
          } else if (type === 'boolean') {
            exampleArgs[param] = d.examples?.[0] ?? d.default ?? true;
          } else {
            // Use example from schema if available, otherwise placeholder
            const example = d.examples?.[0];
            exampleArgs[param] = example || `YOUR_${param.toUpperCase()}_HERE`;
          }
        }
      } else {
        optionalParams.push(param);
      }
    }

    lines.push(`  ${toolName}:`);
    if (requiredParams.length > 0) {
      lines.push('     REQUIRED (you MUST provide these in arguments):');
      lines.push(...requiredParams);
    } else {
      lines.push('     (no required parameters)');
    }
    if (optionalParams.length > 0) {
      lines.push(`     Optional: ${optionalParams.slice(0, 5).join(', ')}${optionalParams.length > 5 ? '...' : ''}`);
    }
    lines.push('');
  }

  // Add concrete example - this is critical for the model to understand
  if (exampleToolName) {
    lines.push('────────────────────────────────────────────────────────────────');
    lines.push('  COPY THIS EXACT FORMAT FOR YOUR MULTI_EXECUTE_TOOL CALL:');
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
    lines.push('  ↑ Replace the argument values with your actual values');
    lines.push('');
  }

  lines.push('════════════════════════════════════════════════════════════════');
  lines.push('  ⚠️  NEVER call MULTI_EXECUTE_TOOL with empty arguments: {}');
  lines.push('  ⚠️  ALWAYS fill in ALL required (★) parameters above');
  lines.push('════════════════════════════════════════════════════════════════');
  lines.push('');

  return lines.join('\n');
}

const COMPOSIO_KNOWN_FIELD_ALIASES: Record<string, string[]> = {
  search_query: ['query', 'q', 'search', 'keyword', 'term'],
};

const COMPOSIO_NUMERIC_PARAM_HINTS = [
  'limit',
  'count',
  'offset',
  'page',
  'per_page',
  'top_k',
  'topk',
  'max',
  'min',
];

function coerceKnownFieldValue(value: string, paramName: string): string | number | boolean {
  if (typeof value !== 'string') return value as any;
  const trimmed = value.trim();
  if (!trimmed) return value;

  const lower = trimmed.toLowerCase();
  if (lower === 'true') return true;
  if (lower === 'false') return false;

  if (/^\d+$/.test(trimmed)) {
    const paramLower = paramName.toLowerCase();
    if (COMPOSIO_NUMERIC_PARAM_HINTS.some((hint) => paramLower.includes(hint))) {
      return Number(trimmed);
    }
  }

  return trimmed;
}

function parseKnownFields(knownFields: unknown): Record<string, string> {
  if (!knownFields) return {};
  const result: Record<string, string> = {};

  if (typeof knownFields === 'object' && !Array.isArray(knownFields)) {
    for (const [key, value] of Object.entries(knownFields as Record<string, any>)) {
      const normalizedKey = key.trim().toLowerCase();
      if (!normalizedKey) continue;
      result[normalizedKey] = String(value ?? '').trim();
    }
    return result;
  }

  if (typeof knownFields !== 'string') return {};
  const parts = knownFields.split(',');
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const [rawKey, ...rest] = trimmed.split(':');
    if (!rawKey || rest.length === 0) continue;
    const key = rawKey.trim().toLowerCase();
    if (!key) continue;
    const value = rest.join(':').trim();
    if (!value) continue;
    result[key] = value;
  }

  return result;
}

function collectKnownFields(queries: unknown): Record<string, string> {
  if (!Array.isArray(queries)) return {};
  const merged: Record<string, string> = {};

  for (const query of queries) {
    if (!query || typeof query !== 'object') continue;
    const knownFields = (query as any).known_fields ?? (query as any).knownFields;
    const parsed = parseKnownFields(knownFields);
    Object.assign(merged, parsed);
  }

  return merged;
}

function applyKnownFieldsToArgs(
  args: Record<string, any>,
  requiredParams: string[],
  knownFields: Record<string, string>
): Record<string, any> {
  if (!knownFields || requiredParams.length === 0) return args;
  const updated = { ...args };

  for (const param of requiredParams) {
    if (updated[param] !== undefined && updated[param] !== null && updated[param] !== '') {
      continue;
    }

    const paramKey = param.toLowerCase();
    let value = knownFields[paramKey];

    if (value === undefined) {
      const aliases = COMPOSIO_KNOWN_FIELD_ALIASES[paramKey];
      if (aliases) {
        for (const alias of aliases) {
          const candidate = knownFields[alias];
          if (candidate !== undefined) {
            value = candidate;
            break;
          }
        }
      }
    }

    if (value !== undefined) {
      updated[param] = coerceKnownFieldValue(value, paramKey);
    }
  }

  return updated;
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
  metadata: ComposioToolMetadata[];
  timestamp: number;
}

interface ComposioSchemaCacheEntry {
  schemas: Record<string, any>;
  timestamp: number;
}

interface ComposioSearchHintCacheEntry {
  knownFields: Record<string, string>;
  timestamp: number;
}

export class ComposioToolExecutor {
  private clients: Map<string, Client> = new Map();
  private readonly DEFAULT_TOOL_CAP = 50; // Maximum tools per server by default
  private static instance: ComposioToolExecutor | null = null;

  // Tools cache: key is a hash of enabled server IDs, value is the cached tools
  private toolsCache: Map<string, CachedTools> = new Map();
  private readonly TOOLS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache TTL

  // Composio tool schema cache: keyed by serverId + sessionId
  private composioSchemaCache: Map<string, ComposioSchemaCacheEntry> = new Map();
  private readonly COMPOSIO_SCHEMA_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
  private composioSearchArgsCache: Map<string, any> = new Map();
  private composioSearchHintsCache: Map<string, ComposioSearchHintCacheEntry> = new Map();

  /**
   * Get the singleton instance of ComposioToolExecutor
   * This ensures connection pooling across requests
   */
  static getInstance(): ComposioToolExecutor {
    if (!ComposioToolExecutor.instance) {
      ComposioToolExecutor.instance = new ComposioToolExecutor();
    }
    return ComposioToolExecutor.instance;
  }

  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY_MS = 1000;
  private readonly TIMEOUT_MS = 10000; // 10s timeout for MCP operations

  private getComposioSchemaKey(serverId: string, sessionId: string): string {
    return `${serverId}:${sessionId}`;
  }

  private pruneComposioSchemaCache() {
    const now = Date.now();
    for (const [key, entry] of this.composioSchemaCache) {
      if (now - entry.timestamp > this.COMPOSIO_SCHEMA_CACHE_TTL_MS) {
        this.composioSchemaCache.delete(key);
      }
    }
  }

  private setComposioSchemas(serverId: string, sessionId: string, schemas: Record<string, any>) {
    if (!serverId || !sessionId || !schemas) return;
    const key = this.getComposioSchemaKey(serverId, sessionId);
    this.composioSchemaCache.set(key, { schemas, timestamp: Date.now() });
    this.pruneComposioSchemaCache();
  }

  private getComposioSchemas(serverId: string, sessionId: string): Record<string, any> | null {
    if (!serverId || !sessionId) return null;
    const key = this.getComposioSchemaKey(serverId, sessionId);
    const entry = this.composioSchemaCache.get(key);
    if (!entry) return null;
    if ((Date.now() - entry.timestamp) > this.COMPOSIO_SCHEMA_CACHE_TTL_MS) {
      this.composioSchemaCache.delete(key);
      return null;
    }
    return entry.schemas;
  }

  private pruneComposioSearchHintsCache() {
    const now = Date.now();
    for (const [key, entry] of this.composioSearchHintsCache) {
      if (now - entry.timestamp > this.COMPOSIO_SCHEMA_CACHE_TTL_MS) {
        this.composioSearchHintsCache.delete(key);
      }
    }
  }

  private setComposioSearchHints(serverId: string, sessionId: string, knownFields: Record<string, string>) {
    if (!serverId || !sessionId || !knownFields) return;
    const key = this.getComposioSchemaKey(serverId, sessionId);
    this.composioSearchHintsCache.set(key, { knownFields, timestamp: Date.now() });
    this.pruneComposioSearchHintsCache();
  }

  private getComposioSearchHints(serverId: string, sessionId: string): Record<string, string> | null {
    if (!serverId || !sessionId) return null;
    const key = this.getComposioSchemaKey(serverId, sessionId);
    const entry = this.composioSearchHintsCache.get(key);
    if (!entry) return null;
    if ((Date.now() - entry.timestamp) > this.COMPOSIO_SCHEMA_CACHE_TTL_MS) {
      this.composioSearchHintsCache.delete(key);
      return null;
    }
    return entry.knownFields;
  }

  private prepareComposioExecuteArgs(serverId: string, rawArgs: any): { args: any; missingByTool: string[] } {
    if (!rawArgs || typeof rawArgs !== 'object') {
      return { args: rawArgs, missingByTool: [] };
    }

    const toolCalls = Array.isArray(rawArgs.tools) ? rawArgs.tools : [];
    const sessionId = rawArgs.session_id as string | undefined;
    if (!sessionId || toolCalls.length === 0) {
      return { args: rawArgs, missingByTool: [] };
    }

    const schemas = this.getComposioSchemas(serverId, sessionId);
    if (!schemas) {
      return { args: rawArgs, missingByTool: [] };
    }

    const knownFields = this.getComposioSearchHints(serverId, sessionId) || {};
    const missingByTool: string[] = [];

    const updatedTools = toolCalls.map((toolCall: any) => {
      const toolSlug = toolCall?.tool_slug;
      const toolSchema = toolSlug ? schemas[toolSlug] : null;
      const requiredParams: string[] = toolSchema?.input_schema?.required || [];
      const baseArgs = toolCall?.arguments && typeof toolCall.arguments === 'object'
        ? { ...toolCall.arguments }
        : {};
      const hydratedArgs = applyKnownFieldsToArgs(baseArgs, requiredParams, knownFields);

      const missingParams = requiredParams.filter((param) =>
        hydratedArgs[param] === undefined || hydratedArgs[param] === null || hydratedArgs[param] === ''
      );

      if (missingParams.length > 0) {
        missingByTool.push(`${toolSlug || 'unknown'}: ${missingParams.join(', ')}`);
      }

      return {
        ...toolCall,
        arguments: hydratedArgs,
      };
    });

    return {
      args: { ...rawArgs, tools: updatedTools },
      missingByTool,
    };
  }

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

      // Wrap connect in timeout
      await Promise.race([
        client.connect(transport),
        timeoutPromise
      ]);
      return client;
    } catch (error) {
      if (attempt < this.MAX_RETRIES && !(error instanceof Error && error.message.includes('timeout'))) {
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
      console.error(`[Composio] Final connection failure for ${server.name}:`, userMessage);
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

  async getTools(servers: McpServer[]): Promise<{ tools: Record<string, any>; metadata: ComposioToolMetadata[] }> {
    // Check cache first
    const cacheKey = this.generateCacheKey(servers);
    const cached = this.toolsCache.get(cacheKey);

    if (cached && (Date.now() - cached.timestamp) < this.TOOLS_CACHE_TTL_MS) {
      return { tools: cached.tools, metadata: cached.metadata };
    }

    const allTools: Record<string, any> = {};
    const metadata: ComposioToolMetadata[] = [];

    for (const server of servers) {
      if (!server.enabled) continue;

      // Skip Composio servers with expired sessions
      const isComposioServer = server.url?.toLowerCase().includes('composio.dev') || server.id?.startsWith('composio-');
      if (isComposioServer && (server as any).sessionExpiresAt) {
        if (Date.now() > (server as any).sessionExpiresAt) {
          continue;
        }
      }

      try {
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


        // Apply tool cap (max tools per server)
        const toolCap = server.toolCaps || this.DEFAULT_TOOL_CAP;
        let addedCount = 0;

        for (const tool of tools) {
          // Skip globally blacklisted tools (cause provider schema errors)
          if (TOOL_BLACKLIST.has(tool.name)) {
            continue;
          }

          // Skip if tool is disabled by server policy
          if (disabledTools.has(tool.name)) {
            continue;
          }

          // Apply tool cap
          if (addedCount >= toolCap) {
            break;
          }

          // Build a provider-safe tool/function name.
          // We also keep server/tool metadata for UX (display names) separately.
          const fullName = buildSafeComposioToolName(server.id, tool.name);

          metadata.push({
            fullName,
            serverName: server.name,
            toolName: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
          });

          // Patch JSON Schema for strict mode compatibility (OpenAI, etc.)
          let patchedSchema = patchSchemaForStrictMode(tool.inputSchema);

          // Validate schema
          if (!patchedSchema || typeof patchedSchema !== 'object') {
            patchedSchema = { type: "object", properties: {}, required: [], additionalProperties: false };
          } else if (patchedSchema.type !== 'object') {
            const typeVal = String(patchedSchema.type || '').toLowerCase();
            if (typeVal === 'none' || typeVal === 'nonetype' || typeVal === 'null' || typeVal === 'undefined' || typeVal === '') {
              patchedSchema = { type: "object", properties: {}, required: [], additionalProperties: false };
            } else if (patchedSchema.type !== 'object') {
              patchedSchema = { type: "object", properties: { value: patchedSchema }, required: ["value"], additionalProperties: false };
            }
          }

          // CRITICAL FIX: Patch MULTI_EXECUTE_TOOL schema to make arguments REQUIRED
          if (tool.name === 'COMPOSIO_MULTI_EXECUTE_TOOL' || tool.name === 'MULTI_EXECUTE_TOOL') {
            const toolsItems = patchedSchema?.properties?.tools?.items;
            if (toolsItems?.properties) {
              if (!toolsItems.required) toolsItems.required = [];
              if (!toolsItems.required.includes('arguments')) {
                toolsItems.required.push('arguments');
              }
              if (toolsItems.properties.arguments) {
                toolsItems.properties.arguments.description =
                  'REQUIRED: Object with all required params from tool_schemas[TOOL].input_schema.required. Example: {"search_query": "your query"}. NEVER empty {}.';
                toolsItems.properties.arguments.minProperties = 1;
              }
            }
          }

          // Enhance descriptions for Composio router tools
          let enhancedDescription = tool.description || "MCP tool";
          if (tool.name === 'COMPOSIO_SEARCH_TOOLS') {
            enhancedDescription = `Search for Composio tools. MUST BE CALLED FIRST. Returns tool_schemas with input_schema.required (NEVER ignore), recommended_plan_steps, known_pitfalls, session.id (REQUIRED for execute).`;
          } else if (tool.name === 'COMPOSIO_MULTI_EXECUTE_TOOL' || tool.name === 'MULTI_EXECUTE_TOOL') {
            enhancedDescription = `Execute Composio tools. The "arguments" object MUST contain ALL required params from tool_schemas. Example: {"tools": [{"tool_slug": "REDDIT_SEARCH_ACROSS_SUBREDDITS", "arguments": {"search_query": "query"}}], "session_id": "from_search"}. Empty {} FAILS.`;
          } else if (tool.name === 'COMPOSIO_MANAGE_CONNECTIONS') {
            enhancedDescription = `FALLBACK ONLY: Only call if MULTI_EXECUTE_TOOL fails with "No active connection". "Connected account already defined" = working, don't retry.`;
          }

          const clonedSchema = JSON.parse(JSON.stringify(patchedSchema));

          // Capture tool reference for execute closure
          const toolRef = tool;
          const clientRef = client;
          const serverRef = server;

          // Simple tool definition - wrap schema with jsonSchema() for AI SDK v5
          // This avoids treating raw JSON schemas as Zod schemas.
          allTools[fullName] = {
            description: enhancedDescription,
            inputSchema: jsonSchema(clonedSchema),
            parameters: clonedSchema,
            execute: async (args: any) => {
              const startTime = Date.now();
              const isComposioSearch = toolRef.name === 'COMPOSIO_SEARCH_TOOLS';
              const isComposioExecute = toolRef.name === 'COMPOSIO_MULTI_EXECUTE_TOOL' || toolRef.name === 'MULTI_EXECUTE_TOOL';

              try {
                if (isComposioSearch) {
                  this.composioSearchArgsCache.set(serverRef.id, args);
                }

                let execArgs = args;
                if (isComposioExecute) {
                  // FAIL FAST: Check for empty arguments BEFORE any API calls
                  const toolCalls = Array.isArray(args?.tools) ? args.tools : [];
                  const emptyArgTools = toolCalls.filter((t: any) =>
                    !t.arguments || Object.keys(t.arguments).length === 0
                  );

                  if (emptyArgTools.length > 0) {
                    const emptyToolSlugs = emptyArgTools.map((t: any) => t.tool_slug || 'unknown').join(', ');
                    console.error(`[Composio] ❌ EMPTY ARGUMENTS: ${emptyToolSlugs}`);

                    // Build example with correct values
                    const schemas = this.getComposioSchemas(serverRef.id, args?.session_id);
                    const knownFields = this.getComposioSearchHints(serverRef.id, args?.session_id) || {};
                    const exampleTools = emptyArgTools.map((t: any) => {
                      const schema = schemas?.[t.tool_slug];
                      const required = schema?.input_schema?.required || [];
                      const properties = schema?.input_schema?.properties || {};
                      const exampleArgs: Record<string, any> = {};
                      for (const param of required) {
                        const paramLower = param.toLowerCase();
                        let value = knownFields[paramLower];
                        if (!value) {
                          const aliases = COMPOSIO_KNOWN_FIELD_ALIASES[paramLower];
                          if (aliases) {
                            for (const alias of aliases) {
                              if (knownFields[alias]) { value = knownFields[alias]; break; }
                            }
                          }
                        }
                        if (!value) {
                          value = properties[param]?.examples?.[0] || `YOUR_${param.toUpperCase()}_HERE`;
                        }
                        exampleArgs[param] = value;
                      }
                      return { tool_slug: t.tool_slug, arguments: exampleArgs };
                    });

                    const correctCall = JSON.stringify({ tools: exampleTools, session_id: args?.session_id }, null, 2);
                    throw new Error(
                      `Empty arguments for: ${emptyToolSlugs}. RETRY WITH:\n${correctCall}`
                    );
                  }

                  const prepared = this.prepareComposioExecuteArgs(serverRef.id, args);
                  execArgs = prepared.args;
                  if (prepared.missingByTool.length > 0) {
                    throw new Error(`Missing params: ${prepared.missingByTool.join('; ')}`);
                  }
                }

                // Check for empty/missing required args (common failure mode)
                const requiredParams = toolRef.inputSchema?.required || [];
                const missingParams = requiredParams.filter((p: string) =>
                  execArgs?.[p] === undefined || execArgs?.[p] === null || execArgs?.[p] === ''
                );

                if (missingParams.length > 0) {
                  logToolTelemetry({
                    timestamp: Date.now(),
                    toolName: toolRef.name,
                    success: false,
                    error: 'Missing required parameters',
                    paramsMissing: missingParams,
                  });
                  if (isComposioExecute) {
                    throw new Error(`Missing required parameters for ${toolRef.name}: ${missingParams.join(', ')}. Include session_id from COMPOSIO_SEARCH_TOOLS and required fields from tool_schemas.`);
                  }
                }

                const execTimeoutPromise = new Promise((_, reject) =>
                  setTimeout(() => reject(new Error(`Execution timeout after 30s`)), 30000)
                );

                const result = await Promise.race([
                  clientRef.callTool({
                    name: toolRef.name,
                    arguments: execArgs,
                  }),
                  execTimeoutPromise
                ]) as any;

                const executionTimeMs = Date.now() - startTime;

                // Log success telemetry
                logToolTelemetry({
                  timestamp: Date.now(),
                  toolName: toolRef.name,
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
                        if (toolRef.name === 'COMPOSIO_SEARCH_TOOLS') {
                          const toolSchemas = parsed?.data?.tool_schemas || parsed?.tool_schemas;
                          if (toolSchemas) {
                            if (!parsed.data) {
                              parsed.data = {};
                            }
                            if (!parsed.data.tool_schemas) {
                              parsed.data.tool_schemas = toolSchemas;
                            }

                            const schemas = parsed.data.tool_schemas;
                            const schemaKeys = Object.keys(schemas);
                            const sessionId = parsed?.data?.session?.id || parsed?.session?.id;

                            // Cap search results to prevent tool overload
                            if (schemaKeys.length > COMPOSIO_SEARCH_RESULTS_CAP) {
                              const cappedSchemas: Record<string, any> = {};
                              schemaKeys.slice(0, COMPOSIO_SEARCH_RESULTS_CAP).forEach(key => {
                                cappedSchemas[key] = schemas[key];
                              });
                              parsed.data.tool_schemas = cappedSchemas;
                              parsed._search_capped = true;
                              parsed._original_count = schemaKeys.length;
                            }

                            // Build parameter guide from FULL schemas (before slimming)
                            const guide = buildToolParameterGuide(parsed.data.tool_schemas);
                            if (guide) {
                              parsed._parameter_guide = guide;
                            }

                            // CRITICAL: Slim down tool_schemas to reduce token usage
                            // Keep full schemas cached internally, but return slimmed version
                            const fullSchemas = parsed.data.tool_schemas;
                            parsed.data.tool_schemas = slimToolSchemas(fullSchemas);

                            // SANITIZE: Remove misleading connection guidance
                            // Composio often reports has_active_connection: false even when connections exist
                            if (parsed.data.toolkit_connection_statuses) {
                              parsed.data.toolkit_connection_statuses = parsed.data.toolkit_connection_statuses.map((status: any) => ({
                                ...status,
                                has_active_connection: true,
                                status_message: "Connection status check skipped - execute tools directly",
                              }));
                            }
                            // Remove next_steps_guidance that mentions MANAGE_CONNECTIONS
                            if (parsed.data.next_steps_guidance) {
                              parsed.data.next_steps_guidance = parsed.data.next_steps_guidance.filter(
                                (step: string) => !step.toLowerCase().includes('manage_connection')
                              );
                            }

                            // Cache FULL schemas internally for error message generation
                            if (sessionId) {
                              this.setComposioSchemas(serverRef.id, sessionId, fullSchemas);
                              const lastSearchArgs = this.composioSearchArgsCache.get(serverRef.id);
                              const knownFields = collectKnownFields(lastSearchArgs?.queries);
                              if (Object.keys(knownFields).length > 0) {
                                this.setComposioSearchHints(serverRef.id, sessionId, knownFields);
                              }
                            }

                            // Single surgical log line with all key info
                            const toolNames = Object.keys(parsed.data.tool_schemas).join(', ');
                            if (!guide) {
                              console.warn(`[Composio] ⚠️ No parameter guide generated - check tool_schemas structure`);
                            }
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

                // Enhance Composio error messages with actionable guidance
                let enhancedError = errorMsg;
                if (toolRef.name === 'COMPOSIO_MULTI_EXECUTE_TOOL' || toolRef.name === 'MULTI_EXECUTE_TOOL') {
                  const errorLower = errorMsg.toLowerCase();
                  if (errorLower.includes('1 out of 1 tools failed') || errorLower.includes('tools failed')) {
                    // Extract more details from the error if available
                    try {
                      const errorObj = typeof error === 'object' && error !== null ? error : {};
                      const details = (errorObj as any).details || (errorObj as any).data || {};
                      const toolErrors = details.tool_errors || details.errors || [];

                      if (toolErrors.length > 0) {
                        const firstError = toolErrors[0];
                        const toolSlug = firstError.tool_slug || 'unknown';
                        const reason = firstError.error || firstError.reason || errorMsg;
                        enhancedError = `Tool "${toolSlug}" failed: ${reason}. Check the tool_schemas from COMPOSIO_SEARCH_TOOLS for required parameters.`;
                      } else {
                        enhancedError = `${errorMsg}. Make sure you're using the correct tool_slug and all required arguments from COMPOSIO_SEARCH_TOOLS results.`;
                      }
                    } catch {
                      enhancedError = `${errorMsg}. Use COMPOSIO_SEARCH_TOOLS first to find the correct tool and parameters.`;
                    }
                  } else if (errorLower.includes('session') || errorLower.includes('session_id')) {
                    enhancedError = `${errorMsg}. Make sure to include the session_id from COMPOSIO_SEARCH_TOOLS response.`;
                  } else if (errorLower.includes('required') || errorLower.includes('missing')) {
                    enhancedError = `${errorMsg}. Check the tool_schemas in COMPOSIO_SEARCH_TOOLS results for all required parameters.`;
                  }
                } else if (toolRef.name === 'COMPOSIO_SEARCH_TOOLS') {
                  if (errorMsg.toLowerCase().includes('queries') || errorMsg.toLowerCase().includes('empty')) {
                    enhancedError = `${errorMsg}. Always provide a "queries" array with natural language descriptions. Example: {"queries": ["search twitter", "send email"]}`;
                  }
                }

                // Log failure telemetry
                logToolTelemetry({
                  timestamp: Date.now(),
                  toolName: toolRef.name,
                  success: false,
                  error: enhancedError,
                  executionTimeMs,
                });

                console.error(`[Composio] Tool ${toolRef.name} failed after ${executionTimeMs}ms:`, enhancedError);

                // Create enhanced error with better message
                const enhancedErrorObj = new Error(enhancedError);
                if (error instanceof Error && error.stack) {
                  enhancedErrorObj.stack = error.stack;
                }
                throw enhancedErrorObj;
              }
            }
          };

          addedCount++;
        }
      } catch (error) {
        console.warn(`[Composio] Skipping ${server.name}:`, error instanceof Error ? error.message : error);
      }
    }

    // Note: No final pass over all tools since each schema is patched and
    // wrapped with jsonSchema() above.

    // Cache the result
    this.toolsCache.set(cacheKey, {
      tools: allTools,
      metadata,
      timestamp: Date.now()
    });

    return { tools: allTools, metadata };
  }

  /**
   * Invalidate tools cache (call when server config changes)
   */
  invalidateToolsCache() {
    this.toolsCache.clear();
  }

  /**
   * Build structured system instructions for MCP tools.
   * Optimized for token efficiency (~60% reduction from verbose version).
   */
  buildToolInstructions(metadata: ComposioToolMetadata[], tier: ToolCallingTier = "basic"): string {
    if (metadata.length === 0) return "";

    const groupedByServer = metadata.reduce((acc, tool) => {
      if (!acc[tool.serverName]) acc[tool.serverName] = [];
      acc[tool.serverName].push(tool);
      return acc;
    }, {} as Record<string, ComposioToolMetadata[]>);

    // Check if Composio tools are present (router-first mode)
    const searchTool = metadata.find(t => t.toolName === 'COMPOSIO_SEARCH_TOOLS');
    const executeTool = metadata.find(t => t.toolName === 'COMPOSIO_MULTI_EXECUTE_TOOL' || t.toolName === 'MULTI_EXECUTE_TOOL');
    const hasComposioSearchOnly = searchTool && !executeTool;
    const hasComposioSearchAndExecute = searchTool && executeTool;

    let instructions = "# Composio Tools\n\n";

    // Optimized Composio instructions - preserves all critical info, reduced token usage
    if (hasComposioSearchAndExecute) {
      instructions += `## Composio Workflow

**1. Search:** Call \`${searchTool.fullName}\`
\`\`\`json
{"queries": [{"use_case": "describe what you need"}]}
\`\`\`

**2. Parse Response - Read These Fields:**
- \`tool_schemas[TOOL].input_schema.required\` - mandatory params (NEVER pass empty {})
- \`tool_schemas[TOOL].input_schema.properties\` - param descriptions
- \`recommended_plan_steps\` - execution order
- \`known_pitfalls\` - common errors to avoid
- \`session.id\` - required for all subsequent calls
- \`_parameter_guide\` - shows how to structure arguments

IGNORE \`toolkit_connection_statuses\` (often stale).

**3. Execute:** Call \`${executeTool.fullName}\`
\`\`\`json
{
  "tools": [{
    "tool_slug": "TOOL_NAME",
    "arguments": {"param": "value"}  // ALL required params from step 2
  }],
  "session_id": "from step 2"
}
\`\`\`

**Connection Handling:**
- Execute directly, skip MANAGE_CONNECTIONS
- Only if fails with "No active connection" → call MANAGE_CONNECTIONS once, retry
- "Connected account already defined" = working, proceed

**Critical Rules:**
- arguments object MUST have all required params from tool_schemas[TOOL].input_schema.required
- Empty arguments {} will fail
- Never call MANAGE_CONNECTIONS preemptively

`;
    } else if (hasComposioSearchOnly) {
      instructions += `## Composio Tool Usage

### Search for Tools
Call \`${searchTool.fullName}\` with a queries array:
\`\`\`json
{
  "queries": ["describe what you want to do in natural language"]
}
\`\`\`

**IMPORTANT:** ALWAYS provide the "queries" parameter - never call with empty {}

Then call the returned tools using parameters from tool_schemas.

`;
    }

    // Condensed tool catalog - shorter format
    for (const [serverName, tools] of Object.entries(groupedByServer)) {
      instructions += `## ${serverName}\n`;
      for (const tool of tools) {
        // Truncate long descriptions to first sentence or 100 chars
        let desc = tool.description || "";
        const firstSentence = desc.split(/[.!?]/)[0];
        if (firstSentence && firstSentence.length < desc.length) {
          desc = firstSentence;
        }
        if (desc.length > 100) {
          desc = desc.substring(0, 97) + "...";
        }
        instructions += `- \`${tool.fullName}\`: ${desc}\n`;
      }
      instructions += "\n";
    }

    // Intelligent tool usage guidelines
    instructions += `
## Tool Usage Guidelines

**THINK FIRST:** You have extensive training knowledge - use it! Only call tools when:
1. User explicitly requests ("search", "look up", "find current")
2. Need real-time data (news, weather, prices, recent events)
3. Need external service interaction (GitHub, email, APIs)

**Don't use tools for:** General programming concepts, historical facts, code debugging, creative tasks - answer these directly.

**Web Search - ONLY for:**
- Recent/breaking news and events
- Current prices, weather, scores, live data
- Info after your training cutoff (January 2025)
- When user says "search", "look up online", "find current"

**Quick Decision:** Can I answer from training? Yes → answer directly. Need recent data or user requested search? → Use tools.

After tool use, synthesize results into natural language.

**Displaying Images:**
When tool results contain image URLs, display them inline using this format:
\`[View Image](IMAGE_URL)\`

Example: \`[View Image](https://i.imgur.com/abc123.jpg)\`

This renders images directly in chat. Use for search thumbnails, image results, product images, etc.
For multiple images, put each on its own line.
`;

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

// Export McpManager as alias for backwards compatibility during migration
export { ComposioToolExecutor as McpManager };
