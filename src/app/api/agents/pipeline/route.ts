import { z } from "zod";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { PipelineStep, PipelineConfig, Agent } from "@/lib/db/schema";

export const runtime = "nodejs";

const PipelineStepSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["llm", "image", "tool", "subagent"]),
  modelId: z.string().optional(),
  systemPrompt: z.string().optional(),
  imageModelId: z.string().optional(),
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
  chatId: z.string(),
  providerBaseUrl: z.string().optional(),
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
 * Create a model instance based on provider and model ID
 */
function createModel(modelId: string, apiKey: string, providerBaseUrl?: string) {
  // Detect provider from model ID
  if (modelId.startsWith("anthropic/") || modelId.startsWith("claude")) {
    const anthropic = createAnthropic({ apiKey });
    return anthropic(modelId.replace("anthropic/", ""));
  }

  // Default to OpenRouter (handles most models)
  const openai = createOpenAI({
    apiKey,
    baseURL: providerBaseUrl || "https://openrouter.ai/api/v1",
  });
  return openai(modelId);
}

/**
 * Execute a single LLM step
 */
async function executeLLMStep(
  step: PipelineStep,
  input: string,
  apiKey: string,
  providerBaseUrl?: string
): Promise<string> {
  const modelId = step.modelId || "openai/gpt-4o-mini";
  const model = createModel(modelId, apiKey, providerBaseUrl);

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
  providerBaseUrl?: string,
  baseUrl?: string
): Promise<{ type: "image"; url: string; revisedPrompt?: string }> {
  const modelId = step.imageModelId || step.modelId || "openai/dall-e-3";

  // Call the images API
  const response = await fetch(`${baseUrl}/api/images`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({
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

    const { pipeline, userInput, chatId, providerBaseUrl } = parsed.data;
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
                    output = await executeLLMStep(step, input, apiKey, providerBaseUrl);
                    break;

                  case "image":
                    output = await executeImageStep(step, input, apiKey, providerBaseUrl, baseUrl);
                    break;

                  case "subagent":
                    // TODO: Implement subagent execution
                    throw new Error("Subagent steps not yet implemented");

                  case "tool":
                    // TODO: Implement tool execution
                    throw new Error("Tool steps not yet implemented");

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
