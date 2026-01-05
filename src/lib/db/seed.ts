import { db } from "@/lib/db/schema";
import { BUILTIN_AGENTS } from "@/lib/constants/agents";
import { BUILTIN_PROMPTS } from "@/lib/constants/prompts";

export async function ensureBuiltInAgents() {
  const count = await db.agents.count();
  if (count > 0) return;
  await db.agents.bulkAdd(BUILTIN_AGENTS);
}

export async function ensureBuiltInPrompts() {
  const count = await db.prompts.count();
  if (count > 0) return;
  await db.prompts.bulkAdd(BUILTIN_PROMPTS);
}

export async function ensureBuiltIns() {
  await Promise.all([ensureBuiltInAgents(), ensureBuiltInPrompts()]);
}

