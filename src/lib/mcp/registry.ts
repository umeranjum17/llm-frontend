import { McpServer } from "@/lib/db/schema";

export type IntegrationKind = "hub" | "connector" | "tool";
export type IntegrationTransport = "sse" | "stdio";

export interface AuthSchema {
    type: "bearer" | "custom";
    headerName?: string;
    label?: string;
    placeholder?: string;
}

export interface SetupStep {
    title: string;
    description: string;
    link?: string;
}

export interface IntegrationDefinition extends Partial<McpServer> {
    id: string;
    name: string;
    description: string;
    kind: IntegrationKind;
    transport: IntegrationTransport;
    collection: "curated" | "custom";
    logoUrl?: string;
    author?: string;
    setup?: {
        steps: SetupStep[];
        docsUrl?: string;
    };
    auth?: AuthSchema;
    url?: string;
    category?: "search" | "code" | "data" | "productivity" | "automation";
    featured?: boolean;
    popularity?: number; // 1-5 stars
}

/**
 * Comprehensive MCP Plugin Registry
 * 
 * This registry contains all curated MCP servers available for installation.
 * Organized by category for easy discovery.
 */
export const MCP_REGISTRY: IntegrationDefinition[] = [
    // ==================== SEARCH & RESEARCH ====================
    {
        id: "brave-search",
        name: "Brave Search",
        description: "Privacy-focused web search powered by Brave. Get real-time information from the web without tracking.",
        kind: "tool",
        transport: "sse",
        collection: "curated",
        category: "search",
        url: "https://mcp.bravesearch.com/sse",
        logoUrl: "https://brave.com/static-assets/images/brave-logo-sans-text.svg",
        author: "Brave",
        featured: true,
        popularity: 5,
        auth: {
            type: "bearer",
            label: "Brave API Key",
            placeholder: "Enter your Brave Search API key"
        },
        setup: {
            steps: [
                { title: "Get API Key", description: "Sign up at Brave Search API", link: "https://api.search.brave.com/" },
                { title: "Enter your key", description: "Paste your API key below" }
            ],
            docsUrl: "https://api.search.brave.com/app/documentation"
        }
    },
    {
        id: "exa-search",
        name: "Exa Search",
        description: "Neural search engine that understands meaning. Find relevant content across the web using semantic search.",
        kind: "tool",
        transport: "sse",
        collection: "curated",
        category: "search",
        url: "https://mcp.exa.ai/sse",
        logoUrl: "https://exa.ai/favicon.ico",
        author: "Exa",
        popularity: 4,
        auth: {
            type: "bearer",
            label: "Exa API Key",
            placeholder: "Enter your Exa API key"
        },
        setup: {
            steps: [
                { title: "Create account", description: "Sign up for Exa", link: "https://exa.ai" },
                { title: "Get API key", description: "Copy your API key from dashboard" }
            ],
            docsUrl: "https://docs.exa.ai"
        }
    },
    {
        id: "perplexity",
        name: "Perplexity",
        description: "AI-powered research assistant with real-time web access. Get comprehensive answers with citations.",
        kind: "tool",
        transport: "sse",
        collection: "curated",
        category: "search",
        url: "https://mcp.perplexity.ai/sse",
        logoUrl: "https://www.perplexity.ai/favicon.ico",
        author: "Perplexity",
        featured: true,
        popularity: 5,
        auth: {
            type: "bearer",
            label: "Perplexity API Key",
            placeholder: "Enter your Perplexity API key"
        }
    },
    {
        id: "tavily",
        name: "Tavily",
        description: "Search API optimized for LLMs. Returns clean, structured results perfect for AI applications.",
        kind: "tool",
        transport: "sse",
        collection: "curated",
        category: "search",
        url: "https://mcp.tavily.com/sse",
        logoUrl: "https://tavily.com/favicon.ico",
        author: "Tavily",
        popularity: 4,
        auth: {
            type: "bearer",
            label: "Tavily API Key",
            placeholder: "Enter your Tavily API key"
        },
        setup: {
            steps: [
                { title: "Sign up", description: "Create a Tavily account", link: "https://tavily.com" },
                { title: "Get API key", description: "Copy from your dashboard" }
            ]
        }
    },

    // ==================== DEVELOPMENT ====================
    {
        id: "github",
        name: "GitHub",
        description: "Access GitHub repositories, issues, pull requests, code search, and more. Full GitHub integration.",
        kind: "tool",
        transport: "sse",
        collection: "curated",
        category: "code",
        url: "https://mcp.github.com/sse",
        logoUrl: "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png",
        author: "GitHub",
        featured: true,
        popularity: 5,
        auth: {
            type: "bearer",
            label: "GitHub Personal Access Token",
            placeholder: "ghp_..."
        },
        setup: {
            steps: [
                { title: "Create PAT", description: "Generate a Personal Access Token", link: "https://github.com/settings/tokens" },
                { title: "Select scopes", description: "Choose repo, read:org, read:user scopes" }
            ],
            docsUrl: "https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens"
        }
    },
    {
        id: "linear",
        name: "Linear",
        description: "Project management and issue tracking. Create issues, manage projects, and track progress.",
        kind: "tool",
        transport: "sse",
        collection: "curated",
        category: "code",
        url: "https://mcp.linear.app/sse",
        logoUrl: "https://linear.app/favicon.ico",
        author: "Linear",
        popularity: 4,
        auth: {
            type: "bearer",
            label: "Linear API Key",
            placeholder: "lin_api_..."
        },
        setup: {
            steps: [
                { title: "Get API key", description: "Go to Settings → API → Personal API keys", link: "https://linear.app/settings/api" }
            ]
        }
    },
    {
        id: "sentry",
        name: "Sentry",
        description: "Error tracking and performance monitoring. View exceptions, analyze stack traces, and debug issues.",
        kind: "tool",
        transport: "sse",
        collection: "curated",
        category: "code",
        url: "https://mcp.sentry.io/sse",
        logoUrl: "https://sentry.io/_static/favicon.ico",
        author: "Sentry",
        popularity: 4,
        auth: {
            type: "bearer",
            label: "Sentry Auth Token",
            placeholder: "sntrys_..."
        }
    },
    {
        id: "playwright",
        name: "Playwright",
        description: "Browser automation and testing. Navigate websites, take screenshots, and interact with web pages.",
        kind: "tool",
        transport: "sse",
        collection: "curated",
        category: "code",
        url: "https://mcp.playwright.dev/sse",
        logoUrl: "https://playwright.dev/img/playwright-logo.svg",
        author: "Microsoft",
        popularity: 4
    },

    // ==================== DATA & STORAGE ====================
    {
        id: "supabase",
        name: "Supabase",
        description: "Database operations, authentication, and storage. Query data, manage users, and access files.",
        kind: "tool",
        transport: "sse",
        collection: "curated",
        category: "data",
        url: "https://mcp.supabase.com/sse",
        logoUrl: "https://supabase.com/favicon.ico",
        author: "Supabase",
        featured: true,
        popularity: 5,
        auth: {
            type: "bearer",
            label: "Supabase Service Key",
            placeholder: "eyJ..."
        },
        setup: {
            steps: [
                { title: "Get service key", description: "Go to Project Settings → API", link: "https://app.supabase.com" },
                { title: "Copy service_role key", description: "Use the service_role secret key" }
            ],
            docsUrl: "https://supabase.com/docs"
        }
    },
    {
        id: "firecrawl",
        name: "Firecrawl",
        description: "Web scraping and crawling API. Extract clean, structured data from any website.",
        kind: "tool",
        transport: "sse",
        collection: "curated",
        category: "data",
        url: "https://mcp.firecrawl.dev/sse",
        logoUrl: "https://www.firecrawl.dev/favicon.ico",
        author: "Firecrawl",
        popularity: 4,
        auth: {
            type: "bearer",
            label: "Firecrawl API Key",
            placeholder: "fc_..."
        }
    },
    {
        id: "postgres",
        name: "PostgreSQL",
        description: "Direct PostgreSQL database access. Run queries, explore schemas, and manage data.",
        kind: "tool",
        transport: "sse",
        collection: "curated",
        category: "data",
        url: "https://mcp.postgres.dev/sse",
        logoUrl: "https://www.postgresql.org/media/img/about/press/elephant.png",
        author: "Community",
        popularity: 4,
        auth: {
            type: "custom",
            headerName: "X-Database-URL",
            label: "Database Connection URL",
            placeholder: "postgresql://user:pass@host:5432/db"
        }
    },

    // ==================== PRODUCTIVITY ====================
    {
        id: "notion",
        name: "Notion",
        description: "Access your Notion workspace. Search pages, read content, and manage databases.",
        kind: "tool",
        transport: "sse",
        collection: "curated",
        category: "productivity",
        url: "https://mcp.notion.so/sse",
        logoUrl: "https://www.notion.so/images/favicon.ico",
        author: "Notion",
        popularity: 5,
        auth: {
            type: "bearer",
            label: "Notion Integration Token",
            placeholder: "secret_..."
        },
        setup: {
            steps: [
                { title: "Create integration", description: "Go to Settings → Integrations", link: "https://www.notion.so/my-integrations" },
                { title: "Copy secret", description: "Copy the Internal Integration Token" },
                { title: "Share pages", description: "Share the pages you want accessible with the integration" }
            ]
        }
    },
    {
        id: "slack",
        name: "Slack",
        description: "Send messages, read channels, and search your Slack workspace.",
        kind: "tool",
        transport: "sse",
        collection: "curated",
        category: "productivity",
        url: "https://mcp.slack.com/sse",
        logoUrl: "https://a.slack-edge.com/80588/marketing/img/icons/icon_slack_hash_colored.png",
        author: "Slack",
        popularity: 4,
        auth: {
            type: "bearer",
            label: "Slack Bot Token",
            placeholder: "xoxb-..."
        }
    },
    {
        id: "google-drive",
        name: "Google Drive",
        description: "Access Google Drive files. Search, read documents, and manage files.",
        kind: "tool",
        transport: "sse",
        collection: "curated",
        category: "productivity",
        url: "https://mcp.google.com/drive/sse",
        logoUrl: "https://ssl.gstatic.com/docs/doclist/images/drive_2022q3_32dp.png",
        author: "Google",
        popularity: 4,
        auth: {
            type: "bearer",
            label: "Google OAuth Token",
            placeholder: "ya29...."
        }
    },

    // ==================== AUTOMATION HUBS ====================
    {
        id: "activepieces-hub",
        name: "Activepieces",
        description: "All-in-one automation hub. Connect 200+ apps including Google Sheets, Gmail, Notion, databases, and more through a single endpoint.",
        kind: "hub",
        transport: "sse",
        collection: "curated",
        category: "automation",
        logoUrl: "https://www.activepieces.com/favicon.ico",
        author: "Activepieces",
        featured: true,
        popularity: 5,
        setup: {
            steps: [
                { title: "Create account", description: "Sign up for Activepieces Cloud or self-host", link: "https://cloud.activepieces.com/sign-up" },
                { title: "Connect apps", description: "Go to AI → MCP and connect the apps you want to use" },
                { title: "Get SSE URL", description: "Copy the SSE endpoint URL from MCP settings" },
                { title: "Paste URL", description: "Add your MCP Server URL below" }
            ],
            docsUrl: "https://www.activepieces.com/docs/developers/mcp"
        },
        auth: {
            type: "bearer",
            label: "API Key (optional)",
            placeholder: "Enter your Activepieces API key if required"
        }
    },
    {
        id: "composio",
        name: "Composio",
        description: "AI tool orchestration platform. Access 150+ tools with managed auth and reliable execution.",
        kind: "hub",
        transport: "sse",
        collection: "curated",
        category: "automation",
        url: "https://mcp.composio.dev/sse",
        logoUrl: "https://composio.dev/favicon.ico",
        author: "Composio",
        popularity: 4,
        auth: {
            type: "bearer",
            label: "Composio API Key",
            placeholder: "..."
        },
        setup: {
            steps: [
                { title: "Sign up", description: "Create a Composio account", link: "https://composio.dev" },
                { title: "Get API key", description: "Copy from your dashboard" }
            ]
        }
    },
    {
        id: "n8n",
        name: "n8n",
        description: "Self-hostable workflow automation. Build complex automations and expose them as MCP tools.",
        kind: "hub",
        transport: "sse",
        collection: "curated",
        category: "automation",
        logoUrl: "https://n8n.io/favicon.ico",
        author: "n8n",
        popularity: 4,
        setup: {
            steps: [
                { title: "Set up n8n", description: "Deploy n8n locally or in the cloud", link: "https://n8n.io" },
                { title: "Enable MCP", description: "Configure MCP endpoint in n8n settings" },
                { title: "Add URL", description: "Enter your n8n MCP endpoint URL" }
            ]
        }
    }
];

/**
 * Get an integration definition by ID
 */
export function getIntegrationById(id: string): IntegrationDefinition | undefined {
    return MCP_REGISTRY.find(integration => integration.id === id);
}

/**
 * Get all hub-type integrations
 */
export function getHubIntegrations(): IntegrationDefinition[] {
    return MCP_REGISTRY.filter(integration => integration.kind === "hub");
}

/**
 * Get featured integrations
 */
export function getFeaturedIntegrations(): IntegrationDefinition[] {
    return MCP_REGISTRY.filter(integration => integration.featured);
}

/**
 * Get integrations by category
 */
export function getIntegrationsByCategory(category: string): IntegrationDefinition[] {
    return MCP_REGISTRY.filter(integration => integration.category === category);
}

/**
 * Get all unique categories
 */
export function getCategories(): string[] {
    const categories = new Set(MCP_REGISTRY.map(i => i.category).filter(Boolean));
    return Array.from(categories) as string[];
}
