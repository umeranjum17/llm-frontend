import { z } from "zod";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { PipelineStep, PipelineConfig, Agent } from "@/lib/db/schema";
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

const McpToolSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  inputSchema: z.any().optional(),
});

const McpServerSchema = z.object({
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
  tools: z.array(McpToolSchema).optional(),
});

const RequestSchema = z.object({
  pipeline: PipelineConfigSchema,
  userInput: z.string(),
  userImages: z.array(z.string()).optional(),  // Base64 or URL images for vision models
  chatId: z.string(),
  providerBaseUrl: z.string().optional(),
  mcpServers: z.array(McpServerSchema).optional(),
});

/**
 * Substitute {{variable}} placeholders in a template string with values from context
 */
function substituteVariables(template: string, context: Record<string, any>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
    return context[varName] !== undefined ? String(context[varName]) : match;
  });
}

/**
 * Get provider base URL from provider ID
 */
function getProviderBaseUrl(providerId: string): string {
  const provider = PROVIDERS.find((p) => p.id === providerId);
  return provider?.baseUrl || "https://openrouter.ai/api/v1";
}

/**
 * Create a model instance based on provider and model ID
 */
function createModel(modelId: string, apiKey: string, providerId?: string) {
  const effectiveProviderId = providerId || "openrouter";

  console.log("[Pipeline createModel] Creating model:", {
    modelId,
    providerId,
    effectiveProviderId,
  });

  // Handle Anthropic provider (direct API)
  if (effectiveProviderId === "anthropic") {
    console.log("[Pipeline createModel] Using Anthropic provider");
    const anthropic = createAnthropic({ apiKey });
    return anthropic(modelId.replace("anthropic/", ""));
  }

  // Handle OpenAI direct (not via OpenRouter)
  if (effectiveProviderId === "openai") {
    console.log("[Pipeline createModel] Using OpenAI direct provider");
    const openai = createOpenAI({ apiKey });
    return openai(modelId.replace("openai/", ""));
  }

  // Default to OpenRouter or other OpenAI-compatible providers
  // This includes Google models via OpenRouter
  const baseUrl = getProviderBaseUrl(effectiveProviderId);
  console.log("[Pipeline createModel] Using OpenRouter/compatible provider with baseURL:", baseUrl);
  const openai = createOpenAI({
    apiKey,
    baseURL: baseUrl,
  });
  return openai(modelId);
}

/**
 * Build AI SDK tools from MCP server tools
 */
function buildToolsFromMcpServers(
  mcpServers: z.infer<typeof McpServerSchema>[],
  stepMcpServerIds?: string[],
  baseUrl?: string,
  apiKey?: string
): Record<string, any> {
  const tools: Record<string, any> = {};

  // Filter servers based on step configuration
  const enabledServers = stepMcpServerIds && stepMcpServerIds.length > 0
    ? mcpServers.filter((s) => stepMcpServerIds.includes(s.id))
    : [];

  for (const server of enabledServers) {
    if (!server.tools) continue;

    const disabledTools = server.toolPolicy?.disabledTools || [];

    for (const tool of server.tools) {
      // Skip disabled tools
      if (disabledTools.includes(tool.name)) continue;

      // Create prefixed tool name to avoid conflicts
      const fullToolName = `mcp_${server.name.toLowerCase().replace(/[^a-z0-9]/g, "_")}_${tool.name}`;

      tools[fullToolName] = {
        description: tool.description || `Tool ${tool.name} from ${server.name}`,
        parameters: tool.inputSchema || z.object({}),
        execute: async (args: any) => {
          // Call the MCP tool execution API
          const response = await fetch(`${baseUrl}/api/mcp/execute-tool`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-API-Key": apiKey || "",
            },
            body: JSON.stringify({
              toolName: tool.name,
              args,
              servers: [server],
            }),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error((errorData as any)?.error || `Tool ${tool.name} execution failed`);
          }

          const data = await response.json();
          return (data as any).result || data;
        },
      };
    }
  }

  return tools;
}

/**
 * Execute a single LLM step
 */
interface LLMStepResult {
  text: string;
  toolCalls?: Array<{
    toolName: string;
    args: any;
    result?: any;
  }>;
}

async function executeLLMStep(
  step: PipelineStep,
  input: string,
  apiKey: string,
  images?: string[],  // Optional images for vision models
  mcpServers?: z.infer<typeof McpServerSchema>[],
  baseUrl?: string,
  stepIndex?: number  // Position in pipeline (0 = first step)
): Promise<LLMStepResult> {
  const modelId = step.modelId || "openai/gpt-4o-mini";
  const providerId = step.providerId || "openrouter";

  console.log("[Pipeline LLM Step] Step config:", {
    stepId: step.id,
    stepProviderId: step.providerId,
    effectiveProviderId: providerId,
    modelId,
    hasImages: images && images.length > 0,
    mcpServerIds: step.mcpServerIds,
    stepIndex,
  });

  const model = createModel(modelId, apiKey, providerId);

  // Build message content - include images if available (for vision models)
  let messageContent: any;
  if (images && images.length > 0) {
    // Multi-part content with text and images
    messageContent = [
      { type: "text", text: input },
      ...images.map(img => ({
        type: "image",
        image: img,  // AI SDK accepts base64 or URL
      })),
    ];
    console.log("[Pipeline LLM Step] Including", images.length, "images in request");
  } else {
    messageContent = input;
  }

  // Build tools if MCP servers are enabled for this step
  const tools = mcpServers && step.mcpServerIds && step.mcpServerIds.length > 0
    ? buildToolsFromMcpServers(mcpServers, step.mcpServerIds, baseUrl, apiKey)
    : undefined;

  const hasTools = tools && Object.keys(tools).length > 0;

  console.log("[Pipeline LLM Step] Tools available:", hasTools ? Object.keys(tools).length : 0);

  // Build system prompt - add context for steps receiving input from previous steps
  let systemPrompt = step.systemPrompt || "";
  if (stepIndex !== undefined && stepIndex > 0) {
    const pipelineContext = `You are receiving input that has been processed by a previous AI step in a pipeline. The input below is the output from that previous step, not directly from the user. Process this input according to your instructions and produce the appropriate output for the next step or final result.`;
    systemPrompt = systemPrompt
      ? `${pipelineContext}\n\n${systemPrompt}`
      : pipelineContext;
  }

  const result = await generateText({
    model,
    system: systemPrompt,
    messages: [{ role: "user", content: messageContent }],
    maxTokens: 1000,
    ...(hasTools ? { tools, maxSteps: 5 } : {}),
  });

  // Collect all tool calls from all steps
  const allToolCalls: LLMStepResult["toolCalls"] = [];
  if (result.steps) {
    for (const stepResult of result.steps) {
      if (stepResult.toolCalls && stepResult.toolCalls.length > 0) {
        for (const tc of stepResult.toolCalls) {
          allToolCalls.push({
            toolName: tc.toolName,
            args: tc.args,
            result: stepResult.toolResults?.find((tr: any) => tr.toolCallId === tc.toolCallId)?.result,
          });
        }
      }
    }
  }

  console.log("[Pipeline LLM Step] Tool calls made:", allToolCalls.length);

  return {
    text: result.text,
    toolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
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

  console.log("[Pipeline Image Step] Step config:", {
    stepId: step.id,
    stepImageProviderId: step.imageProviderId,
    effectiveProviderId: providerId,
    modelId,
    imageSize,
    imageQuality,
    imageStyle,
  });

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
  mcpServers?: z.infer<typeof McpServerSchema>[]
): Promise<any> {
  if (!step.toolName) {
    throw new Error("Tool step requires toolName");
  }

  if (!mcpServers || mcpServers.length === 0) {
    throw new Error("Tool step requires MCP servers to be configured");
  }

  // Substitute variables in tool arguments
  const toolArgs: Record<string, string> = {};
  if (step.toolArgs) {
    for (const [key, value] of Object.entries(step.toolArgs)) {
      toolArgs[key] = substituteVariables(value, { ...context, input });
    }
  }

  console.log("[Pipeline Tool Step] Executing tool:", {
    toolName: step.toolName,
    args: toolArgs,
    serverCount: mcpServers.length,
  });

  // Call the MCP tool execution API
  const response = await fetch(`${baseUrl}/api/mcp/execute-tool`, {
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

    const { pipeline, userInput, userImages, chatId, providerBaseUrl, mcpServers } = parsed.data;
    const apiKey = req.headers.get("X-API-Key");

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "API key required" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
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
                    const llmResult = await executeLLMStep(step, input, apiKey, stepImages, mcpServers, baseUrl, i);
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
                    retryCount: retries,
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
                    error: errorMessage,
                    continuing: true,
                  });
                  break; // Continue to next step
                }

                // Abort
                throw error;
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
          sendEvent(controller, {
            type: "pipeline-error",
            error: errorMessage,
          });
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
