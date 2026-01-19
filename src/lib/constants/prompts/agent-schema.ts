/**
 * Shared Agent Pipeline JSON Schema for creator/editor prompts.
 * Single source of truth to avoid duplication.
 */
export const AGENT_PIPELINE_SCHEMA = `\`\`\`agent
{
  "id": "agent_id",  // Only for edits
  "name": "Agent Name",
  "description": "What it does",
  "avatar": "emoji",
  "isActive": true,
  "executionType": "pipeline",
  "pipeline": {
    "steps": [{
      "id": "step_1", "name": "Step Name", "type": "llm|image|subagent",
      "modelId": "model-id", "providerId": "openrouter",
      "systemPrompt": "...", "inputTemplate": "{{userInput}}",
      "outputVariable": "stepOutput"
    }]
  }
}
\`\`\``;
