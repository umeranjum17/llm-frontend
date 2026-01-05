import type { Prompt } from "@/lib/db/schema";

function now() {
  return Date.now();
}

export const BUILTIN_PROMPTS: Prompt[] = [
  {
    id: "prompt_builtin_code_review",
    title: "Code Review",
    category: "coding",
    description: "Review code for correctness, style, and risks.",
    content:
      "Review the following code. Identify bugs, edge cases, security issues, and improvements.\n\n```{{language}}\n{{code}}\n```",
    variables: [
      { name: "language", placeholder: "e.g., ts, python, go", defaultValue: "ts" },
      { name: "code", placeholder: "Paste code here" },
    ],
    tags: ["coding", "review"],
    isFavorite: false,
    isBuiltIn: true,
    createdAt: now(),
    updatedAt: now(),
    usageCount: 0,
  },
  {
    id: "prompt_builtin_debug",
    title: "Debug",
    category: "coding",
    description: "Diagnose an error and propose a fix.",
    content:
      "Help me debug this issue.\n\nProblem:\n{{problem}}\n\nContext / logs:\n{{logs}}\n\nConstraints:\n{{constraints}}",
    variables: [
      { name: "problem", placeholder: "What is happening?" },
      { name: "logs", placeholder: "Paste logs/errors" },
      { name: "constraints", placeholder: "Any constraints (env, time, versions)", defaultValue: "" },
    ],
    tags: ["coding", "debugging"],
    isFavorite: false,
    isBuiltIn: true,
    createdAt: now(),
    updatedAt: now(),
    usageCount: 0,
  },
  {
    id: "prompt_builtin_pros_cons",
    title: "Pros / Cons",
    category: "analysis",
    description: "Compare options with a clear recommendation.",
    content:
      "Compare these options:\n\n{{options}}\n\nInclude: pros/cons, risks, costs, and a recommendation for {{audience}}.",
    variables: [
      { name: "options", placeholder: "List options" },
      { name: "audience", placeholder: "Who is deciding?", defaultValue: "a technical team" },
    ],
    tags: ["analysis", "decision"],
    isFavorite: false,
    isBuiltIn: true,
    createdAt: now(),
    updatedAt: now(),
    usageCount: 0,
  },
  {
    id: "prompt_builtin_summarize",
    title: "Summarize",
    category: "writing",
    description: "Summarize text and extract key points.",
    content:
      "Summarize the following text. Then provide key bullet points and action items (if any):\n\n{{text}}",
    variables: [{ name: "text", placeholder: "Paste text here" }],
    tags: ["writing", "summary"],
    isFavorite: false,
    isBuiltIn: true,
    createdAt: now(),
    updatedAt: now(),
    usageCount: 0,
  },
];

