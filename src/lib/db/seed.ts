import { db } from "@/lib/db/schema";
import { BUILTIN_AGENTS } from "@/lib/constants/agents";
import { BUILTIN_SKILLS } from "@/lib/constants/skills";

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
  // User customizations (modelId, mcpServerIds, enabledTools, isActive, mcpToolPolicy, pipeline) are NOT overwritten
  for (const agent of BUILTIN_AGENTS) {
    if (existingIds.has(agent.id)) {
      const existingAgent = existingAgents.find((a) => a.id === agent.id);
      const updateData: Record<string, any> = {
        // Only update definition fields, not user customizations
        systemPrompt: agent.systemPrompt,
        description: agent.description,
        avatar: agent.avatar,
      };

      // Only sync pipeline/executionType if the existing agent doesn't have any pipeline config
      // This preserves user customizations to model/provider settings
      if (!existingAgent?.pipeline?.steps?.length && agent.pipeline?.steps?.length) {
        updateData.executionType = agent.executionType;
        updateData.pipeline = agent.pipeline;
      }

      await db.agents.update(agent.id, updateData);
    }
  }
}

export async function ensureBuiltInSkills() {
  // Get existing skill IDs
  const existingSkills = await db.skills.toArray();
  const existingIds = new Set(existingSkills.map((s) => s.id));

  // Add any missing built-in skills
  const missingSkills = BUILTIN_SKILLS.filter((s) => !existingIds.has(s.id));
  if (missingSkills.length > 0) {
    await db.skills.bulkAdd(missingSkills);
  }

  // Update existing built-in skills with latest definition (but preserve user customizations)
  // User customizations (isEnabled, isFavorite, usageCount) are NOT overwritten
  for (const skill of BUILTIN_SKILLS) {
    if (existingIds.has(skill.id)) {
      const existing = existingSkills.find((s) => s.id === skill.id);
      if (existing) {
        await db.skills.update(skill.id, {
          // Update core behavior
          systemPrompt: skill.systemPrompt,
          userTemplate: skill.userTemplate,
          variables: skill.variables,
          // Update UI config
          ui: skill.ui,
          // Update description (important for embedding matching)
          description: skill.description,
          name: skill.name,
          category: skill.category,
          trigger: skill.trigger,
          updatedAt: Date.now(),
        });
      }
    }
  }
}

export async function ensureBuiltIns() {
  await Promise.all([ensureBuiltInAgents(), ensureBuiltInSkills()]);
}

/**
 * Reset all skills to defaults - deletes ALL skills (including custom ones)
 * and re-initializes only the built-in skills.
 */
export async function resetSkillsToDefaults() {
  // Delete all skill embeddings
  await db.skillEmbeddings.clear();

  // Delete all skills
  await db.skills.clear();

  // Re-add built-in skills
  await db.skills.bulkAdd(BUILTIN_SKILLS);

  return BUILTIN_SKILLS.length;
}

