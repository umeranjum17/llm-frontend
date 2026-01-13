import { db } from "@/lib/db/schema";
import { BUILTIN_AGENTS } from "@/lib/constants/agents";
import { BUILTIN_PROMPTS } from "@/lib/constants/prompts";

export async function ensureBuiltInAgents() {
  // Get existing agent IDs
  const existingAgents = await db.agents.toArray();
  const existingIds = new Set(existingAgents.map((a) => a.id));

  // Add any missing built-in agents
  const missingAgents = BUILTIN_AGENTS.filter((a) => !existingIds.has(a.id));
  if (missingAgents.length > 0) {
    await db.agents.bulkAdd(missingAgents);
  }

  // Update existing built-in agents with latest definition (but preserve user customizations)
  // User customizations (modelId, mcpServerIds, enabledTools, isActive, mcpToolPolicy) are NOT overwritten
  for (const agent of BUILTIN_AGENTS) {
    if (existingIds.has(agent.id)) {
      await db.agents.update(agent.id, {
        // Only update definition fields, not user customizations
        systemPrompt: agent.systemPrompt,
        description: agent.description,
        avatar: agent.avatar,
      });
    }
  }
}

export async function ensureBuiltInPrompts() {
  // Get existing prompt IDs
  const existingPrompts = await db.prompts.toArray();
  const existingIds = new Set(existingPrompts.map((p) => p.id));

  // Add any missing built-in prompts
  const missingPrompts = BUILTIN_PROMPTS.filter((p) => !existingIds.has(p.id));
  if (missingPrompts.length > 0) {
    await db.prompts.bulkAdd(missingPrompts);
  }
}

export async function ensureBuiltIns() {
  await Promise.all([ensureBuiltInAgents(), ensureBuiltInPrompts()]);
}

