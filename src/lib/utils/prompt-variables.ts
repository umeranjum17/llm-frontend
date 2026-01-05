import type { PromptVariable } from "@/lib/db/schema";

const VAR_REGEX = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;

export function extractVariableNames(template: string): string[] {
  const names = new Set<string>();
  for (const match of template.matchAll(VAR_REGEX)) {
    names.add(match[1]);
  }
  return Array.from(names);
}

export function buildVariablesFromTemplate(
  template: string,
  existing?: PromptVariable[]
): PromptVariable[] {
  const existingMap = new Map((existing || []).map((v) => [v.name, v] as const));
  return extractVariableNames(template).map((name) => {
    const prev = existingMap.get(name);
    return {
      name,
      placeholder: prev?.placeholder || `Enter ${name}`,
      defaultValue: prev?.defaultValue,
    };
  });
}

export function substituteVariables(template: string, values: Record<string, string>): string {
  return template.replace(VAR_REGEX, (_, name: string) => values[name] ?? "");
}

