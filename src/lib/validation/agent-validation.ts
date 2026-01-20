import type { Agent, PipelineStep } from "@/lib/db/schema";
import { getAgentById } from "@/lib/db/queries";

// Constants for validation
export const PREFILL_CLEAR_DELAY_MS = 100; // Allow state to settle before clearing
export const MAX_TRIGGER_PHRASES_IN_DESCRIPTION = 5;
export const STEP_ID_PREFIX = "step_";

export interface PipelineValidationError {
  stepIndex: number;
  stepName: string;
  message: string;
}

/**
 * Validates pipeline steps for consistency and correctness.
 *
 * Checks:
 * - No duplicate output variables
 * - No duplicate step names
 * - Subagent steps have agentId selected
 * - No circular dependencies in subagent references
 * - All steps have required fields populated
 * - All variable references in inputTemplate exist
 *
 * @param steps - Pipeline steps to validate
 * @param currentAgentId - The ID of the agent being edited (to prevent self-reference)
 * @param allAgents - All available agents for circular dependency checking
 * @returns Array of validation errors (empty if valid)
 *
 * @example
 * const errors = await validatePipelineSteps(
 *   [{ outputVariable: "result", inputTemplate: "{{userInput}}", ... }],
 *   "agent_123",
 *   allAgents
 * );
 */
export async function validatePipelineSteps(
  steps: PipelineStep[],
  currentAgentId?: string,
  allAgents?: Agent[]
): Promise<PipelineValidationError[]> {
  const errors: PipelineValidationError[] = [];
  const definedVariables = new Set(["userInput", "userImages", "chatId"]);
  const outputVariables = new Set<string>();
  const stepNames = new Set<string>();

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const stepName = step.name || `Step ${i + 1}`;

    // Check for duplicate output variables
    if (outputVariables.has(step.outputVariable)) {
      errors.push({
        stepIndex: i,
        stepName,
        message: `Duplicate output variable "${step.outputVariable}"`,
      });
    }
    outputVariables.add(step.outputVariable);

    // Check for duplicate step names
    if (step.name && stepNames.has(step.name)) {
      errors.push({
        stepIndex: i,
        stepName,
        message: `Duplicate step name "${step.name}"`,
      });
    }
    if (step.name) {
      stepNames.add(step.name);
    }

    // Validate step configuration based on type
    if (step.type === "subagent") {
      if (!step.agentId || step.agentId.trim() === "") {
        errors.push({
          stepIndex: i,
          stepName,
          message: "Agent step requires an agent to be selected",
        });
      } else if (currentAgentId && step.agentId === currentAgentId) {
        // Check for self-reference
        errors.push({
          stepIndex: i,
          stepName,
          message: "Agent cannot reference itself",
        });
      } else if (allAgents) {
        // Check for circular dependencies
        const circularPath = await detectCircularDependency(
          step.agentId,
          currentAgentId || "",
          allAgents,
          new Set([currentAgentId || ""])
        );
        if (circularPath) {
          errors.push({
            stepIndex: i,
            stepName,
            message: `Circular dependency detected: ${circularPath}`,
          });
        }
      }
    } else if (step.type === "llm") {
      // Validate LLM step has a model selected
      if (!step.modelId) {
        errors.push({
          stepIndex: i,
          stepName,
          message: "LLM step requires a model to be selected",
        });
      }
    } else if (step.type === "image") {
      // Validate Image step has a model selected
      if (!step.imageModelId) {
        errors.push({
          stepIndex: i,
          stepName,
          message: "Image step requires a model to be selected",
        });
      }
    }

    // Check for unresolved variable references in inputTemplate
    const varRefs = step.inputTemplate.match(/\{\{(\w+)\}\}/g) || [];
    for (const ref of varRefs) {
      const varName = ref.slice(2, -2);
      if (!definedVariables.has(varName)) {
        errors.push({
          stepIndex: i,
          stepName,
          message: `References undefined variable "{{${varName}}}"`,
        });
      }
    }

    // Add this step's output variable for subsequent steps
    definedVariables.add(step.outputVariable);
  }

  return errors;
}

/**
 * Detects circular dependencies in agent references.
 *
 * @param agentId - The agent ID to check
 * @param rootAgentId - The root agent being edited (for error messages)
 * @param allAgents - All available agents
 * @param visited - Set of already visited agent IDs to detect cycles
 * @returns A string describing the circular path if found, null otherwise
 *
 * @example
 * const path = await detectCircularDependency(
 *   "agent_b",
 *   "agent_a",
 *   allAgents,
 *   new Set(["agent_a"])
 * );
 * // Returns: "agent_a → agent_b → agent_a" if circular
 */
async function detectCircularDependency(
  agentId: string,
  rootAgentId: string,
  allAgents: Agent[],
  visited: Set<string>
): Promise<string | null> {
  // If we've already visited this agent, we have a cycle
  if (visited.has(agentId)) {
    return `${rootAgentId} → ${agentId} → ${rootAgentId}`;
  }

  // Find the agent in the provided list
  let agent = allAgents.find((a) => a.id === agentId);

  // If not found in the list, try to fetch it from DB
  if (!agent) {
    agent = await getAgentById(agentId);
  }

  if (!agent || !agent.pipeline?.steps) {
    return null;
  }

  // Add current agent to visited set
  const newVisited = new Set(visited);
  newVisited.add(agentId);

  // Check all subagent steps
  for (const step of agent.pipeline.steps) {
    if (step.type === "subagent" && step.agentId) {
      const circularPath = await detectCircularDependency(
        step.agentId,
        rootAgentId,
        allAgents,
        newVisited
      );
      if (circularPath) {
        return circularPath;
      }
    }
  }

  return null;
}

/**
 * Validates that a step name is unique within the pipeline.
 *
 * @param stepName - The step name to check
 * @param stepIndex - The index of the step being checked (to exclude itself)
 * @param steps - All pipeline steps
 * @returns true if the name is unique, false otherwise
 */
export function isStepNameUnique(
  stepName: string,
  stepIndex: number,
  steps: PipelineStep[]
): boolean {
  if (!stepName.trim()) return true; // Empty names are allowed
  return !steps.some(
    (step, index) =>
      index !== stepIndex && step.name?.toLowerCase() === stepName.toLowerCase()
  );
}

/**
 * Generates a unique step name for a new pipeline step.
 *
 * @param steps - Existing pipeline steps
 * @param basePrefix - Base prefix for the step name (default: "Step")
 * @returns A unique step name like "Step 1", "Step 2", etc.
 */
export function generateUniqueStepName(
  steps: PipelineStep[],
  basePrefix: string = "Step"
): string {
  let counter = steps.length + 1;
  let name = `${basePrefix} ${counter}`;
  while (steps.some((s) => s.name === name)) {
    counter++;
    name = `${basePrefix} ${counter}`;
  }
  return name;
}

/**
 * Generates a unique output variable name for a new pipeline step.
 *
 * @param steps - Existing pipeline steps
 * @param basePrefix - Base prefix for the variable name (default: "step")
 * @returns A unique variable name like "step1Output", "step2Output", etc.
 */
export function generateUniqueOutputVariable(
  steps: PipelineStep[],
  basePrefix: string = "step"
): string {
  let counter = steps.length + 1;
  let varName = `${basePrefix}${counter}Output`;
  while (steps.some((s) => s.outputVariable === varName)) {
    counter++;
    varName = `${basePrefix}${counter}Output`;
  }
  return varName;
}

/**
 * Gets available variables for a given step based on pipeline order.
 * Variables from previous steps and built-in variables are available.
 *
 * @param stepIndex - The index of the current step
 * @param steps - All pipeline steps
 * @returns Array of available variable names
 */
export function getAvailableVariables(
  stepIndex: number,
  steps: PipelineStep[]
): string[] {
  const variables = ["userInput", "userImages", "chatId"];

  // Add output variables from all previous steps
  for (let i = 0; i < stepIndex; i++) {
    variables.push(steps[i].outputVariable);
  }

  return variables;
}
