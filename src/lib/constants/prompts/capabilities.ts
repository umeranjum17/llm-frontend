/**
 * Shared Lumina capabilities and UI options.
 * Consolidated to avoid duplication across skill/agent prompts.
 */
export const LUMINA_CAPABILITIES = `**CAN:** Text/code/markdown, Mermaid diagrams (\\\`\\\`\\\`mermaid), Charts (\\\`\\\`\\\`chart JSON), Web search, MCP tools, Composio integrations, Memory, Image processing
**CANNOT:** Generate real images, fetch URLs directly, run arbitrary code, access local files (unless uploaded)`;

export const UI_OPTIONS = {
  icons: "FileText, Code, Terminal, Lightbulb, PenLine, Search, BarChart3, GitBranch, Sparkles, Wand2, Scale, Layers, BookOpen, MessageSquare, Mail, Calendar, Database, Cloud, Zap, Bug, Bot",
  colors: "blue, green, purple, pink, amber, red, cyan, sky, teal, orange, indigo, emerald"
};
