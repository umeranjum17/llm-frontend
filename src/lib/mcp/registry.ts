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
 * MCP Plugin Registry
 *
 * This registry contains Composio MCP integration.
 */
export const MCP_REGISTRY: IntegrationDefinition[] = [
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
        featured: true,
        popularity: 5,
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
