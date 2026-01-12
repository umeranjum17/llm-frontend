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
  {
    id: "prompt_builtin_create_chart",
    title: "Create Chart",
    category: "visualization",
    description: "Visualize data as an interactive chart.",
    content: `Analyze this data and create the most appropriate chart visualization:

{{data}}

**Chart Format Instructions:**
Output a JSON code block with language \`chart\`. Choose the best chart type for the data:
- \`bar\` - comparing categories
- \`line\` - trends over time
- \`area\` - cumulative values or ranges
- \`pie\` - parts of a whole (use sparingly)
- \`scatter\` - correlation between variables

**Required JSON structure:**
\`\`\`chart
{
  "type": "bar|line|area|pie|scatter",
  "title": "Descriptive Chart Title",
  "data": [
    { "name": "Category1", "value": 100, "series2": 80 },
    { "name": "Category2", "value": 150, "series2": 120 }
  ],
  "xKey": "name",
  "yKeys": ["value", "series2"],
  "showGrid": true,
  "showLegend": true,
  "stacked": false
}
\`\`\`

**Key rules:**
- \`data\` must be an array of objects
- \`xKey\` is the field for x-axis labels
- \`yKeys\` array contains field names for y-axis values (supports multiple series)
- For pie charts: use single yKey, xKey becomes the label`,
    variables: [
      { name: "data", placeholder: "Paste data: CSV, JSON, table, or describe what you want to visualize" },
    ],
    tags: ["visualization", "chart", "data"],
    isFavorite: false,
    isBuiltIn: true,
    createdAt: now(),
    updatedAt: now(),
    usageCount: 0,
  },
  {
    id: "prompt_builtin_create_diagram",
    title: "Create Diagram",
    category: "visualization",
    description: "Generate flowcharts, sequence diagrams, and more.",
    content: `Create a diagram to visualize:

{{description}}

**Diagram Format Instructions:**
Output a \`mermaid\` code block. Choose the most appropriate diagram type:

**Flowchart** (processes, decisions, workflows):
\`\`\`mermaid
flowchart TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Action 1]
    B -->|No| D[Action 2]
    C --> E[End]
    D --> E
\`\`\`

**Sequence Diagram** (interactions, API calls, communication):
\`\`\`mermaid
sequenceDiagram
    participant User
    participant Server
    User->>Server: Request
    Server-->>User: Response
\`\`\`

**Class Diagram** (code structure, relationships):
\`\`\`mermaid
classDiagram
    class Animal {
        +name: string
        +makeSound()
    }
    Dog --|> Animal
\`\`\`

**Entity Relationship** (database schemas):
\`\`\`mermaid
erDiagram
    USER ||--o{ ORDER : places
    ORDER ||--|{ ITEM : contains
\`\`\`

**Gantt Chart** (timelines, project planning):
\`\`\`mermaid
gantt
    title Project Timeline
    section Phase 1
    Task 1: 2024-01-01, 7d
    Task 2: 7d
\`\`\`

**Key rules:**
- Use clear, concise labels
- Keep diagrams readable (break complex ones into sections)
- Use appropriate node shapes: [] rectangle, {} diamond, () rounded, (()) circle`,
    variables: [
      { name: "description", placeholder: "Describe what you want to diagram: a process, system architecture, database schema, timeline, etc." },
    ],
    tags: ["visualization", "diagram", "mermaid", "flowchart"],
    isFavorite: false,
    isBuiltIn: true,
    createdAt: now(),
    updatedAt: now(),
    usageCount: 0,
  },
];

