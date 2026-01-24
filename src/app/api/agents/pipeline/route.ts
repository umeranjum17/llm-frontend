import { z } from "zod";
import type { PipelineStep, PipelineConfig, Agent, McpServer } from "@/lib/db/schema";
import { executeChat, type ChatMessage } from "@/lib/ai/chat-executor";
import { PROVIDERS } from "@/lib/providers/registry";

export const runtime = "nodejs";

const PipelineStepSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["llm", "image", "tool", "subagent"]),
  modelId: z.string().optional(),
  systemPrompt: z.string().optional(),
  providerId: z.string().optional(),
  enabledTools: z.array(z.string()).optional(), // Tool names available to this LLM step
  mcpServerIds: z.array(z.string()).optional(), // MCP servers available to this LLM step
  toolkitOverrides: z.record(z.boolean()).optional(), // Per-step Composio toolkit enable/disable overrides
  memoryEnabled: z.boolean().optional(), // Whether to include memory context
  includeHistory: z.boolean().optional(), // Whether to include chat history
  imageModelId: z.string().optional(),
  imageProviderId: z.string().optional(),
  imageSize: z.enum(["256x256", "512x512", "1024x1024", "1024x1792", "1792x1024", "auto"]).optional(),
  imageQuality: z.enum(["standard", "hd"]).optional(),
  imageStyle: z.enum(["natural", "vivid"]).optional(),
  agentId: z.string().optional(),
  toolName: z.string().optional(),
  toolArgs: z.record(z.string()).optional(),
  inputTemplate: z.string(),
  outputVariable: z.string(),
  onError: z.enum(["continue", "abort", "retry"]).optional(),
  maxRetries: z.number().optional(),
});

const PipelineConfigSchema = z.object({
  steps: z.array(PipelineStepSchema).min(1),
  outputTemplate: z.string().optional(),
});

const RequestSchema = z.object({
  pipeline: PipelineConfigSchema,
  userInput: z.string(),
  userImages: z.array(z.string()).optional(),  // Base64 or URL images for vision models
  chatId: z.string(),
  providerBaseUrl: z.string().optional(),
  mcpServers: z.array(z.any()).optional(), // McpServer type from schema
  agentSystemPrompt: z.string().optional(), // Agent-level system prompt to inject into steps
  memoryContext: z.string().optional(), // Pre-fetched memory context for steps that need it
  chatHistory: z.array(z.object({
    role: z.enum(["system", "user", "assistant"]),
    content: z.string(),
  })).optional(), // Chat history for steps that need context
  agentToolPolicy: z.object({
    disabledTools: z.array(z.string()).optional(),
  }).optional(), // Agent-level tool restrictions
  agentEnabledTools: z.array(z.string()).optional(), // Agent-level enabled tools
  composioGlobalToolkits: z.array(z.string()).optional(), // Global Composio toolkit config for step session creation
});

/**
 * Substitute {{variable}} placeholders in a template string with values from context.
 * Safely handles non-string values by JSON stringifying objects/arrays.
 */
function substituteVariables(template: string, context: Record<string, any>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
    const value = context[varName];
    if (value === undefined) return match;
    if (value === null) return "null";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    // For objects/arrays, JSON stringify
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  });
}

/**
 * Extract all {{variable}} references from a template string
 */
function extractVariableReferences(template: string): string[] {
  const matches = template.match(/\{\{(\w+)\}\}/g) || [];
  return matches.map(m => m.slice(2, -2));
}

interface ValidationError {
  stepIndex: number;
  stepId: string;
  stepName: string;
  message: string;
}

/**
 * Validate pipeline configuration before execution.
 * Returns array of validation errors (empty if valid).
 */
function validatePipeline(pipeline: { steps: PipelineStep[] }): ValidationError[] {
  const errors: ValidationError[] = [];
  const definedVariables = new Set(["userInput", "userImages", "chatId"]);
  const outputVariables = new Set<string>();

  for (let i = 0; i < pipeline.steps.length; i++) {
    const step = pipeline.steps[i];

    // Check for duplicate output variables
    if (outputVariables.has(step.outputVariable)) {
      errors.push({
        stepIndex: i,
        stepId: step.id,
        stepName: step.name,
        message: `Duplicate outputVariable "${step.outputVariable}" - already used by a previous step`,
      });
    }
    outputVariables.add(step.outputVariable);

    // Check step-type-specific requirements
    switch (step.type) {
      case "tool":
        if (!step.toolName || step.toolName.trim() === "") {
          errors.push({
            stepIndex: i,
            stepId: step.id,
            stepName: step.name,
            message: `Tool step requires toolName to be specified`,
          });
        }
        break;

      case "subagent":
        if (!step.agentId || step.agentId.trim() === "") {
          errors.push({
            stepIndex: i,
            stepId: step.id,
            stepName: step.name,
            message: `Subagent step requires agentId to be specified`,
          });
        }
        break;
    }

    // Check for unresolved variable references in inputTemplate
    const referencedVars = extractVariableReferences(step.inputTemplate);
    for (const varName of referencedVars) {
      if (!definedVariables.has(varName)) {
        errors.push({
          stepIndex: i,
          stepId: step.id,
          stepName: step.name,
          message: `Variable "{{${varName}}}" is not defined. Available: ${Array.from(definedVariables).join(", ")}`,
        });
      }
    }

    // Check toolArgs for unresolved variables (if tool step)
    if (step.type === "tool" && step.toolArgs) {
      for (const [argName, argValue] of Object.entries(step.toolArgs)) {
        if (typeof argValue === "string") {
          const argVars = extractVariableReferences(argValue);
          for (const varName of argVars) {
            // Also allow "input" as it's added during execution
            if (!definedVariables.has(varName) && varName !== "input") {
              errors.push({
                stepIndex: i,
                stepId: step.id,
                stepName: step.name,
                message: `Tool argument "${argName}" references undefined variable "{{${varName}}}"`,
              });
            }
          }
        }
      }
    }

    // Add this step's output variable to defined variables for subsequent steps
    definedVariables.add(step.outputVariable);
  }

  return errors;
}

/**
 * Get provider base URL from provider ID
 */
function getProviderBaseUrl(providerId: string): string {
  const provider = PROVIDERS.find((p) => p.id === providerId);
  return provider?.baseUrl || "https://openrouter.ai/api/v1";
}

/**
 * Derive a unique, deterministic userId from the Composio API key.
 * SECURITY: This ensures each user's Composio sessions are isolated.
 */
function deriveUserIdFromApiKey(apiKey: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < apiKey.length; i++) {
    hash ^= apiKey.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return `user_${hash.toString(36)}`;
}

/**
 * Calculate effective toolkits for a step based on global config and step overrides.
 * Returns the list of toolkit keys that should be enabled for this step.
 */
function getEffectiveToolkits(
  globalToolkits: string[] | undefined,
  stepOverrides: Record<string, boolean> | undefined
): string[] | undefined {
  if (!globalToolkits || globalToolkits.length === 0) {
    return undefined;
  }

  if (!stepOverrides || Object.keys(stepOverrides).length === 0) {
    return globalToolkits; // No overrides, use global
  }

  // Apply overrides: start with global, then apply step-level changes
  const effectiveSet = new Set(globalToolkits);
  for (const [toolkit, enabled] of Object.entries(stepOverrides)) {
    if (enabled) {
      effectiveSet.add(toolkit);
    } else {
      effectiveSet.delete(toolkit);
    }
  }

  return Array.from(effectiveSet);
}

/**
 * Create a step-specific Composio session if toolkit overrides differ from global.
 * Returns the new MCP URL or null if no change needed.
 */
async function createStepComposioSession(
  composioApiKey: string,
  stepToolkits: string[],
  baseUrl: string
): Promise<{ url: string; headers?: Record<string, string> } | null> {
  try {
    // SECURITY: Derive unique userId from API key to isolate user sessions
    const userId = deriveUserIdFromApiKey(composioApiKey);

    const response = await fetch(`${baseUrl}/api/composio/session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-composio-key": composioApiKey,
      },
      body: JSON.stringify({
        userId,
        toolkits: stepToolkits,
      }),
    });

    if (!response.ok) {
      console.error("[Pipeline] Failed to create step Composio session:", response.statusText);
      return null;
    }

    const { mcp } = await response.json();
    return { url: mcp.url, headers: mcp.headers };
  } catch (error) {
    console.error("[Pipeline] Error creating step Composio session:", error);
    return null;
  }
}

/**
 * Execute a single LLM step using the shared chat executor
 */
interface LLMStepResult {
  text: string;
  toolCalls?: Array<{
    toolName: string;
    args: any;
    result?: any;
  }>;
}

interface LLMStepOptions {
  step: PipelineStep;
  input: string;
  apiKey: string;
  images?: string[];
  mcpServers?: McpServer[];
  baseUrl?: string;
  stepIndex?: number;
  agentSystemPrompt?: string;
  memoryContext?: string;
  chatHistory?: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  agentEnabledTools?: string[];
  agentDisabledTools?: string[];
  // Composio step-specific session support
  composioApiKey?: string;
  composioGlobalToolkits?: string[];
  pipelineBaseUrl?: string; // For creating step-specific sessions
}

async function executeLLMStep(options: LLMStepOptions): Promise<LLMStepResult> {
  const {
    step,
    input,
    apiKey,
    images,
    mcpServers,
    baseUrl,
    stepIndex,
    agentSystemPrompt,
    memoryContext,
    chatHistory,
    agentEnabledTools,
    agentDisabledTools,
    composioApiKey,
    composioGlobalToolkits,
    pipelineBaseUrl,
  } = options;

  const modelId = step.modelId || "openai/gpt-5-mini";
  const providerId = step.providerId || "openrouter";

  // Build system prompt - combine agent-level and step-level prompts
  let systemPrompt = "";

  // Start with agent-level system prompt if provided
  if (agentSystemPrompt) {
    systemPrompt = agentSystemPrompt;
  }

  // Add step-specific prompt
  if (step.systemPrompt) {
    systemPrompt = systemPrompt
      ? `${systemPrompt}\n\n${step.systemPrompt}`
      : step.systemPrompt;
  }

  // Add context for steps receiving input from previous steps
  if (stepIndex !== undefined && stepIndex > 0) {
    const pipelineContext = `You are receiving input that has been processed by a previous AI step in a pipeline. The input below is the output from that previous step, not directly from the user. Process this input according to your instructions and produce the appropriate output for the next step or final result.`;
    systemPrompt = systemPrompt
      ? `${pipelineContext}\n\n${systemPrompt}`
      : pipelineContext;
  }

  // Filter MCP servers for this step
  let stepMcpServers = mcpServers && step.mcpServerIds && step.mcpServerIds.length > 0
    ? mcpServers.filter((s) => step.mcpServerIds!.includes(s.id))
    : undefined;

  // Handle step-specific Composio toolkit overrides
  // Strategy: Always create a step-specific session when there are toolkit overrides
  // This ensures the Composio search tool only returns tools from allowed toolkits
  if (
    stepMcpServers &&
    step.toolkitOverrides &&
    Object.keys(step.toolkitOverrides).length > 0 &&
    composioApiKey &&
    pipelineBaseUrl
  ) {
    const composioServer = stepMcpServers.find(s => s.id === "composio-consolidated");
    if (composioServer && composioGlobalToolkits) {
      // Calculate effective toolkits for this step
      const effectiveToolkits = getEffectiveToolkits(composioGlobalToolkits, step.toolkitOverrides);

      // Check if effective toolkits differ from global
      const globalSet = new Set(composioGlobalToolkits);
      const effectiveSet = new Set(effectiveToolkits || []);
      const toolkitsDiffer =
        globalSet.size !== effectiveSet.size ||
        ![...globalSet].every(t => effectiveSet.has(t));

      if (toolkitsDiffer && effectiveToolkits && effectiveToolkits.length > 0) {

        // Create step-specific Composio session with only the allowed toolkits
        // This ensures the search tool only returns tools from these toolkits
        const stepSession = await createStepComposioSession(
          composioApiKey,
          effectiveToolkits,
          pipelineBaseUrl
        );

        if (stepSession) {
          stepMcpServers = stepMcpServers.map(s =>
            s.id === "composio-consolidated"
              ? { ...s, url: stepSession.url, headers: stepSession.headers }
              : s
          );
        }
      }
    }
  }

  // Build messages array
  const messages: ChatMessage[] = [];

  // Include chat history if enabled for this step
  if (step.includeHistory && chatHistory && chatHistory.length > 0) {
    messages.push(...chatHistory);
  }

  // Build user message content (with optional images)
  let userContent: ChatMessage["content"];
  if (images && images.length > 0) {
    userContent = [
      { type: "text", text: input },
      ...images.map(img => ({ type: "image", image: img })),
    ];
  } else {
    userContent = input;
  }
  messages.push({ role: "user", content: userContent });

  // Determine if memory should be included
  // Default: enabled for first step, disabled for subsequent steps
  const shouldIncludeMemory = step.memoryEnabled ?? (stepIndex === 0);

  // Merge agent-level and step-level tool settings
  // Step-level settings override agent-level if specified
  const effectiveEnabledTools = step.enabledTools || agentEnabledTools;
  const effectiveDisabledTools = agentDisabledTools;

  // Execute using shared chat executor
  const result = await executeChat(
    {
      providerId,
      providerBaseUrl: baseUrl,
      modelId,
      apiKey,
      systemPrompt: systemPrompt || undefined,
      mcpServers: stepMcpServers,
      enabledTools: effectiveEnabledTools,
      disabledTools: effectiveDisabledTools,
      memoryContext: shouldIncludeMemory ? memoryContext : undefined,
    },
    messages,
    { maxTokens: 2000 }
  );


  return {
    text: result.text,
    toolCalls: result.toolCalls,
  };
}

/**
 * Execute an image generation step
 */
async function executeImageStep(
  step: PipelineStep,
  input: string,
  apiKey: string,
  baseUrl?: string
): Promise<{ type: "image"; url: string; revisedPrompt?: string }> {
  const modelId = step.imageModelId || step.modelId || "openai/dall-e-3";
  const providerId = step.imageProviderId || step.providerId || "openrouter";
  const providerBaseUrl = getProviderBaseUrl(providerId);

  // Use step configuration or defaults
  const imageSize = step.imageSize || "1024x1024";
  const imageQuality = step.imageQuality || "hd"; // Default to HD for better quality
  const imageStyle = step.imageStyle || "natural";

  // Call the images API
  const response = await fetch(`${baseUrl}/api/images`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({
      providerId,
      modelId,
      prompt: input,
      providerBaseUrl,
      size: imageSize,
      quality: imageQuality,
      style: imageStyle,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error((errorData as any)?.error || "Image generation failed");
  }

  const data = await response.json();
  const images = (data as any).images || [];

  if (images.length === 0) {
    throw new Error("No images generated");
  }

  return {
    type: "image",
    url: images[0].url,
    revisedPrompt: images[0].revisedPrompt,
  };
}

/**
 * Execute a subagent step - calls another agent
 */
async function executeSubagentStep(
  step: PipelineStep,
  input: string,
  apiKey: string,
  chatId: string,
  baseUrl: string
): Promise<any> {
  if (!step.agentId) {
    throw new Error("Subagent step requires agentId");
  }

  // Call the agent run API which handles both simple and pipeline agents
  const response = await fetch(`${baseUrl}/api/agents/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({
      agentId: step.agentId,
      userMessage: input,
      chatId,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error((errorData as any)?.error || "Subagent execution failed");
  }

  const data = await response.json();
  return (data as any).result || (data as any).text || data;
}

/**
 * Execute a tool step - calls an MCP tool
 */
async function executeToolStep(
  step: PipelineStep,
  input: string,
  context: Record<string, any>,
  apiKey: string,
  baseUrl: string,
  mcpServers?: McpServer[]
): Promise<any> {
  if (!step.toolName) {
    throw new Error("Tool step requires toolName");
  }

  if (!mcpServers || mcpServers.length === 0) {
    throw new Error("Tool step requires MCP servers to be configured");
  }

  // Substitute variables in tool arguments
  // Handle both string and non-string values safely
  const toolArgs: Record<string, any> = {};
  if (step.toolArgs) {
    for (const [key, value] of Object.entries(step.toolArgs)) {
      if (typeof value === "string") {
        // String values get variable substitution
        toolArgs[key] = substituteVariables(value, { ...context, input });
      } else if (value !== undefined && value !== null) {
        // Non-string values pass through (numbers, booleans, etc.)
        toolArgs[key] = value;
      }
    }
  }

  // Call the Composio tool execution API
  const response = await fetch(`${baseUrl}/api/composio/execute-tool`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({
      toolName: step.toolName,
      args: toolArgs,
      input, // Pass input as default argument if no specific args
      servers: mcpServers,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error((errorData as any)?.error || `Tool ${step.toolName} execution failed`);
  }

  const data = await response.json();
  return (data as any).result || data;
}

export async function POST(req: Request) {
  const encoder = new TextEncoder();

  // Helper to send SSE events
  const sendEvent = (controller: ReadableStreamDefaultController, data: any) => {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
  };

  try {
    const body = await req.json();
    const parsed = RequestSchema.safeParse(body);

    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request", details: parsed.error.flatten() }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const { pipeline, userInput, userImages, chatId, providerBaseUrl, mcpServers, agentSystemPrompt, memoryContext, chatHistory, agentToolPolicy, agentEnabledTools, composioGlobalToolkits } = parsed.data;
    const apiKey = req.headers.get("X-API-Key");
    const composioApiKey = req.headers.get("X-Composio-Key") || undefined;


    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "API key required" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // Validate pipeline configuration before execution
    const validationErrors = validatePipeline(pipeline);
    if (validationErrors.length > 0) {
      return new Response(
        JSON.stringify({
          error: "Pipeline validation failed",
          validationErrors: validationErrors.map(e => ({
            step: `${e.stepIndex + 1}. ${e.stepName}`,
            stepId: e.stepId,
            message: e.message,
          })),
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get base URL for internal API calls
    const baseUrl = new URL(req.url).origin;

    // Create SSE stream
    const stream = new ReadableStream({
      async start(controller) {
        const context: Record<string, any> = { userInput, userImages: userImages || [], chatId };
        const totalSteps = pipeline.steps.length;

        try {
          for (let i = 0; i < pipeline.steps.length; i++) {
            const step = pipeline.steps[i];
            const input = substituteVariables(step.inputTemplate, context);

            // Signal step start with input
            sendEvent(controller, {
              type: "step-start",
              stepIndex: i,
              totalSteps,
              step: { id: step.id, name: step.name, type: step.type },
              input: input.length > 500 ? input.slice(0, 500) + "..." : input, // Truncate long inputs
            });

            let output: any;
            let toolCalls: LLMStepResult["toolCalls"];
            let retries = 0;
            const maxRetries = step.maxRetries || 0;

            while (true) {
              try {
                switch (step.type) {
                  case "llm":
                    // Pass images to the first LLM step (for vision models like GPT-4o)
                    // Only include images if this is the first step or step explicitly requests them
                    const stepImages = i === 0 ? context.userImages : undefined;
                    const llmResult = await executeLLMStep({
                      step,
                      input,
                      apiKey,
                      images: stepImages,
                      mcpServers: mcpServers as McpServer[] | undefined,
                      baseUrl: providerBaseUrl,
                      stepIndex: i,
                      agentSystemPrompt,
                      memoryContext,
                      chatHistory,
                      agentEnabledTools,
                      agentDisabledTools: agentToolPolicy?.disabledTools,
                      // Composio step-specific session support
                      composioApiKey,
                      composioGlobalToolkits,
                      pipelineBaseUrl: baseUrl,
                    });
                    output = llmResult.text;
                    toolCalls = llmResult.toolCalls;
                    break;

                  case "image":
                    output = await executeImageStep(step, input, apiKey, baseUrl);
                    break;

                  case "subagent":
                    output = await executeSubagentStep(step, input, apiKey, chatId, baseUrl);
                    break;

                  case "tool":
                    output = await executeToolStep(step, input, context, apiKey, baseUrl, mcpServers);
                    break;

                  default:
                    throw new Error(`Unknown step type: ${(step as any).type}`);
                }
                break; // Success, exit retry loop
              } catch (error) {
                const errorMessage = error instanceof Error ? error.message : "Step failed";

                if (step.onError === "retry" && retries < maxRetries) {
                  retries++;
                  sendEvent(controller, {
                    type: "step-retry",
                    stepIndex: i,
                    totalSteps,
                    step: { id: step.id, name: step.name, type: step.type },
                    retryCount: retries,
                    maxRetries,
                    error: errorMessage,
                  });
                  continue; // Retry
                }

                if (step.onError === "continue") {
                  output = null;
                  sendEvent(controller, {
                    type: "step-error",
                    stepIndex: i,
                    totalSteps,
                    step: { id: step.id, name: step.name, type: step.type },
                    error: errorMessage,
                    continuing: true,
                  });
                  break; // Continue to next step
                }

                // Abort - wrap with step context for better debugging
                const abortError = new Error(
                  `Step ${i + 1} "${step.name}" (${step.type}) failed: ${errorMessage}`
                );
                (abortError as any).stepIndex = i;
                (abortError as any).stepId = step.id;
                (abortError as any).stepName = step.name;
                throw abortError;
              }
            }

            // Store output in context
            context[step.outputVariable] = output;

            // Signal step complete with tool calls if any
            sendEvent(controller, {
              type: "step-complete",
              stepIndex: i,
              totalSteps,
              step: { id: step.id, name: step.name, type: step.type },
              output,
              ...(toolCalls && toolCalls.length > 0 ? { toolCalls } : {}),
            });
          }

          // Determine final result
          let finalResult: any;
          if (pipeline.outputTemplate) {
            finalResult = substituteVariables(pipeline.outputTemplate, context);
          } else {
            // Default: use the last step's output
            const lastStep = pipeline.steps[pipeline.steps.length - 1];
            finalResult = context[lastStep.outputVariable];
          }

          // Signal pipeline complete
          sendEvent(controller, {
            type: "pipeline-complete",
            totalSteps,
            result: finalResult,
            context, // Include full context for debugging
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Pipeline failed";
          const errorPayload: any = {
            type: "pipeline-error",
            error: errorMessage,
          };
          // Include step context if available (from abort errors)
          if (error && typeof error === "object") {
            const e = error as any;
            if (e.stepIndex !== undefined) errorPayload.stepIndex = e.stepIndex;
            if (e.stepId) errorPayload.stepId = e.stepId;
            if (e.stepName) errorPayload.stepName = e.stepName;
          }
          sendEvent(controller, errorPayload);
        } finally {
          sendEvent(controller, { type: "done" });
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
      },
    });
  } catch (error) {
    console.error("[Pipeline API] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Pipeline execution failed";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
