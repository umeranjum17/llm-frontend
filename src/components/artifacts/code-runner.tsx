"use client";

import { SandpackExecutor } from "@/components/artifacts/sandpack-executor";
import { E2BExecutor } from "@/components/artifacts/e2b-executor";

interface CodeRunnerProps {
  id: string;
  code: string;
  language: string;
  template?: string;
  files?: Record<string, string>;
  entry?: string;
}

// Languages routed to E2B (remote sandbox)
const E2B_LANGUAGES = ["python", "py", "bash", "sh", "shell"];

// Normalize language aliases
function normalizeLanguage(lang: string): string {
  const aliases: Record<string, string> = {
    py: "python",
    sh: "bash",
    shell: "bash",
  };
  return aliases[lang?.toLowerCase()] || lang?.toLowerCase() || "";
}

export function CodeRunner({
  id,
  code,
  language,
  template,
  files,
  entry,
}: CodeRunnerProps) {
  const normalized = normalizeLanguage(language);
  const useE2B = E2B_LANGUAGES.includes(language?.toLowerCase());

  if (useE2B) {
    return (
      <E2BExecutor
        id={id}
        code={code}
        language={normalized as "python" | "javascript" | "bash"}
      />
    );
  }

  return (
    <SandpackExecutor
      id={id}
      code={code}
      language={language}
      template={template}
      files={files}
      entry={entry}
    />
  );
}
