import type { Skill } from "@/lib/db/schema";

function now() {
  return Date.now();
}

/**
 * Built-in skills with rich metadata for semantic matching.
 * Descriptions are crafted for embedding-based auto-detection.
 */
export const BUILTIN_SKILLS: Skill[] = [
  {
    id: "skill_builtin_summarize",
    name: "Summarize",
    description: "Summarize content, extract key points, condense text, give overview, TLDR, main takeaways, brief summary",
    category: "writing",
    systemPrompt: `You are a summarization expert. When summarizing content:

1. **Key Points**: Extract the most important information first
2. **Structure**: Use bullet points for clarity
3. **Brevity**: Be concise but don't lose essential details
4. **Action Items**: Highlight any actionable items if present
5. **Context**: Preserve enough context for understanding

Format your response as:
- **Summary**: 1-3 sentence overview
- **Key Points**: Bulleted list
- **Action Items** (if any): What needs to be done`,
    trigger: { type: "auto" },
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
    description: "Create chart, visualize data, plot graph, show statistics, bar chart, line graph, pie chart, data visualization, chart visualization",
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
    description: "Create diagram, flowchart, sequence diagram, architecture diagram, mermaid diagram, process flow, system architecture, ER diagram",
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
    trigger: { type: "auto" },
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
    id: "skill_builtin_generate_image",
    name: "Generate Image",
    description: "Generate image, create picture, draw illustration, AI art, image generation, visual, artwork",
    category: "creation",
    systemPrompt: `You are an AI image prompt engineer. Help users create effective prompts for image generation.

When the user wants to generate an image:
1. Clarify the concept if needed
2. Enhance the prompt with:
   - Subject description (who/what)
   - Setting/environment
   - Lighting and mood
   - Style (photorealistic, anime, oil painting, etc.)
   - Composition details
   - Quality modifiers (detailed, high quality, etc.)

Format your enhanced prompt clearly so it can be used with an image generation model.
If the user provides a specific style preference, incorporate it.`,
    userTemplate: `Generate an image based on this description:

{{description}}

Style: {{style}}`,
    variables: [
      { name: "description", placeholder: "Describe the image (e.g., 'A serene mountain lake at sunset')" },
      { name: "style", placeholder: "Art style (e.g., photorealistic, anime, oil painting)", defaultValue: "photorealistic" },
    ],
    trigger: { type: "auto" },
    ui: {
      icon: "Image",
      color: "pink",
      activeLabel: "Generating image...",
    },
    isBuiltIn: true,
    isEnabled: true,
    usageCount: 0,
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: "skill_builtin_code_review",
    name: "Code Review",
    description: "Review code, check for bugs, code quality, best practices, security review, code analysis, find issues",
    category: "coding",
    systemPrompt: `You are an expert code reviewer. When reviewing code:

1. **Correctness**: Identify bugs, logic errors, and edge cases
2. **Security**: Flag potential vulnerabilities (injection, XSS, etc.)
3. **Performance**: Note inefficiencies and optimization opportunities
4. **Style**: Check naming, formatting, and code organization
5. **Best Practices**: Suggest modern patterns and idioms

Format your review as:
- **Summary**: Overall assessment
- **Critical Issues** 🔴: Must fix
- **Warnings** 🟡: Should address
- **Suggestions** 🟢: Nice to have
- **Positive Notes** ✅: What's done well`,
    trigger: { type: "auto" },
    ui: {
      icon: "Code",
      color: "amber",
      activeLabel: "Reviewing code...",
    },
    isBuiltIn: true,
    isEnabled: true,
    usageCount: 0,
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: "skill_builtin_debug",
    name: "Debug",
    description: "Debug error, fix bug, troubleshoot issue, error message, not working, problem solving, stack trace, exception",
    category: "coding",
    systemPrompt: `You are an expert debugger. When helping with bugs:

1. **Understand**: Ask clarifying questions if the issue is unclear
2. **Analyze**: Examine error messages, stack traces, and logs
3. **Diagnose**: Identify the root cause, not just symptoms
4. **Fix**: Provide concrete solutions with code examples
5. **Prevent**: Suggest how to avoid similar issues

Structure your response:
- **Problem Analysis**: What's happening and why
- **Root Cause**: The underlying issue
- **Solution**: Step-by-step fix with code
- **Prevention**: How to avoid this in the future`,
    trigger: { type: "auto" },
    ui: {
      icon: "Bug",
      color: "red",
      activeLabel: "Debugging...",
    },
    isBuiltIn: true,
    isEnabled: true,
    usageCount: 0,
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: "skill_builtin_pros_cons",
    name: "Pros & Cons",
    description: "Compare options, pros and cons, trade-offs, which is better, decision analysis, comparison, evaluate alternatives",
    category: "analysis",
    systemPrompt: `You are a decision analysis expert. When comparing options:

1. **Understand Context**: Consider the user's specific situation
2. **Fair Analysis**: Present balanced pros and cons for each option
3. **Concrete Examples**: Use real-world scenarios
4. **Risk Assessment**: Highlight potential pitfalls
5. **Recommendation**: Provide a clear, justified recommendation

Format your analysis:
| Aspect | Option A | Option B |
|--------|----------|----------|
| Pro 1  | ✅       | ❌       |

**Recommendation**: [Your pick with reasoning]`,
    trigger: { type: "auto" },
    ui: {
      icon: "Scale",
      color: "cyan",
      activeLabel: "Analyzing...",
    },
    isBuiltIn: true,
    isEnabled: true,
    usageCount: 0,
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: "skill_builtin_create_react_app",
    name: "Create React App",
    description: "Build React application, create web app, React components, frontend development",
    category: "creation",
    systemPrompt: `You are a React expert. Create complete, runnable React applications.

When building React apps:
1. Use functional components with hooks
2. TypeScript for type safety
3. Tailwind CSS for styling (unless specified otherwise)
4. Clean, readable code with proper naming conventions
5. Responsive design principles

Structure your code with:
- **App.tsx** - Main application component
- **Component files** - Modular, reusable components
- **Styles** - Tailwind classes or CSS modules

Include comments for complex logic and make the app interactive with good UX.`,
    userTemplate: `Create a React application for the following:

**App Description:**
{{description}}

**Requirements:**
{{requirements}}`,
    variables: [
      { name: "description", placeholder: "What should the app do? (e.g., 'A todo list app with categories and due dates')" },
      { name: "requirements", placeholder: "Specific features or constraints", defaultValue: "Use Tailwind CSS for styling, include responsive design" },
    ],
    trigger: { type: "manual" }, // Manual only - no auto-trigger
    ui: {
      icon: "Layers",
      color: "sky",
      activeLabel: "Building app...",
    },
    isBuiltIn: true,
    isEnabled: true,
    usageCount: 0,
    createdAt: now(),
    updatedAt: now(),
  },
];

/**
 * Skill category configurations for UI display
 */
export const SKILL_CATEGORY_CONFIG: Record<string, { label: string; icon: string }> = {
  creation: { label: "Creation", icon: "Sparkles" },
  visualization: { label: "Visualization", icon: "BarChart3" },
  coding: { label: "Coding", icon: "Code" },
  analysis: { label: "Analysis", icon: "Search" },
  writing: { label: "Writing", icon: "PenLine" },
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
};
