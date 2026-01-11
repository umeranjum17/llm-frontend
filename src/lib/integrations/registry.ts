import { McpServer } from "@/lib/db/schema";

export type IntegrationKind = "hub" | "connector" | "tool";
export type IntegrationTransport = "sse" | "stdio";

export interface AuthSchema {
  type: "bearer" | "custom";
  headerName?: string; // For custom header auth
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

  // Hub-specific fields
  setup?: {
    steps: SetupStep[];
    docsUrl?: string;
  };
  auth?: AuthSchema;

  // For connectors/tools
  url?: string;
}

/**
 * Curated Integrations Registry
 *
 * This registry defines the official, curated integration hubs available in Lumina.
 * For the Activepieces Hub integration strategy, this contains a single hub entry.
 */
export const INTEGRATIONS_REGISTRY: IntegrationDefinition[] = [
  {
    id: "activepieces-hub",
    name: "Activepieces Hub",
    description: "Connect to Google Sheets, Notion, Gmail, SQL databases, and hundreds of other apps through Activepieces. Set up workflows and expose them as AI tools.",
    kind: "hub",
    transport: "sse",
    collection: "curated",
    logoUrl: "https://www.activepieces.com/favicon.ico",
    author: "Activepieces",
    setup: {
      steps: [
        {
          title: "Create an Activepieces account",
          description: "Sign up for Activepieces Cloud or deploy your own instance",
          link: "https://cloud.activepieces.com/sign-up"
        },
        {
          title: "Connect your apps",
          description: "In Activepieces, go to AI → MCP and connect the apps you want to use (Google, Notion, databases, etc.)",
          link: "https://www.activepieces.com/docs/developers/mcp"
        },
        {
          title: "Get your MCP Server URL",
          description: "Copy the SSE endpoint URL from Activepieces MCP settings",
        },
        {
          title: "Paste the URL below",
          description: "Add your MCP Server URL and optional authentication token",
        }
      ],
      docsUrl: "https://www.activepieces.com/docs/developers/mcp"
    },
    auth: {
      type: "bearer",
      label: "API Key (optional)",
      placeholder: "Enter your Activepieces API key if required"
    }
  }
];

/**
 * Get an integration definition by ID
 */
export function getIntegrationById(id: string): IntegrationDefinition | undefined {
  return INTEGRATIONS_REGISTRY.find(integration => integration.id === id);
}

/**
 * Get all hub-type integrations
 */
export function getHubIntegrations(): IntegrationDefinition[] {
  return INTEGRATIONS_REGISTRY.filter(integration => integration.kind === "hub");
}

/**
 * Get all curated integrations
 */
export function getCuratedIntegrations(): IntegrationDefinition[] {
  return INTEGRATIONS_REGISTRY.filter(integration => integration.collection === "curated");
}
