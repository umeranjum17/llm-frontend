import type { PipelineStep, PipelineConfig, Agent } from "@/lib/db/schema";

export interface PipelineContext {
  userInput: string;
  chatId: string;
  [key: string]: any; // Dynamic variables from step outputs
}

export interface StepResult {
  stepId: string;
  stepName: string;
  success: boolean;
  output: any;
  error?: string;
}

export interface PipelineProgress {
  type: "step-start" | "step-progress" | "step-complete" | "step-error" | "pipeline-complete";
  stepIndex: number;
  totalSteps: number;
  step?: PipelineStep;
  content?: string;
  output?: any;
  error?: string;
  finalResult?: any;
}

/**
 * Substitute {{variable}} placeholders in a template string with values from context
 */
export function substituteVariables(template: string, context: PipelineContext): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
    return context[varName] !== undefined ? String(context[varName]) : match;
  });
}

/**
 * Execute a single pipeline step
 */
export async function executeStep(
  step: PipelineStep,
  context: PipelineContext,
  apiKey?: string,
  providerBaseUrl?: string,
  onProgress?: (content: string) => void
): Promise<StepResult> {
  const input = substituteVariables(step.inputTemplate, context);

  try {
    switch (step.type) {
      case "llm": {
        // Call LLM step
        const response = await fetch("/api/agents/run", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(apiKey ? { "X-API-Key": apiKey } : {}),
          },
          body: JSON.stringify({
            systemPrompt: step.systemPrompt || "",
            userMessage: input,
            modelId: step.modelId,
            providerBaseUrl,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error((errorData as any)?.error || response.statusText);
        }

        const data = await response.json();
        return {
          stepId: step.id,
          stepName: step.name,
          success: true,
          output: data.text,
        };
      }

      case "image": {
        // Call image generation
        const response = await fetch("/api/images", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(apiKey ? { "X-API-Key": apiKey } : {}),
          },
          body: JSON.stringify({
            modelId: step.imageModelId || step.modelId,
            prompt: input,
            providerBaseUrl,
            size: "1024x1024",
            quality: "standard",
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error((errorData as any)?.error || response.statusText);
        }

        const data = await response.json();
        const images = (data as any).images || [];

        if (images.length === 0) {
          throw new Error("No images generated");
        }

        // Return the first image URL
        return {
          stepId: step.id,
          stepName: step.name,
          success: true,
          output: {
            type: "image",
            url: images[0].url,
            revisedPrompt: images[0].revisedPrompt,
          },
        };
      }

      case "subagent": {
        // Call another agent (recursive)
        const response = await fetch("/api/agents/pipeline", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(apiKey ? { "X-API-Key": apiKey } : {}),
          },
          body: JSON.stringify({
            agentId: step.agentId,
            userMessage: input,
            chatId: context.chatId,
            providerBaseUrl,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error((errorData as any)?.error || response.statusText);
        }

        const data = await response.json();
        return {
          stepId: step.id,
          stepName: step.name,
          success: true,
          output: data.result,
        };
      }

      case "tool": {
        // Tool calling would go here - for now just return the input
        // TODO: Implement MCP tool execution
        return {
          stepId: step.id,
          stepName: step.name,
          success: true,
          output: `Tool ${step.toolName} called with: ${input}`,
        };
      }

      default:
        throw new Error(`Unknown step type: ${(step as any).type}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Step failed";

    // Handle retry logic
    if (step.onError === "retry" && step.maxRetries && step.maxRetries > 0) {
      // Retry with decremented count
      const retriedStep = { ...step, maxRetries: step.maxRetries - 1 };
      return executeStep(retriedStep, context, apiKey, providerBaseUrl, onProgress);
    }

    if (step.onError === "continue") {
      return {
        stepId: step.id,
        stepName: step.name,
        success: false,
        output: null,
        error: errorMessage,
      };
    }

    // Default: abort
    throw error;
  }
}

/**
 * Execute a full pipeline, yielding progress events
 */
export async function* executePipeline(
  pipeline: PipelineConfig,
  context: PipelineContext,
  apiKey?: string,
  providerBaseUrl?: string
): AsyncGenerator<PipelineProgress> {
  const totalSteps = pipeline.steps.length;

  for (let i = 0; i < pipeline.steps.length; i++) {
    const step = pipeline.steps[i];

    // Signal step start
    yield {
      type: "step-start",
      stepIndex: i,
      totalSteps,
      step,
    };

    try {
      // Execute the step
      const result = await executeStep(step, context, apiKey, providerBaseUrl);

      // Store output in context for next steps
      context[step.outputVariable] = result.output;

      // Signal step complete
      yield {
        type: "step-complete",
        stepIndex: i,
        totalSteps,
        step,
        output: result.output,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Step failed";

      yield {
        type: "step-error",
        stepIndex: i,
        totalSteps,
        step,
        error: errorMessage,
      };

      // Abort pipeline on error (unless step configured to continue)
      throw error;
    }
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

  yield {
    type: "pipeline-complete",
    stepIndex: totalSteps - 1,
    totalSteps,
    finalResult,
  };
}
