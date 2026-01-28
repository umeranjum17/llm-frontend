/**
 * Shared Skill JSON Schema for creator/editor prompts.
 * Single source of truth to avoid duplication.
 */
export const SKILL_JSON_SCHEMA = `\`\`\`skill
{
  "id": "skill_id",  // Only for edits
  "name": "Skill Name",
  "description": "Brief description",
  "category": "coding|writing|analysis|visualization|creation|productivity|research|business|search",
  "systemPrompt": "AI instructions...",
  "trigger": { "type": "auto" },
  "autoApplyQueries": ["trigger phrases 3-6 words"],
  "exclusionQueries": ["similar but NOT this"],
  "ui": { "icon": "IconName", "color": "colorName", "activeLabel": "Doing..." }
}
\`\`\``;
