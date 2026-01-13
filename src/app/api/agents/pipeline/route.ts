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
  imageModelId: z.string().optional(),
  imageProviderId: z.string().optional(),
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
});

const RequestSchema = z.object({
  pipeline: PipelineConfigSchema,
  userInput: z.string(),
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
 * Execute a single LLM step
 */
async function executeLLMStep(
  step: PipelineStep,
  input: string,
  apiKey: string
): Promise<string> {
  const modelId = step.modelId || "openai/gpt-4o-mini";
  const providerId = step.providerId || "openrouter";

  console.log("[Pipeline LLM Step] Step config:", {
    stepId: step.id,
    stepProviderId: step.providerId,
    effectiveProviderId: providerId,
    modelId,
  });

  const model = createModel(modelId, apiKey, providerId);

  const result = await generateText({
    model,
    system: step.systemPrompt || "",
    messages: [{ role: "user", content: input }],
    maxTokens: 1000,
  });

  return result.text;
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

  console.log("[Pipeline Image Step] Step config:", {
    stepId: step.id,
    stepImageProviderId: step.imageProviderId,
    effectiveProviderId: providerId,
    modelId,
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
      size: "1024x1024",
      quality: "standard",
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

    const { pipeline, userInput, chatId, providerBaseUrl, mcpServers } = parsed.data;
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
        const context: Record<string, any> = { userInput, chatId };
        const totalSteps = pipeline.steps.length;

        try {
          for (let i = 0; i < pipeline.steps.length; i++) {
            const step = pipeline.steps[i];
            const input = substituteVariables(step.inputTemplate, context);

            // Signal step start
            sendEvent(controller, {
              type: "step-start",
              stepIndex: i,
              totalSteps,
              step: { id: step.id, name: step.name, type: step.type },
            });

            let output: any;
            let retries = 0;
            const maxRetries = step.maxRetries || 0;

            while (true) {
              try {
                switch (step.type) {
                  case "llm":
                    output = await executeLLMStep(step, input, apiKey);
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

            // Signal step complete
            sendEvent(controller, {
              type: "step-complete",
              stepIndex: i,
              totalSteps,
              step: { id: step.id, name: step.name, type: step.type },
              output,
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
