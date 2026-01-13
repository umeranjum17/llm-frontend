import type { Agent } from "@/lib/db/schema";

function now() {
  return Date.now();
}

// Recommended models for different use cases (2026 best picks)
export const RECOMMENDED_MODELS = {
  coding: "anthropic/claude-sonnet-4.5",        // Best for code & software engineering
  reasoning: "deepseek/deepseek-r1",            // Best for math, logic, complex reasoning
  general: "openai/gpt-5.2",                    // Best overall & general purpose
  fast: "google/gemini-2.5-flash",              // Best for speed & scale
  imageGeneration: "openai/dall-e-3",           // Image generation
  diagram: "anthropic/claude-sonnet-4.5",       // Good at structured output
  writing: "openai/gpt-5.2",                    // Reliable for writing
  agents: "x-ai/grok-5",                        // Real-time & tool calling
} as const;

export const BUILTIN_AGENTS: Agent[] = [
  {
    id: "agent_builtin_code_assistant",
    name: "Code Assistant",
    description: "Helps write, debug, and review code.",
    avatar: "💻",
    systemPrompt:
      "You are a senior software engineer. Ask clarifying questions when requirements are ambiguous. Provide concise, correct code and explain trade-offs briefly.",
    modelId: RECOMMENDED_MODELS.coding,
    enabledTools: [],
    mcpServerIds: [],
    knowledgeBaseIds: [],
    parameters: { temperature: 0.2 },
    isBuiltIn: true,
    isActive: true,
    createdAt: now(),
    updatedAt: now(),
    usageCount: 0,
  },
  {
    id: "agent_builtin_research_analyst",
    name: "Research Analyst",
    description: "Finds and synthesizes information with sources.",
    avatar: "🔎",
    systemPrompt:
      "You are a research analyst. Use web search when needed. Summarize findings clearly and include assumptions, caveats, and sources when applicable.",
    modelId: RECOMMENDED_MODELS.agents,
    enabledTools: [],
    mcpServerIds: [],
    knowledgeBaseIds: [],
    parameters: { temperature: 0.4 },
    isBuiltIn: true,
    isActive: true,
    createdAt: now(),
    updatedAt: now(),
    usageCount: 0,
  },
  {
    id: "agent_builtin_writing_editor",
    name: "Writing Editor",
    description: "Edits for clarity, tone, and structure.",
    avatar: "✍️",
    systemPrompt:
      "You are an expert editor. Improve clarity and structure while preserving the author's intent. Suggest alternatives and keep the tone consistent.",
    modelId: RECOMMENDED_MODELS.writing,
    enabledTools: [],
    mcpServerIds: [],
    knowledgeBaseIds: [],
    parameters: { temperature: 0.6 },
    isBuiltIn: true,
    isActive: true,
    createdAt: now(),
    updatedAt: now(),
    usageCount: 0,
  },
  {
    id: "agent_builtin_translator",
    name: "Translator",
    description: "Translates text while preserving meaning and tone.",
    avatar: "🌐",
    systemPrompt:
      "You are a professional translator. Preserve meaning, tone, and formatting. Ask what target language and regional variant to use if unclear.",
    modelId: RECOMMENDED_MODELS.fast,
    enabledTools: [],
    mcpServerIds: [],
    knowledgeBaseIds: [],
    parameters: { temperature: 0.3 },
    isBuiltIn: true,
    isActive: true,
    createdAt: now(),
    updatedAt: now(),
    usageCount: 0,
  },
  {
    id: "agent_builtin_summarizer",
    name: "Summarizer",
    description: "Summarizes content with key points and takeaways.",
    avatar: "🧾",
    systemPrompt:
      "You summarize content. Produce a short summary, then key bullet points, and optional action items if applicable.",
    modelId: RECOMMENDED_MODELS.fast,
    enabledTools: [],
    mcpServerIds: [],
    knowledgeBaseIds: [],
    parameters: { temperature: 0.4 },
    isBuiltIn: true,
    isActive: true,
    createdAt: now(),
    updatedAt: now(),
    usageCount: 0,
  },
  {
    id: "agent_builtin_eli5",
    name: "Explain Like I'm 5",
    description: "Explains concepts simply with examples.",
    avatar: "🧠",
    systemPrompt:
      "Explain concepts in simple terms with intuitive analogies. Avoid jargon unless asked. Offer a short example.",
    modelId: RECOMMENDED_MODELS.general,
    enabledTools: [],
    mcpServerIds: [],
    knowledgeBaseIds: [],
    parameters: { temperature: 0.7 },
    isBuiltIn: true,
    isActive: true,
    createdAt: now(),
    updatedAt: now(),
    usageCount: 0,
  },
  {
    id: "agent_builtin_logo_generator",
    name: "Logo Generator",
    description: "Creates logos and brand visuals with AI image generation.",
    avatar: "🎨",
    systemPrompt:
      "You are a professional logo designer. When asked to create a logo, generate detailed image prompts. Focus on: simplicity, memorability, scalability, appropriate symbolism, and brand alignment. Ask about preferred style (minimalist, vintage, modern, playful), colors, and industry if not specified.",
    modelId: RECOMMENDED_MODELS.imageGeneration,
    enabledTools: [],
    mcpServerIds: [],
    knowledgeBaseIds: [],
    parameters: { temperature: 0.8 },
    isBuiltIn: true,
    isActive: true,
    createdAt: now(),
    updatedAt: now(),
    usageCount: 0,
  },
  {
    id: "agent_builtin_diagram_creator",
    name: "Diagram Creator",
    description: "Creates flowcharts, architecture diagrams, and visualizations.",
    avatar: "📊",
    systemPrompt: `You are an expert at creating diagrams using Mermaid syntax. Create clear, well-organized diagrams.

When creating diagrams, output a \`mermaid\` code block. Choose the most appropriate type:
- flowchart TD/LR for processes and workflows
- sequenceDiagram for interactions and API flows
- classDiagram for code structure
- erDiagram for database schemas
- gantt for timelines

Keep diagrams readable with clear labels and logical flow. Break complex diagrams into sections if needed.`,
    modelId: RECOMMENDED_MODELS.diagram,
    enabledTools: [],
    mcpServerIds: [],
    knowledgeBaseIds: [],
    parameters: { temperature: 0.3 },
    isBuiltIn: true,
    isActive: true,
    createdAt: now(),
    updatedAt: now(),
    usageCount: 0,
  },
  {
    id: "agent_builtin_chart_builder",
    name: "Chart Builder",
    description: "Visualizes data as interactive charts and graphs.",
    avatar: "📈",
    systemPrompt: `You are a data visualization expert. Transform data into clear, insightful charts.

Output charts as JSON in a \`chart\` code block:
\`\`\`chart
{
  "type": "bar|line|area|pie|scatter",
  "title": "Chart Title",
  "data": [{"name": "A", "value": 10}],
  "xKey": "name",
  "yKeys": ["value"],
  "showGrid": true,
  "showLegend": true
}
\`\`\`

Choose the right chart type:
- bar: comparing categories
- line: trends over time
- area: cumulative values
- pie: parts of a whole
- scatter: correlations

Always explain what the data shows and any insights.`,
    modelId: RECOMMENDED_MODELS.diagram,
    enabledTools: [],
    mcpServerIds: [],
    knowledgeBaseIds: [],
    parameters: { temperature: 0.3 },
    isBuiltIn: true,
    isActive: true,
    createdAt: now(),
    updatedAt: now(),
    usageCount: 0,
  },
];

