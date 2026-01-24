/**
 * Comprehensive Lumina capabilities and UI options.
 * Used by Skill Creator, Agent Creator, and other system prompts.
 */

// ============================================================================
// RENDERING CAPABILITIES
// ============================================================================

export const RENDERING_CAPABILITIES = `## Rendering Capabilities

### Markdown
- GitHub Flavored Markdown: tables, strikethrough, task lists, emojis (:emoji:), line breaks
- Auto-linkification for URLs and @mentions

### Code Blocks
- Syntax highlighting via Shiki (100+ languages)
- Filename support: \`\`\`typescript:src/utils.ts
- SVG preview: \`\`\`svg renders inline
- Multi-file Sandpack: See Code Execution section

### Mermaid Diagrams (\`\`\`mermaid)
Supported types:
- flowchart TD/LR (most common)
- sequenceDiagram
- classDiagram
- erDiagram
- stateDiagram-v2
- pie
- gantt

Example:
\`\`\`mermaid
flowchart TD
    A[Start] --> B{Decision?}
    B -->|Yes| C[Action 1]
    B -->|No| D[Action 2]
    C --> E[End]
    D --> E
\`\`\`

### Charts (\`\`\`chart)
JSON format with bar, line, area, pie, scatter types.

Schema:
\`\`\`chart
{
  "type": "bar" | "line" | "area" | "pie" | "scatter",
  "title": "Chart Title",
  "data": [
    { "label": "Category A", "value": 100 },
    { "label": "Category B", "value": 200 }
  ],
  "xKey": "label",  // for bar/line/area/scatter
  "yKeys": ["value"],  // array of keys to plot
  "colors": ["#8884d8", "#82ca9d"]  // optional
}
\`\`\`

### Math (KaTeX)
- Inline: $E = mc^2$
- Block: $$\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}$$

### Special Blocks
- \`\`\`skill { ... } \`\`\` - Skill definition (shows "Convert to Skill" button)
- \`\`\`agent { ... } \`\`\` - Agent definition (shows "Convert to Agent" button)`;

// ============================================================================
// CODE EXECUTION CAPABILITIES
// ============================================================================

export const CODE_EXECUTION_CAPABILITIES = `## Code Execution

### Sandpack (Browser-based)
Interactive code editor with live preview. Templates:
- **react**, **react-ts** - React with JSX/TSX
- **vue**, **vue-ts** - Vue 3 SFCs
- **vanilla**, **vanilla-ts** - Plain JS/TS
- **static** - HTML/CSS only

Usage: \`\`\`sandpack:react-ts or multi-file format
Multi-file example:
\`\`\`sandpack:react-ts
// @file /App.tsx
export default function App() {
  return <h1>Hello</h1>
}

// @file /styles.css
h1 { color: blue; }
\`\`\`

### E2B (Server Sandbox)
Secure cloud execution for Python, Node.js, Bash.
- **Python 3**: pandas, numpy, matplotlib, seaborn pre-installed
- **Node.js 20**: npm packages via dynamic import
- **Bash**: Shell commands, file operations

E2B is invoked via tool calls, not code blocks. Use for:
- Data analysis with pandas/matplotlib
- File processing
- Complex computations
- Package installation (pip/npm)`;

// ============================================================================
// INTEGRATION CAPABILITIES
// ============================================================================

export const INTEGRATION_CAPABILITIES = `## Integrations

### Composio (Primary Tool Provider)
150+ toolkits for external services. Common toolkits:
- **TAVILY**, **EXA**, **PERPLEXITYAI** - Web search
- **GITHUB**, **GITLAB** - Code repositories
- **GMAIL**, **OUTLOOK** - Email
- **SLACK**, **DISCORD** - Messaging
- **GOOGLECALENDAR**, **OUTLOOK_CALENDAR** - Scheduling
- **GOOGLEDRIVE**, **DROPBOX** - File storage
- **LINEAR**, **JIRA**, **ASANA** - Project management
- **NOTION**, **CODA** - Docs/wikis
- **TWITTER**, **LINKEDIN** - Social media
- **FIRECRAWL**, **BROWSERBASE** - Web scraping/automation

**Router Mode**: When search tools enabled, uses COMPOSIO_SEARCH_TOOLS router → MULTI_EXECUTE_TOOL for execution.

### Mem0 (Memory System)
Automatic context memory:
- Extracts key facts from conversations
- Stores user preferences
- Retrieves relevant memories for context
- No explicit action needed - works automatically

### Image Processing
- Accepts uploaded images in chat
- Can describe, analyze, OCR images
- Cannot generate new images directly (use dedicated image generation pipelines)`;

// ============================================================================
// SKILL SYSTEM DETAILS
// ============================================================================

export const SKILL_SYSTEM_DETAILS = `## Skill Matching System

### How Matching Works
User messages are matched to skills via Top-1 semantic embedding similarity:
- Match scores typically range 0.25-0.55 (not 0-1!)
- Higher is better, but 0.35+ is usually a good match
- 15% penalty applied to exclusionQueries matches

### autoApplyQueries (CRITICAL)
Natural phrases users would type:
- **Length**: 3-6 words (not too short, not too long)
- **Count**: 3-5 variations covering different phrasings
- **Style**: Natural, like real user input

Good examples:
- "write a linkedin post"
- "summarize this document"
- "create a flowchart diagram"
- "analyze this data"

Bad examples:
- "linkedin" (too vague - matches everything)
- "I would like you to help me write a professional LinkedIn post" (too long)
- "POST_LINKEDIN" (not natural language)

### exclusionQueries
Similar phrases that should NOT trigger this skill:
- Prevents false positives
- Use when skills might overlap
- Example: LinkedIn skill excludes "write code for linkedin api"

### Categories
- **writing** - Content creation, copywriting, documentation
- **coding** - Programming, debugging, code review
- **visualization** - Charts, diagrams, data viz
- **analysis** - Research, data analysis, reports
- **productivity** - Automation, organization, planning
- **creation** - Meta skills (creating other skills/agents)`;

// ============================================================================
// LIMITATIONS
// ============================================================================

export const LIMITATIONS = `## Limitations

**Cannot do:**
- Generate images directly (use image generation agents/pipelines)
- Fetch arbitrary URLs (use Composio tools like FIRECRAWL for web scraping)
- Run arbitrary system code (only sandboxed E2B execution)
- Access local files (must be uploaded to chat)
- Make authenticated API calls without Composio connection

**Best practices:**
- For web data: Use search tools (TAVILY, EXA) or scraping (FIRECRAWL)
- For images: Create agent with image generation step
- For code: Use E2B sandbox or Sandpack preview
- For integrations: Check Composio toolkit availability`;

// ============================================================================
// COMBINED EXPORTS
// ============================================================================

export const LUMINA_CAPABILITIES = `${RENDERING_CAPABILITIES}

${CODE_EXECUTION_CAPABILITIES}

${INTEGRATION_CAPABILITIES}

${SKILL_SYSTEM_DETAILS}

${LIMITATIONS}`;

/**
 * Token-efficient version for contexts where full detail isn't needed
 */
export const LUMINA_CAPABILITIES_COMPACT = `**Rendering:** Markdown (GFM), code blocks (Shiki, 100+ langs, filename:path format), Mermaid diagrams (\`\`\`mermaid - flowchart/sequence/class/ER/state/pie/gantt), Charts (\`\`\`chart JSON - bar/line/area/pie/scatter), Math (KaTeX $inline$ $$block$$), Special blocks (\`\`\`skill, \`\`\`agent)

**Code Execution:** Sandpack (browser: react/vue/vanilla/static templates, multi-file support), E2B sandbox (Python+pandas/numpy/matplotlib, Node.js 20, Bash)

**Integrations:** Composio (150+ toolkits: search, GitHub, email, calendar, Slack, project mgmt, social), Mem0 (auto memory), Image processing (analysis only, no generation)

**Skill Matching:** autoApplyQueries 3-6 words, natural phrasing, 3-5 variations. Scores 0.25-0.55 typical. exclusionQueries get 15% penalty.

**Cannot:** Generate images directly, fetch arbitrary URLs, run unsandboxed code, access local files`;

// ============================================================================
// UI OPTIONS
// ============================================================================

export const UI_OPTIONS = {
  icons: "FileText, Code, Terminal, Lightbulb, PenLine, Search, BarChart3, GitBranch, Sparkles, Wand2, Scale, Layers, BookOpen, MessageSquare, Mail, Calendar, Database, Cloud, Zap, Bug, Bot, Palette, Camera, Music, Video, Globe, Lock, Shield, Heart, Star, Award, TrendingUp, PieChart, Activity, Briefcase, Users, UserPlus, Settings, Wrench, Hammer, Puzzle, Rocket, Target, Flag, Clock, Bell, Bookmark, Link, Share, Download, Upload, Folder, File, Image, Mic, Phone, MapPin, Navigation, Compass, Sun, Moon, Coffee, Gift, ShoppingCart, CreditCard, DollarSign, Calculator, Percent, Hash, AtSign, Send, Reply, Edit, Trash, Copy, Scissors, Clipboard, Archive",
  colors: "blue, green, purple, pink, amber, red, cyan, sky, teal, orange, indigo, emerald, violet, rose, lime, yellow, slate, zinc, neutral, stone"
};

// ============================================================================
// SKILL CATEGORIES
// ============================================================================

export const SKILL_CATEGORIES = {
  writing: {
    name: "Writing",
    description: "Content creation, copywriting, documentation, editing",
    examples: ["blog posts", "emails", "documentation", "social media"]
  },
  coding: {
    name: "Coding",
    description: "Programming, debugging, code review, architecture",
    examples: ["code review", "debugging", "refactoring", "documentation"]
  },
  visualization: {
    name: "Visualization",
    description: "Charts, diagrams, data visualization, presentations",
    examples: ["flowcharts", "data charts", "architecture diagrams", "timelines"]
  },
  analysis: {
    name: "Analysis",
    description: "Research, data analysis, reports, insights",
    examples: ["data analysis", "research summaries", "competitive analysis", "reports"]
  },
  productivity: {
    name: "Productivity",
    description: "Automation, organization, planning, workflows",
    examples: ["meeting notes", "task planning", "templates", "checklists"]
  },
  creation: {
    name: "Creation",
    description: "Meta skills for creating other skills and agents",
    examples: ["skill creator", "agent builder", "prompt engineering"]
  }
};

// ============================================================================
// EXISTING SKILLS REFERENCE
// ============================================================================

export const EXISTING_SKILLS_REFERENCE = `## Built-in Skills Reference

These skills already exist - don't recreate them, but learn from their patterns:

### Summarize (writing)
- **Purpose**: Summarize articles, documents, text
- **Pattern**: Extracts key points → bullet structure → action items
- **Triggers**: "summarize this", "TLDR", "key points", "condense this"

### Create Chart (visualization)
- **Purpose**: Data visualization with \`\`\`chart blocks
- **Pattern**: Asks clarifying questions → determines best chart type → outputs JSON
- **Output**: \`\`\`chart with type, title, data array, xKey, yKeys
- **Triggers**: "create a chart", "visualize this data", "plot this"

### Create Diagram (visualization)
- **Purpose**: Mermaid diagrams for processes/architecture
- **Pattern**: Understands relationships → picks diagram type → outputs mermaid
- **Output**: \`\`\`mermaid with flowchart/sequence/class/ER/state
- **Triggers**: "create a diagram", "draw a flowchart", "architecture diagram"

### Code Writer (coding)
- **Purpose**: Write complete, runnable code
- **Pattern**: Understands requirements → writes idiomatic code → explains
- **Languages**: ES6+, TypeScript, Python, HTML/CSS, React, Node.js
- **Triggers**: "write code", "create a function", "implement this"

### Skill Creator (creation)
- **Purpose**: Help users create new skills
- **Pattern**: Gathers requirements → outputs \`\`\`skill JSON → user converts
- **Triggers**: "create a skill", "make a skill for lumina"

### Agent Creator (creation)
- **Purpose**: Help users create multi-step agents
- **Pattern**: Designs pipeline → outputs \`\`\`agent JSON → user converts
- **Triggers**: "create an agent", "build an agent"`;

// ============================================================================
// SYSTEM PROMPT PATTERNS
// ============================================================================

export const SYSTEM_PROMPT_PATTERNS = `## System Prompt Best Practices

### Structure Pattern
1. **Role Definition**: "You are an expert/specialist in X"
2. **Core Principles**: 3-5 key behaviors or guidelines
3. **Output Format**: Specify exactly what format to use
4. **Examples**: Show 1-2 concrete examples
5. **Edge Cases**: Handle common issues

### Effective Prompt Patterns

**For Content Creation:**
\`\`\`
You are a [role] specializing in [domain].

When creating [content type]:
1. [Key principle 1]
2. [Key principle 2]
3. [Output format requirement]

Format: [Specific structure]
\`\`\`

**For Data Processing:**
\`\`\`
You analyze [input type] and produce [output type].

Process:
1. [Step 1]
2. [Step 2]
3. [Validation step]

Output format: [JSON/Markdown/etc with schema]
\`\`\`

**For Visualization Skills:**
\`\`\`
You create [diagram/chart type] from user descriptions.

Use \\\`\\\`\\\`[format] blocks with:
- [Required element 1]
- [Required element 2]

Keep [specific constraint].
\`\`\`

### What Makes Skills Effective
- **Focused scope**: One clear purpose, not a general assistant
- **Specific outputs**: Define exact format (mermaid, chart, JSON, etc.)
- **Actionable triggers**: 3-6 word phrases users naturally type
- **Complementary exclusions**: Prevent overlap with similar skills`;

// ============================================================================
// AGENT CAPABILITIES
// ============================================================================

export const AGENT_CAPABILITIES = `## Agent Pipeline Capabilities

Agents chain multiple steps for complex workflows. Each step can:

### LLM Steps
- Use any model (GPT-4, Claude, Gemini, local models)
- Have unique systemPrompt optimized for that step
- Enable specific Composio tools (search, GitHub, email, etc.)
- Pass output via {{stepName.output}} to next steps
- Use all rendering capabilities (mermaid, charts, code blocks)

### Image Steps
- Generate images via DALL-E, Stable Diffusion, etc.
- Chain with LLM: generate prompt → create image
- Configure size, quality, style
- Output image URL for display

### Subagent Steps
- Nest other agents for complex workflows
- Reuse existing agents as building blocks
- Pass context between agents

### Example Patterns

**Research → Report:**
1. LLM + search tools → research findings
2. LLM → formatted report with charts/diagrams

**Content + Visual:**
1. LLM → written content
2. Image → matching visual

**Multi-format Output:**
1. LLM → analyze data
2. LLM → create mermaid diagram
3. LLM → create chart visualization

### Built-in Agent: Logo Generator
Two-step pipeline demonstrating advanced patterns:
1. **Analyze step**: Vision model extracts brand colors from uploaded images, detects dark/light mode, creates optimized image prompt
2. **Generate step**: Image model creates logo with extracted colors and requirements`;

// ============================================================================
// FULL KNOWLEDGE BASE
// ============================================================================

export const LUMINA_FULL_KNOWLEDGE = `${LUMINA_CAPABILITIES}

${EXISTING_SKILLS_REFERENCE}

${SYSTEM_PROMPT_PATTERNS}

${AGENT_CAPABILITIES}`;
