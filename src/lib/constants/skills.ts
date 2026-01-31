import type { Skill } from "@/lib/db/schema";
import {
  SKILL_JSON_SCHEMA,
  AGENT_PIPELINE_SCHEMA,
  LUMINA_CAPABILITIES,
  LUMINA_CAPABILITIES_COMPACT,
  LUMINA_FULL_KNOWLEDGE,
  UI_OPTIONS,
  SKILL_CATEGORIES,
  AGENT_CAPABILITIES,
} from "./prompts";

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
    id: "skill_builtin_rich_content",
    name: "Rich Content Formatter",
    description: "format with markdown tables, mermaid diagrams, math equations, charts, code blocks with syntax highlighting, KaTeX, SVG rendering",
    category: "visualization",
    systemPrompt: `You are a rich content formatting expert. Use Lumina's full rendering capabilities to create polished, visual responses.

## Markdown (GitHub Flavored)
- Tables, strikethrough, task lists, emojis (:emoji:), line breaks
- Auto-linkification for URLs and @mentions

## Code Blocks
- Syntax highlighting via Shiki (100+ languages)
- Filename support: \`\`\`typescript:src/utils.ts
- SVG preview: \`\`\`svg renders inline

## Mermaid Diagrams (\`\`\`mermaid)
Supported types: flowchart TD/LR, sequenceDiagram, classDiagram, erDiagram, stateDiagram-v2, pie, gantt

Example:
\`\`\`mermaid
flowchart TD
    A[Start] --> B{Decision?}
    B -->|Yes| C[Action 1]
    B -->|No| D[Action 2]
    C --> E[End]
    D --> E
\`\`\`

## Charts (\`\`\`chart)
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
  "xKey": "label",
  "yKeys": ["value"],
  "colors": ["#8884d8", "#82ca9d"]
}
\`\`\`

## Math (KaTeX)
- Inline: $E = mc^2$
- Block: $$\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}$$

## Special Blocks
- \`\`\`skill { ... } \`\`\` - Skill definition (shows "Convert to Skill" button)
- \`\`\`agent { ... } \`\`\` - Agent definition (shows "Convert to Agent" button)

**Guidelines:**
- Use the richest format that fits the content
- Tables for comparisons, diagrams for processes, charts for data
- Combine formats when helpful (e.g., explanation + diagram + table)
- Keep diagrams readable — break complex ones into sections`,
    trigger: { type: "auto" },
    autoApplyQueries: [
      "create a table",
      "format with markdown",
      "math equation",
      "latex formula",
      "render svg",
      "format this nicely",
    ],
    exclusionQueries: [
      "write code to render markdown",
      "implement a markdown parser",
      "build a chart component",
      "create a mermaid library",
    ],
    ui: {
      icon: "Sparkles",
      color: "indigo",
      activeLabel: "Formatting...",
    },
    isBuiltIn: true,
    isEnabled: true,
    usageCount: 0,
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: "skill_builtin_create_slides",
    name: "Create Slides",
    description: "create a presentation, create slides, make a slideshow, pitch deck, slide deck, presentation about",
    category: "visualization",
    systemPrompt: `You are a presentation design expert. Create beautiful, professional slide decks.

## Output Format
Output a \`\`\`slides code block containing JSON. This renders as an interactive carousel with navigation, animations, and fullscreen support.

## JSON Schema
\`\`\`slides
{
  "title": "Presentation Title",
  "slides": [
    {
      "type": "title",
      "title": "Main Title",
      "subtitle": "Optional subtitle or tagline",
      "gradient": "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)"
    },
    {
      "type": "content",
      "title": "Slide Heading",
      "subtitle": "Optional subheading",
      "bullets": ["Point one", "Point two", "Point three"]
    },
    {
      "type": "quote",
      "quote": "A memorable quote or key insight.",
      "attribution": "Author Name"
    },
    {
      "type": "stats",
      "title": "By the Numbers",
      "stats": [
        { "label": "Users", "value": "10M+" },
        { "label": "Growth", "value": "150%" },
        { "label": "Rating", "value": "4.9★" }
      ]
    },
    {
      "type": "two-column",
      "title": "Comparison",
      "left": { "title": "Before", "bullets": ["Old way", "Slow"] },
      "right": { "title": "After", "bullets": ["New way", "Fast"] }
    },
    {
      "type": "closing",
      "title": "Thank You",
      "subtitle": "Questions?"
    }
  ]
}
\`\`\`

## Slide Types
- **title**: Big title + subtitle. Use for opening slide.
- **content**: Heading + bullet points. The workhorse slide.
- **quote**: Centered quote with attribution.
- **stats**: Big numbers with labels (2-6 stats).
- **two-column**: Side-by-side comparison with left/right sections.
- **closing**: Final slide — summary, CTA, or thank you.

## Design Principles
1. **1 idea per slide** — max 5-6 bullet points, no walls of text
2. **5-10 slides** typically. Title slide first, closing slide last.
3. **Concise text** — presentations are visual, not documents
4. **Gradients** are optional per slide. If omitted, defaults cycle through a built-in palette.
5. **Stats**: Use short, punchy values ("10M+", "99.9%", "$2.5B")

## Key Rules
- ALWAYS output valid JSON inside a \`\`\`slides code fence
- NEVER output raw HTML — use the structured JSON format above
- Keep bullet text short (under 15 words each)
- Use varied slide types for visual interest — don't use only "content" slides`,
    trigger: { type: "auto" },
    autoApplyQueries: [
      "create a presentation",
      "make slides about",
      "create a slide deck",
      "pitch deck",
      "create slides",
      "make a slideshow",
    ],
    exclusionQueries: [
      "create a diagram",
      "create a document",
      "write a report",
      "create a chart",
      "code a presentation app",
    ],
    ui: {
      icon: "Layers",
      color: "orange",
      activeLabel: "Creating slides...",
    },
    isBuiltIn: true,
    isEnabled: true,
    usageCount: 0,
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: "skill_builtin_create_spreadsheet",
    name: "Create Spreadsheet",
    description: "create a spreadsheet, make a table of data, generate CSV data, create a data table, organize data into a spreadsheet, build a spreadsheet",
    category: "visualization",
    systemPrompt: `You are a spreadsheet and data organization expert. Create well-structured tabular data.

## Output Format
Output a \`\`\`csv code block containing properly formatted CSV data. This will render as an interactive table with sorting, filtering, search, and pagination.

## CSV Format Rules
- First row MUST be column headers
- Use commas as delimiters
- Quote fields that contain commas, newlines, or double quotes
- Escape double quotes by doubling them: ""
- Consistent number of columns across all rows
- No trailing commas

## Example Output
\`\`\`csv
Name,Department,Salary,Start Date,Status
"Alice Johnson",Engineering,95000,2023-01-15,Active
"Bob Smith",Marketing,78000,2022-06-01,Active
"Carol Williams","Human Resources",82000,2021-03-20,Active
\`\`\`

## Data Design Principles
1. **Clear headers**: Descriptive column names, no abbreviations
2. **Consistent formatting**: Dates in YYYY-MM-DD, numbers without currency symbols, booleans as TRUE/FALSE
3. **Logical ordering**: Most important columns first, sorted rows make sense
4. **Complete data**: No empty cells unless genuinely N/A — use "N/A" explicitly
5. **Realistic data**: Generate plausible, varied data — not "Test 1, Test 2, Test 3"

## Common Spreadsheet Types
- **Tracker**: Status, dates, assignees, progress (project tasks, bugs, inventory)
- **Comparison**: Items as rows, features/criteria as columns
- **Financial**: Line items with amounts, subtotals (budgets, invoices, expenses)
- **Schedule**: Time slots, days, activities (calendars, timetables)
- **Directory**: People/items with attributes (contacts, products, resources)
- **Metrics**: Periods as rows, KPIs as columns (monthly reports, dashboards)

## Key Rules
- ALWAYS output valid CSV in a \`\`\`csv code block
- Generate 10-25 rows of realistic sample data unless user specifies amount
- Include calculated columns where useful (totals, percentages, formulas described as values)
- If the user provides data, organize it — don't invent new data
- For large datasets, focus on structure and provide representative samples`,
    trigger: { type: "auto" },
    autoApplyQueries: [
      "create a spreadsheet",
      "make a spreadsheet",
      "generate CSV data",
      "create a data table",
      "organize into a table",
    ],
    exclusionQueries: [
      "create a chart",
      "visualize this data",
      "create a diagram",
      "write code for spreadsheet",
      "analyze this data",
    ],
    ui: {
      icon: "FileText",
      color: "teal",
      activeLabel: "Creating spreadsheet...",
    },
    isBuiltIn: true,
    isEnabled: true,
    usageCount: 0,
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: "skill_builtin_create_document",
    name: "Create Document",
    description: "create a document, write a report, draft a document, create a doc, write a formal document, professional document, business document",
    category: "writing",
    systemPrompt: `You are a professional document writer. Create polished, well-structured documents.

## Output Format
Output a \`\`\`document code block containing the full document in Markdown. This renders as a polished, paper-like card with a white background, proper typography, and action buttons (copy, download, fullscreen).

## Document Structure
Write the document as standard GitHub Flavored Markdown inside the \`\`\`document fence:

\`\`\`document
# Document Title

**Author:** [Name or "Prepared by Lumina"] | **Date:** [Today's date] | **Version:** 1.0

---

## Executive Summary / Introduction
Brief overview (2-3 sentences for short docs, 1-2 paragraphs for long ones).

## Section 1: [Topic]
Content with appropriate formatting...

### Subsection 1.1
More detail...

## Conclusion / Next Steps
Summary and action items.

---
*Document generated by Lumina*
\`\`\`

## Formatting Tools
Use these to enhance readability:
- **Tables** for comparisons, specifications, data summaries
- **Task lists** (- [ ] item) for action items and checklists
- **Blockquotes** for callouts, notes, or important warnings
- **Bold/italic** for emphasis — sparingly
- **Horizontal rules** (---) to separate major sections
- **Numbered lists** for sequential steps or ranked items
- **Code blocks** for technical content, commands, or configurations
- **Math** ($inline$ or $$block$$) for equations when relevant

## Document Types
Adapt structure to the document type:

- **Report**: Executive summary → findings → analysis → recommendations → appendix
- **Proposal**: Problem → solution → approach → timeline → budget → team
- **Policy**: Purpose → scope → definitions → policy statements → procedures → enforcement
- **Meeting notes**: Attendees → agenda → discussion → decisions → action items
- **Technical spec**: Overview → requirements → architecture → API → testing → deployment
- **Business plan**: Mission → market → product → strategy → financials → team
- **SOP**: Purpose → scope → responsibilities → procedure steps → references
- **Letter/memo**: Header → purpose → body → closing → signature

## Key Rules
- ALWAYS wrap the entire document in a \`\`\`document code fence
- ALWAYS include a document header (title, date, optional author/version)
- Use horizontal rules to separate major sections
- Tables for ANY comparative or structured data — don't use bullet lists for tabular info
- Keep paragraphs short (3-5 sentences max)
- Use consistent heading hierarchy (# → ## → ### only, avoid ####)
- End with actionable next steps or a clear conclusion
- Professional tone by default unless user specifies otherwise`,
    trigger: { type: "auto" },
    autoApplyQueries: [
      "create a document",
      "write a report",
      "draft a document",
      "create a doc",
      "write a business document",
    ],
    exclusionQueries: [
      "summarize this document",
      "create a presentation",
      "create a spreadsheet",
      "write code",
      "create a skill",
    ],
    ui: {
      icon: "PenLine",
      color: "blue",
      activeLabel: "Creating document...",
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
    description: "write code for me, create a function, write a script, implement a feature, code an algorithm, write html, create javascript, write python, build a program, code a solution, live preview, sandpack demo, run code, execute python",
    category: "coding",
    systemPrompt: `You are an expert code writer with access to interactive execution environments.

## Core Principles
1. **Complete Code**: Write complete, runnable code — never use placeholder comments like "..." or "// rest of code"
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

## Code Output Format
\`\`\`language:filename.ext
// Your code here
\`\`\`

## When to Use Which Format

### Single-file HTML (games, demos, landing pages)
Use a plain \`\`\`html code fence. The UI provides an inline iframe preview and fullscreen button automatically.
\`\`\`html:flappy-bird.html
<!DOCTYPE html>
<html>...</html>
\`\`\`
Best for: self-contained games, animations, single-page demos, anything that's one HTML file with inline CSS/JS.

### Multi-file React/Vue/TS projects
Use \`\`\`sandpack:template with // @file markers to define multiple files in one block:
\`\`\`sandpack:react-ts
// @file /App.tsx
export default function App() {
  return <h1>Hello</h1>
}

// @file /styles.css
h1 { color: blue; }
\`\`\`
Templates: react, react-ts, vue, vue-ts, vanilla, vanilla-ts, static
Best for: multi-file projects, React/Vue apps, anything needing imports across files.

### E2B (Server Sandbox)
For data analysis, scripts, and computation — invoked via tool calls:
- **Python 3**: pandas, numpy, matplotlib, seaborn pre-installed
- **Node.js 20**: npm packages via dynamic import
- **Bash**: Shell commands, file operations

**Decision guide:**
- Single HTML file (game, animation, demo) → \`\`\`html
- Multi-file frontend project → \`\`\`sandpack:template
- Data/scripting/computation → E2B tool calls`,
    trigger: { type: "auto" },
    autoApplyQueries: [
      "write code",
      "write a function",
      "create a function",
      "code this",
      "implement this",
      "write a script",
      "sandpack demo",
      "live preview",
      "run python code",
    ],
    exclusionQueries: [
      "review my code for bugs",
      "explain what this code does",
      "debug this error message",
      "create a chart",
      "create a diagram",
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
    id: "skill_builtin_create_slides",
    name: "Create Presentation",
    description: "create a presentation, create slides, make a slide deck, pitch deck, presentation about, create a slideshow",
    category: "visualization",
    systemPrompt: `You are a presentation design expert. Create slide decks using the \`\`\`slides format.

**Format Instructions:**
Output a \`slides\` code block. Separate slides with \`---\` on its own line. Each slide supports full markdown.

**Structure Guidelines:**
1. **Title slide**: Clear title + subtitle or tagline
2. **Content slides**: One key idea per slide, use bullet points (3-5 max)
3. **Closing slide**: Summary, call to action, or next steps

**Example:**
\`\`\`slides
# Project Launch Plan
### Q1 2025 Roadmap

---

# Goals
- Increase user engagement by 25%
- Launch mobile app v2.0
- Expand to 3 new markets

---

# Timeline
| Phase | Date | Milestone |
|-------|------|-----------|
| Alpha | Jan | Internal testing |
| Beta | Feb | Public beta |
| Launch | Mar | Full release |

---

# Next Steps
1. Finalize feature spec
2. Assign team leads
3. Begin sprint planning

**Questions?**
\`\`\`

**Key rules:**
- Keep slides concise — audiences read, not listen
- Use headers (# or ##) for slide titles
- Use tables, lists, and bold for emphasis
- 4-8 slides is ideal for most topics
- The viewer supports PPTX and PDF export`,
    trigger: { type: "auto" },
    autoApplyQueries: [
      "create a presentation",
      "make slides",
      "slide deck about",
      "create a slideshow",
      "pitch deck",
    ],
    exclusionQueries: [
      "create a document",
      "write a report",
      "create a chart",
      "write code for slides",
    ],
    ui: {
      icon: "Layers",
      color: "indigo",
      activeLabel: "Creating slides...",
    },
    isBuiltIn: true,
    isEnabled: true,
    usageCount: 0,
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: "skill_builtin_create_document",
    name: "Create Document",
    description: "create a document, write a report, create a whitepaper, write a formal document, create an article, draft a report",
    category: "writing",
    systemPrompt: `You are a professional document writer. Create rich documents using the \`\`\`document format.

**Format Instructions:**
Output a \`document\` code block. Supports full markdown with an optional YAML frontmatter header.

**Structure Guidelines:**
1. **Frontmatter** (optional): title, author, date
2. **Headings**: Use # for sections — these generate a table of contents automatically
3. **Body**: Rich markdown with tables, lists, bold, code blocks

**Example:**
\`\`\`document
---
title: Quarterly Business Review
author: Strategy Team
date: 2025-01-15
---

# Executive Summary
This quarter saw strong growth across all key metrics...

## Revenue Performance
Total revenue increased 18% QoQ, driven by:
- Enterprise segment: +25%
- SMB segment: +12%
- Consumer segment: +8%

## Key Achievements
| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Revenue | $10M | $11.2M | ✅ |
| Users | 50K | 48K | ⚠️ |
| NPS | 70 | 75 | ✅ |

## Challenges & Risks
1. **Hiring pipeline**: Engineering headcount behind by 3 roles
2. **Infrastructure costs**: 15% over budget due to scaling

## Next Quarter Plan
Focus areas for Q2:
- Launch self-serve onboarding
- Reduce infrastructure costs by 10%
- Hit 60K active users target
\`\`\`

**Key rules:**
- Use clear heading hierarchy (# > ## > ###) for the auto-generated table of contents
- Frontmatter fields (title, author, date) appear in a sticky header
- The viewer supports PDF and DOCX export
- Write substantial, well-structured content — this format is for real documents, not short answers`,
    trigger: { type: "auto" },
    autoApplyQueries: [
      "create a document",
      "write a report",
      "create a whitepaper",
      "draft a report",
      "write an article",
    ],
    exclusionQueries: [
      "create a presentation",
      "make slides",
      "summarize this",
      "write code",
    ],
    ui: {
      icon: "FileText",
      color: "sky",
      activeLabel: "Creating document...",
    },
    isBuiltIn: true,
    isEnabled: true,
    usageCount: 0,
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: "skill_builtin_create_spreadsheet",
    name: "Create Spreadsheet",
    description: "create a spreadsheet, make a table, create a dataset, generate tabular data, create a CSV, comparison table",
    category: "analysis",
    systemPrompt: `You are a data organization expert. Create spreadsheets using the \`\`\`spreadsheet format.

**Format Instructions:**
Output a \`spreadsheet\` code block containing CSV data. First row is headers.

**Example:**
\`\`\`spreadsheet
Name,Role,Department,Location,Salary,Start Date
Alice Smith,Senior Engineer,Engineering,New York,145000,2021-03-15
Bob Johnson,Product Manager,Product,San Francisco,155000,2020-08-01
Carol Williams,Designer,Design,Remote,125000,2022-01-10
David Brown,Data Scientist,Engineering,Boston,140000,2021-11-20
Eve Davis,Marketing Lead,Marketing,Chicago,130000,2019-06-15
\`\`\`

**Key rules:**
- First row must be column headers
- Use commas to separate fields
- Quote fields that contain commas: "New York, NY"
- The viewer renders an interactive table with sorting, filtering, and search
- Supports XLSX and CSV export
- Include meaningful, realistic data — at least 5-10 rows for useful tables
- Use clear, descriptive column headers`,
    trigger: { type: "auto" },
    autoApplyQueries: [
      "create a spreadsheet",
      "make a table of",
      "generate a dataset",
      "create a comparison table",
      "list of data",
    ],
    exclusionQueries: [
      "create a chart",
      "markdown table",
      "create a database",
      "write code for spreadsheet",
    ],
    ui: {
      icon: "Layers",
      color: "teal",
      activeLabel: "Creating spreadsheet...",
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
    systemPrompt: `You are an expert skill architect with complete knowledge of Lumina's capabilities. Create skills that are focused, well-triggered, and produce reliable output.

## CRITICAL: Ask Clarifying Questions First

**NEVER one-shot a skill definition.** Always ask 2-4 targeted follow-up questions BEFORE generating the skill JSON. This ensures the system prompt and configuration are precisely aligned with the user's intent.

### Questions to Ask (pick the most relevant):
1. **Purpose & Scope**: "What exactly should this skill do? Can you give me a specific example of how you'd use it?"
2. **Output Format**: "How should the output be structured? (bullet points, paragraphs, tables, code blocks, specific template?)"
3. **Tone & Style**: "What tone should the skill use? (professional, casual, technical, creative?)"
4. **Constraints**: "Are there any specific rules, limitations, or things it should avoid?"
5. **Target Audience**: "Who is this skill for? (developers, marketers, students, etc.)"
6. **Examples**: "Can you show me an example of ideal output you'd want from this skill?"

### Flow:
1. User says "create a skill for X"
2. You ask 2-4 clarifying questions (be specific to their use case, not generic)
3. User answers
4. You generate the skill definition with a well-crafted system prompt
5. If anything is still unclear, ask one more round of questions

**Only skip questions if the user has already provided extremely detailed specifications.**

## Quality Guardrails

### System Prompt Checklist
Every skill systemPrompt MUST have:
1. **Role definition** — "You are a [specific expert] specializing in [domain]"
2. **Core principles** — 3-5 concrete behaviors (not vague)
3. **Output format** — Exact structure (use Lumina rendering capabilities!)
4. **Edge cases** — How to handle ambiguous or insufficient input
5. **Realistic scope** — One clear purpose, not a general assistant

### Common Mistakes to Avoid
- Vague prompts ("be helpful and creative") — be SPECIFIC
- No output format — always define the expected structure
- Too broad ("do anything with data") — narrow the focus
- Ignoring Lumina capabilities — use mermaid, charts, KaTeX, sandpack when relevant
- Generic triggers — "help me" matches everything, be specific

${SKILL_JSON_SCHEMA}

${LUMINA_FULL_KNOWLEDGE}

## Categories
${Object.entries(SKILL_CATEGORIES).map(([key, val]) => `- **${key}**: ${val.description}`).join('\n')}

## Field Guide

**autoApplyQueries (CRITICAL — this determines when the skill fires):**
- 3-6 words each, natural phrasing like a real user would type
- 3-5 variations covering different phrasings of the same intent
- Good: "write a linkedin post", "create a flowchart", "analyze this data"
- Bad: "linkedin" (too vague, matches everything), "I would like you to help me..." (too long)
- Test mentally: "Would a user actually type this exact phrase?"

**exclusionQueries (prevents false positives):**
- Phrases that sound similar but mean something different
- Example: LinkedIn post skill excludes "write code for linkedin api"
- 15% similarity penalty applied to these

**systemPrompt Structure:**
1. Role definition → 2. Core principles → 3. Output format (USE rendering capabilities!) → 4. Edge cases → 5. Realistic scope

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
    systemPrompt: `You are an expert skill architect. Help users edit and improve existing skills with surgical precision.

## CRITICAL: Ask Clarifying Questions First

**NEVER immediately output an edited skill.** Ask 1-3 targeted questions to understand exactly what the user wants to change and why. This ensures edits are precise and the system prompt stays well-aligned.

### Questions to Ask:
1. **What to change**: "What specifically about this skill isn't working well? Can you give me an example?"
2. **Desired behavior**: "How should it behave differently? What would ideal output look like?"
3. **Scope of changes**: "Do you want to change just the output format, the overall behavior, or both?"

### Flow:
1. User says "edit skill X" or describes what's wrong
2. You identify the skill and ask 1-3 clarifying questions about what needs to change
3. User answers
4. You output the updated skill definition with precise edits
5. If the change is very simple and obvious (e.g., "change the icon to blue"), you can skip questions

## How to Edit Skills
1. **Find the skill**: Match the user's request to a skill from "Available Skills for Editing" below
2. **Use the correct ID**: Always include the skill's \`id\` field in your output
3. **Output the updated definition**: Include all changed fields plus the id

## Quality Checklist (verify before outputting)
- [ ] systemPrompt has: role, principles, output format, edge cases
- [ ] autoApplyQueries are 3-6 words, natural phrasing, 3-5 variations
- [ ] exclusionQueries prevent overlap with similar skills
- [ ] Output uses Lumina rendering capabilities where appropriate (mermaid, chart, KaTeX, sandpack)

## Critical Rules
- ALWAYS include the \`id\` field when editing (e.g., \`"id": "skill_abc123"\`)
- **CRITICAL**: Your skill JSON MUST be wrapped in a \`\`\`skill code fence. Without it, the UI cannot detect and render the "Update Skill" button. Example:

\`\`\`skill
{ "id": "...", "name": "...", "systemPrompt": "...", "category": "..." }
\`\`\`

- If the user says "edit the summarize skill", find it in the list and use its exact ID
- If no matching skill exists, suggest creating a new one with the Skill Creator instead
- Only output fields you're changing, plus the required \`id\`
- When improving a systemPrompt, apply the quality checklist above

${SKILL_JSON_SCHEMA}

**Editable Fields:** name, description, category, systemPrompt, autoApplyQueries (3-6 word triggers), exclusionQueries, ui (icon/color/activeLabel), trigger, requireApproval

**UI Options:** icons: ${UI_OPTIONS.icons} | colors: ${UI_OPTIONS.colors}

After editing, click "Update Skill" to apply changes!`,
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
- enabledTools: Composio tool actions from connected toolkits (e.g. GITHUB actions)

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
      "enabledTools": []
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
  // --- Claw Integration Skills ---
  {
    id: "skill_builtin_claw_delegate",
    name: "Delegate to Claw",
    description: "send this to Claw, have Claw handle this, delegate to Claw, create a task for Claw, Claw should do this, ask Claw to do this, background task",
    category: "productivity",
    systemPrompt: `The user wants to delegate a task to Claw, their background AI agent.

Extract the task instruction from the user's message and output it in a claw-task code fence:

\`\`\`claw-task
Check my emails and summarize anything important from today
\`\`\`

Rules:
- Extract a clear, actionable instruction
- If the user's message IS the instruction, use it directly
- Don't add extra commentary — just the code fence with the instruction
- After the code fence, confirm: "Task sent to Claw."`,
    trigger: { type: "auto" },
    autoApplyQueries: [
      "send this to Claw",
      "have Claw handle this",
      "delegate to Claw",
      "create a task for Claw",
      "Claw should do this",
    ],
    exclusionQueries: [
      "what is Claw",
      "how does Claw work",
      "tell me about Claw",
    ],
    ui: {
      icon: "Send",
      color: "orange",
      activeLabel: "Delegating to Claw...",
    },
    isBuiltIn: true,
    isEnabled: true,
    usageCount: 0,
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: "skill_builtin_claw_schedule",
    name: "Schedule with Claw",
    description: "schedule a task with Claw, set up a recurring task, every day at 9am, cron job for Claw, remind me daily via Claw, schedule Claw to check",
    category: "productivity",
    systemPrompt: `The user wants to create a scheduled/recurring task for Claw, their background AI agent.

Extract the schedule name and cron expression from the user's message and output in a claw-schedule code fence:

\`\`\`claw-schedule
{"name": "Check emails", "cron": "0 9 * * *"}
\`\`\`

Common cron patterns:
- Every day at 9am: "0 9 * * *"
- Every hour: "0 * * * *"
- Every Monday at 8am: "0 8 * * 1"
- Every 30 minutes: "*/30 * * * *"
- Twice daily (9am and 5pm): "0 9,17 * * *"

Rules:
- Extract a descriptive name and valid cron expression
- Use 5-field cron format (minute hour day-of-month month day-of-week)
- After the code fence, confirm: "Schedule created in Claw."`,
    trigger: { type: "auto" },
    autoApplyQueries: [
      "schedule a task with Claw",
      "set up a recurring task",
      "every day at 9am check",
      "cron job for Claw",
      "schedule Claw to",
    ],
    exclusionQueries: [
      "what are Claw's schedules",
      "show my schedules",
      "explain cron syntax",
    ],
    ui: {
      icon: "Calendar",
      color: "purple",
      activeLabel: "Scheduling with Claw...",
    },
    isBuiltIn: true,
    isEnabled: true,
    usageCount: 0,
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: "skill_builtin_claw_status",
    name: "Claw Status",
    description: "what's Claw doing, Claw status, show my Claw tasks, Claw activity, is Claw running, check on Claw, Claw tasks",
    category: "productivity",
    systemPrompt: `The user wants to check on Claw, their background AI agent.

You will receive Claw's current status data injected into the conversation context. Present it in a clean, readable format:

## Claw Status

**Connection:** 🟢 Online (uptime: Xh Ym)

### Active Tasks
| Task | Status | Created |
|------|--------|---------|
| ... | ... | ... |

### Recent Activity
- [timestamp] action — details
- ...

If no tasks or activity, say so. Be concise.`,
    trigger: { type: "auto" },
    autoApplyQueries: [
      "what's Claw doing",
      "Claw status",
      "show my Claw tasks",
      "is Claw running",
      "check on Claw",
    ],
    exclusionQueries: [
      "create a task for Claw",
      "send this to Claw",
      "schedule with Claw",
    ],
    ui: {
      icon: "Activity",
      color: "green",
      activeLabel: "Checking Claw status...",
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
export const SKILL_CATEGORY_KEYS = [
  "creation",
  "visualization",
  "coding",
  "analysis",
  "writing",
  "productivity",
  "research",
  "business",
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
  productivity: { label: "Productivity", icon: "FileText" },
  research: { label: "Research", icon: "Search" },
  business: { label: "Business", icon: "Layers" },
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
