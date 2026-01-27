import type { Skill } from "@/lib/db/schema";
import { SKILL_JSON_SCHEMA, AGENT_PIPELINE_SCHEMA, LUMINA_CAPABILITIES, LUMINA_CAPABILITIES_COMPACT, LUMINA_FULL_KNOWLEDGE, UI_OPTIONS, SKILL_CATEGORIES, AGENT_CAPABILITIES } from "./prompts";

function now() {
  return Date.now();
}

/**
 * Built-in skills - a focused set of high-value skills that provide
 * distinct functionality beyond what the LLM does naturally.
 *
 * Skills removed (LLM handles these well without special prompting):
 * - Define, Translate, Explain Simply, Research (general knowledge)
 * - Code Review, Debug (coding tasks)
 * - Recipe Lookup, Fact Check, How To Guide (general queries)
 * - Wikipedia Biography, Pros & Cons (simple lookups)
 * - Generate Image, Twitter/X Post, Create React App (niche)
 */
export const BUILTIN_SKILLS: Skill[] = [
  {
    id: "skill_builtin_summarize",
    name: "Summarize",
    description: "summarize this article, summarize this text, summarize this document, give me a summary, TLDR of this, extract key points, condense this text, brief summary",
    category: "writing",
    systemPrompt: `You are a summarization expert. When summarizing content:

1. **Key Points**: Extract the most important information first
2. **Structure**: Use bullet points for clarity
3. **Brevity**: Be concise but don't lose essential details
4. **Action Items**: Highlight any actionable items if present

Format your response as:
- **Summary**: 1-3 sentence overview
- **Key Points**: Bulleted list
- **Action Items** (if any): What needs to be done`,
    trigger: { type: "auto" },
    autoApplyQueries: [
      "summarize this",
      "summarize",
      "give me a summary",
      "TLDR",
      "key points",
    ],
    exclusionQueries: [
      "write code to summarize text",
      "create a summary generator",
      "build a summarization tool",
    ],
    ui: {
      icon: "FileText",
      color: "blue",
      activeLabel: "Summarizing...",
    },
    isBuiltIn: true,
    isEnabled: true,
    usageCount: 0,
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: "skill_builtin_create_chart",
    name: "Create Chart",
    description: "create a chart, create a graph, visualize this data, plot this data, bar chart, line graph, pie chart, data visualization",
    category: "visualization",
    systemPrompt: `You are a data visualization expert. Analyze data and create the most appropriate chart.

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
- For pie charts: use single yKey, xKey becomes the label
- Always include a descriptive title`,
    trigger: { type: "auto" },
    autoApplyQueries: [
      "create a chart",
      "make a graph",
      "visualize this data",
      "plot this",
      "bar chart",
      "pie chart",
    ],
    exclusionQueries: [
      "write chart rendering code",
      "explain how charts work",
      "code a chart component",
    ],
    ui: {
      icon: "BarChart3",
      color: "green",
      activeLabel: "Creating chart...",
    },
    isBuiltIn: true,
    isEnabled: true,
    usageCount: 0,
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: "skill_builtin_create_diagram",
    name: "Create Diagram",
    description: "create a diagram, create a flowchart, draw a flowchart, sequence diagram, architecture diagram, mermaid diagram, process flow, ER diagram, class diagram",
    category: "visualization",
    systemPrompt: `You are a diagramming expert. Create clear, well-structured diagrams using Mermaid syntax.

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

**Sequence Diagram** (interactions, API calls):
\`\`\`mermaid
sequenceDiagram
    participant User
    participant Server
    User->>Server: Request
    Server-->>User: Response
\`\`\`

**Class Diagram** (code structure):
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

**Key rules:**
- Use clear, concise labels
- Keep diagrams readable (break complex ones into sections)
- Use appropriate node shapes: [] rectangle, {} diamond, () rounded`,
    trigger: { type: "auto" },
    autoApplyQueries: [
      "create a diagram",
      "draw a flowchart",
      "sequence diagram",
      "architecture diagram",
      "ER diagram",
      "flowchart",
    ],
    exclusionQueries: [
      "write code to generate diagrams",
      "implement a diagram library",
      "explain how mermaid works",
    ],
    ui: {
      icon: "GitBranch",
      color: "purple",
      activeLabel: "Creating diagram...",
    },
    isBuiltIn: true,
    isEnabled: true,
    usageCount: 0,
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: "skill_builtin_code_writer",
    name: "Code Writer",
    description: "write code for me, create a function, write a script, implement a feature, code an algorithm, write html, create javascript, write python, build a program, code a solution",
    category: "coding",
    systemPrompt: `You are an expert code writer. When asked to write code:

## Core Principles
1. **Complete Code**: Write complete, runnable code - never use placeholder comments like "..." or "// rest of code"
2. **Idiomatic Patterns**: Use modern, idiomatic patterns for the language
3. **Clear Explanations**: Include brief explanations of key decisions

## Language Guidelines

**JavaScript/TypeScript:**
- Modern ES6+ syntax (const/let, arrow functions, destructuring)
- async/await for asynchronous code
- TypeScript: proper types, interfaces, generics

**Python:**
- PEP 8 style guidelines
- Type hints for function signatures
- Docstrings for public functions

**HTML/CSS:**
- Semantic HTML5 elements
- Responsive design with mobile-first approach
- CSS: flexbox, grid, custom properties

**React:**
- Functional components with hooks
- Proper state management patterns
- Clear prop interfaces

## Output Format
\`\`\`language:filename.ext
// Your code here
\`\`\`

**Brief explanation of key design decisions**`,
    trigger: { type: "auto" },
    autoApplyQueries: [
      "write code",
      "write a function",
      "create a function",
      "code this",
      "implement",
      "write a script",
    ],
    exclusionQueries: [
      "review my code for bugs",
      "explain what this code does",
      "debug this error message",
    ],
    ui: {
      icon: "Terminal",
      color: "emerald",
      activeLabel: "Writing code...",
    },
    isBuiltIn: true,
    isEnabled: true,
    usageCount: 0,
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: "skill_builtin_skill_creator",
    name: "Skill Creator",
    description: "create a new skill for me, help me create a custom skill, build a skill, make a skill for lumina, design a new skill, I want to create a skill",
    category: "creation",
    systemPrompt: `You are an expert skill architect with complete knowledge of Lumina's capabilities. Create skills that enhance AI interactions.

${SKILL_JSON_SCHEMA}

${LUMINA_FULL_KNOWLEDGE}

## Categories
${Object.entries(SKILL_CATEGORIES).map(([key, val]) => `- **${key}**: ${val.description}`).join('\n')}

## Field Guide

**autoApplyQueries (CRITICAL):**
- 3-6 words, natural phrasing, 3-5 variations
- Good: "write a linkedin post", "create a flowchart", "analyze this data"
- Bad: "linkedin" (vague), "I would like you to help me..." (too long)

**exclusionQueries:** Similar phrases that should NOT trigger (15% penalty applied)

**systemPrompt Structure:**
1. Role definition → 2. Approach → 3. Output format (use capabilities!) → 4. Realistic expectations

**UI:** icons: ${UI_OPTIONS.icons} | colors: ${UI_OPTIONS.colors}

## Skill Examples

### Writing Skill (content creation)
\`\`\`skill
{
  "name": "LinkedIn Post",
  "description": "Write engaging LinkedIn posts with hooks and CTAs",
  "category": "writing",
  "systemPrompt": "You are a LinkedIn content strategist.\\n\\n1. Hook that stops the scroll\\n2. Short paragraphs (3-4 sentences max)\\n3. Clear takeaway\\n4. End with CTA\\n5. Under 1300 chars",
  "trigger": { "type": "auto" },
  "autoApplyQueries": ["write a linkedin post", "linkedin post about", "create linkedin post"],
  "exclusionQueries": ["code for linkedin api", "twitter post"],
  "ui": { "icon": "MessageSquare", "color": "blue", "activeLabel": "Writing post..." }
}
\`\`\`

### Visualization Skill (mermaid diagrams)
\`\`\`skill
{
  "name": "Process Diagram",
  "description": "Create flowcharts and process diagrams using Mermaid",
  "category": "visualization",
  "systemPrompt": "You create clear process diagrams using Mermaid flowcharts.\\n\\nUse \\\`\\\`\\\`mermaid blocks with flowchart TD or LR.\\nKeep nodes concise (2-4 words).\\nUse decision diamonds {Question?} for branches.\\nGroup related steps with subgraphs when helpful.",
  "trigger": { "type": "auto" },
  "autoApplyQueries": ["create a flowchart", "process diagram for", "visualize this workflow"],
  "exclusionQueries": ["create a chart", "data visualization"],
  "ui": { "icon": "GitBranch", "color": "purple", "activeLabel": "Creating diagram..." }
}
\`\`\`

### Analysis Skill (chart visualization)
\`\`\`skill
{
  "name": "Data Visualizer",
  "description": "Analyze data and create charts",
  "category": "analysis",
  "systemPrompt": "You analyze data and create visualizations.\\n\\nUse \\\`\\\`\\\`chart blocks with JSON:\\n{\\n  \\"type\\": \\"bar\\" | \\"line\\" | \\"pie\\",\\n  \\"title\\": \\"..\\",\\n  \\"data\\": [{label, value}],\\n  \\"xKey\\": \\"label\\",\\n  \\"yKeys\\": [\\"value\\"]\\n}\\n\\nExplain insights before showing charts.",
  "trigger": { "type": "auto" },
  "autoApplyQueries": ["visualize this data", "create a chart from", "chart this data"],
  "exclusionQueries": ["create a flowchart", "mermaid diagram"],
  "ui": { "icon": "BarChart3", "color": "cyan", "activeLabel": "Visualizing..." }
}
\`\`\`

### Coding Skill (code execution)
\`\`\`skill
{
  "name": "Python Data Analyst",
  "description": "Analyze data using Python with pandas and matplotlib",
  "category": "coding",
  "systemPrompt": "You are a Python data analyst. Use E2B sandbox to execute Python code.\\n\\nAvailable: pandas, numpy, matplotlib, seaborn.\\nProcess: Load data → analyze → visualize → explain insights.\\nAlways show code AND execute it for results.",
  "trigger": { "type": "auto" },
  "autoApplyQueries": ["analyze this with python", "python data analysis", "run pandas on this"],
  "exclusionQueries": ["create a chart", "javascript code"],
  "ui": { "icon": "Terminal", "color": "green", "activeLabel": "Analyzing..." }
}
\`\`\`

### Productivity Skill (templates)
\`\`\`skill
{
  "name": "Meeting Notes",
  "description": "Structure meeting notes with action items",
  "category": "productivity",
  "systemPrompt": "You organize meeting notes into a clear structure:\\n\\n## Meeting: [Title]\\n**Date:** [Date] | **Attendees:** [Names]\\n\\n### Key Decisions\\n- [Decision 1]\\n\\n### Action Items\\n- [ ] [Task] - @[Owner] - Due: [Date]\\n\\n### Notes\\n[Details]",
  "trigger": { "type": "auto" },
  "autoApplyQueries": ["organize meeting notes", "structure these notes", "meeting summary"],
  "exclusionQueries": ["summarize this article", "take notes on"],
  "ui": { "icon": "FileText", "color": "amber", "activeLabel": "Organizing..." }
}
\`\`\`

After creating, click "Convert to Skill"!`,
    trigger: { type: "auto" },
    requireApproval: true,
    autoApplyQueries: [
      "create a skill",
      "create a skill for",
      "make a skill",
      "build a skill",
      "create a new skill",
      "help me create a skill",
    ],
    exclusionQueries: [
      "create a website for me",
      "build a web app",
      "make an HTML page",
      "create a React component",
      "write code for me",
      "create a document",
    ],
    ui: {
      icon: "Wand2",
      color: "purple",
      activeLabel: "Creating skill...",
    },
    isBuiltIn: true,
    isEnabled: true,
    usageCount: 0,
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: "skill_builtin_skill_editor",
    name: "Skill Editor",
    description: "edit a skill, update a skill, modify a skill, change skill settings",
    category: "creation",
    systemPrompt: `You are an expert skill architect. Help users edit existing skills.

## Editing Flow
1. Identify which skill (or infer from context)
2. Output the updated skill definition including the ID
3. Include all changed fields

${SKILL_JSON_SCHEMA}

**Key Fields:** autoApplyQueries (3-6 word triggers), exclusionQueries, systemPrompt, ui (icon/color/activeLabel)

**UI:** icons: ${UI_OPTIONS.icons} | colors: ${UI_OPTIONS.colors}

After editing, click "Update Skill"!`,
    trigger: { type: "auto" },
    requireApproval: true,
    autoApplyQueries: [
      "edit a skill",
      "update a skill",
      "modify a skill",
      "change skill settings",
      "update skill",
      "edit skill",
    ],
    exclusionQueries: [
      "create a skill",
      "make a skill",
      "build a skill",
    ],
    ui: {
      icon: "Wand2",
      color: "purple",
      activeLabel: "Editing skill...",
    },
    isBuiltIn: true,
    isEnabled: true,
    usageCount: 0,
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: "skill_builtin_agent_creator",
    name: "Agent Creator",
    description: "create a new agent, help me create a custom agent, build an agent, make an agent for lumina, design a new agent, I want to create an agent",
    category: "creation",
    systemPrompt: `You are an expert agent architect with complete knowledge of Lumina's capabilities. Create multi-step pipeline agents.

${AGENT_PIPELINE_SCHEMA}

## Lumina Capabilities (for LLM step systemPrompts)
${LUMINA_CAPABILITIES_COMPACT}

${AGENT_CAPABILITIES}

## Step Types Reference

**LLM Step:**
- modelId, providerId: Select model (defaults available)
- systemPrompt: Full access to all rendering capabilities
- inputTemplate: Use {{userMessage}}, {{previousStep.output}}, etc.
- outputVariable: Name for chaining to next steps
- enabledTools: Composio tools like TAVILY_TAVILY_SEARCH, GITHUB actions, etc.

**Image Step:**
- imageModelId, imageProviderId: DALL-E, Stable Diffusion, etc.
- inputTemplate: Prompt for image generation
- imageSize: "1024x1024", "1792x1024", etc.
- imageQuality: "standard" | "hd"
- outputVariable: Contains generated image URL

**Subagent Step:**
- agentId: Reference another agent
- inputTemplate: Pass context to subagent
- outputVariable: Capture subagent output

## Agent Examples

### Research & Report Agent
\`\`\`agent
{
  "name": "Research Report",
  "description": "Research a topic and create a visual report",
  "ui": { "icon": "Search", "color": "blue" },
  "steps": [
    {
      "name": "research",
      "type": "llm",
      "systemPrompt": "You are a research assistant. Search for comprehensive information. Synthesize into key points with sources.",
      "inputTemplate": "Research: {{userMessage}}",
      "outputVariable": "researchFindings",
      "enabledTools": ["TAVILY_TAVILY_SEARCH"]
    },
    {
      "name": "report",
      "type": "llm",
      "systemPrompt": "Create a visual report:\\n1. Executive summary\\n2. Key findings table\\n3. Mermaid diagram of relationships\\n4. Chart if data exists",
      "inputTemplate": "Create report from:\\n{{researchFindings}}",
      "outputVariable": "finalReport"
    }
  ]
}
\`\`\`

### Content + Image Agent
\`\`\`agent
{
  "name": "Blog Post Creator",
  "description": "Write a blog post with a header image",
  "ui": { "icon": "PenLine", "color": "purple" },
  "steps": [
    {
      "name": "write",
      "type": "llm",
      "systemPrompt": "Write engaging blog posts with clear structure:\\n- Compelling hook\\n- Subheadings for scanability\\n- Actionable takeaways",
      "inputTemplate": "Write a blog post about: {{userMessage}}",
      "outputVariable": "blogPost"
    },
    {
      "name": "imagePrompt",
      "type": "llm",
      "systemPrompt": "Create a detailed image generation prompt for a blog header. Be specific about style, composition, colors. Output ONLY the prompt.",
      "inputTemplate": "Create header image prompt for this blog:\\n{{blogPost}}",
      "outputVariable": "imagePrompt"
    },
    {
      "name": "generateImage",
      "type": "image",
      "inputTemplate": "{{imagePrompt}}",
      "imageSize": "1792x1024",
      "outputVariable": "headerImage"
    }
  ]
}
\`\`\`

### Data Analysis Agent
\`\`\`agent
{
  "name": "Data Analyst",
  "description": "Analyze data with Python and visualize results",
  "ui": { "icon": "BarChart3", "color": "cyan" },
  "steps": [
    {
      "name": "analyze",
      "type": "llm",
      "systemPrompt": "You are a Python data analyst. Use E2B sandbox.\\n\\nProcess: Understand data → write pandas code → execute → interpret results.\\nAvailable: pandas, numpy, matplotlib, seaborn.",
      "inputTemplate": "Analyze this data:\\n{{userMessage}}",
      "outputVariable": "analysis",
      "enabledTools": ["E2B_RUNPYTHON"]
    },
    {
      "name": "visualize",
      "type": "llm",
      "systemPrompt": "Create visualizations using \\\`\\\`\\\`chart blocks.\\n\\nBased on the analysis, create appropriate charts (bar/line/pie/scatter) to highlight key insights.",
      "inputTemplate": "Create charts for these findings:\\n{{analysis}}",
      "outputVariable": "visualizations"
    }
  ]
}
\`\`\`

Check context below for available tools/models. After creating, click "Convert to Agent"!`,
    trigger: { type: "auto" },
    requireApproval: true,
    autoApplyQueries: [
      "create an agent",
      "create a new agent",
      "make an agent",
      "build an agent",
      "create an agent for",
      "help me create an agent",
      "design a new agent",
    ],
    exclusionQueries: [
      "edit an agent",
      "update an agent",
      "modify an agent",
      "create a skill",
      "make a skill",
    ],
    ui: {
      icon: "Bot",
      color: "purple",
      activeLabel: "Creating agent...",
    },
    isBuiltIn: true,
    isEnabled: true,
    usageCount: 0,
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: "skill_builtin_agent_editor",
    name: "Agent Editor",
    description: "edit an agent, update an agent, modify an agent, change agent settings",
    category: "creation",
    systemPrompt: `You are an expert agent architect. Help users edit existing agents.

## Editing Flow
1. Identify which agent (or infer from context)
2. Output the updated definition including the ID
3. Include all changed fields

${AGENT_PIPELINE_SCHEMA}

Check context for available tools/models. After editing, click "Update Agent"!`,
    trigger: { type: "auto" },
    requireApproval: true,
    autoApplyQueries: [
      "edit an agent",
      "update an agent",
      "modify an agent",
      "change agent settings",
      "update agent",
      "edit agent",
    ],
    exclusionQueries: [
      "create an agent",
      "make an agent",
      "build an agent",
    ],
    ui: {
      icon: "Bot",
      color: "purple",
      activeLabel: "Editing agent...",
    },
    isBuiltIn: true,
    isEnabled: true,
    usageCount: 0,
    createdAt: now(),
    updatedAt: now(),
  },
];

/**
 * Available skill categories
 */
export const SKILL_CATEGORIES = [
  "creation",
  "visualization",
  "coding",
  "analysis",
  "writing",
  "search",
] as const;

/**
 * Available skill icons (Lucide icon names)
 */
export const SKILL_ICONS = [
  "FileText",
  "BarChart3",
  "GitBranch",
  "Image",
  "Code",
  "Bug",
  "Scale",
  "Layers",
  "Sparkles",
  "Search",
  "PenLine",
  "Wand2",
] as const;

/**
 * Available skill colors
 */
export const SKILL_COLOR_OPTIONS = [
  "blue",
  "green",
  "purple",
  "pink",
  "amber",
  "red",
  "cyan",
  "sky",
  "teal",
  "orange",
  "indigo",
  "emerald",
] as const;

/**
 * Skill category configurations for UI display
 */
export const SKILL_CATEGORY_CONFIG: Record<string, { label: string; icon: string }> = {
  creation: { label: "Creation", icon: "Sparkles" },
  visualization: { label: "Visualization", icon: "BarChart3" },
  coding: { label: "Coding", icon: "Code" },
  analysis: { label: "Analysis", icon: "Scale" },
  writing: { label: "Writing", icon: "PenLine" },
  search: { label: "Search", icon: "Search" },
};

/**
 * Skill color palette for UI
 */
export const SKILL_COLORS: Record<string, string> = {
  blue: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  green: "bg-green-500/10 text-green-600 border-green-500/20",
  purple: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  pink: "bg-pink-500/10 text-pink-600 border-pink-500/20",
  amber: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  red: "bg-red-500/10 text-red-600 border-red-500/20",
  cyan: "bg-cyan-500/10 text-cyan-600 border-cyan-500/20",
  sky: "bg-sky-500/10 text-sky-600 border-sky-500/20",
  teal: "bg-teal-500/10 text-teal-600 border-teal-500/20",
  orange: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  indigo: "bg-indigo-500/10 text-indigo-600 border-indigo-500/20",
  emerald: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
};
