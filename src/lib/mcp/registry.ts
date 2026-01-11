import { McpServer } from "@/lib/db/schema";

export const MCP_REGISTRY = [
    {
        id: "brave-search",
        name: "Brave Search",
        description: "Web search capabilities using Brave Search API.",
        url: "https://mcp-proxy.lumina.ai/sse/brave", // Hypothetical proxy or user self-hosted
        collection: "curated",
        type: "sse",
        logoUrl: "https://brave.com/static-assets/images/brave-logo-sans-text.svg",
        author: "Lumina Team"
    },
    {
        id: "github-tools",
        name: "GitHub Integration",
        description: "Read issues, PRs and file content from GitHub repositories.",
        url: "https://mcp-proxy.lumina.ai/sse/github",
        collection: "curated",
        type: "sse",
        logoUrl: "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png",
        author: "Lumina Team"
    }
] as Partial<McpServer>[];
