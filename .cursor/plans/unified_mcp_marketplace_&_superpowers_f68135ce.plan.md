---
name: Unified MCP Marketplace & Superpowers
overview: Transition from app-specific connectors to a universal MCP-only architecture. This involves building a marketplace for MCP servers that gives Lumina "superpowers" like filesystem access, web searching, and service integrations using a standardized protocol.
todos:
  - id: mcp-core-refactor
    content: Refactor McpManager to support both SSE and Stdio transports
    status: pending
  - id: define-registry-list
    content: Define the initial curated registry of official MCP servers
    status: pending
  - id: mcp-marketplace-ui-impl
    content: Implement the MCP Marketplace UI in Settings
    status: pending
  - id: mcp-local-stdio
    content: Add Stdio support for local servers (using npx/uvx)
    status: pending
  - id: mcp-chat-integration
    content: Integrate dynamic MCP tool discovery into the Chat API pipeline
    status: pending
---

# Unified MCP Marketplace & Superpowers

This plan transitions Lumina to an "MCP-first" architecture, replacing the fragmented "Connectors" system with a universal Model Context Protocol (MCP) Marketplace.

### 1. Vision: Universal Extensibility

- **Standardized**: One protocol to rule them all. No more custom API wrappers.
- **Extensible**: Users can connect to *any* MCP server in the world.
- **Powerful**: Support for both Remote (SSE) and Local (Stdio/`npx`) servers.

### 2. Implementation Strategy

#### Phase 1: Core MCP Engine

- **McpManager**: A robust client manager in [`src/lib/mcp/mcp-manager.ts`](src/lib/mcp/mcp-manager.ts) that handles:
    - Connection pooling for multiple servers.
    - SSE transport (for remote services).
    - Stdio transport (for local commands like `npx @modelcontextprotocol/server-github`).
    - Tool, Resource, and Prompt discovery.
- **Persistence**: Store server configs (URLs, commands, API keys) in IndexedDB via [`src/lib/db/schema.ts`](src/lib/db/schema.ts).

#### Phase 2: The Marketplace UI

- **Marketplace Gallery**: A new settings page `src/components/settings/mcp-marketplace.tsx` featuring:
    - **Curated Servers**: Pre-defined templates for popular services (GitHub, Brave Search, Google Maps, Filesystem).
    - **Custom Add**: Ability to add any SSE URL or Stdio command.
    - **Key Management**: Unified way to enter and store credentials for these servers.

#### Phase 3: Integration

- **Chat API**: Update [`src/app/api/chat/route.ts`](src/app/api/chat/route.ts) to dynamically fetch and inject tools from *all* enabled MCP servers into the LLM context.
- **Tool Selector**: Update [`src/components/tools/tool-selector.tsx`](src/components/tools/tool-selector.tsx) to show tools grouped by MCP server.

### 3. Architecture Change

```mermaid
graph TD
    subgraph Old [Legacy Connectors]
        NC[Notion Connector]
        GC[GitHub Connector]
    end

    subgraph New [Universal MCP]
        Registry[Marketplace Registry]
        Manager[MCP Manager]
        SSE[SSE Transport]
        Stdio[Stdio Transport]
    end

    Registry --> Manager
    Manager --> SSE
    Manager --> Stdio
    
    SSE --> GitHub[GitHub MCP]
    SSE --> Brave[Brave Search MCP]
    Stdio --> LocalFiles[Local Filesystem MCP]
    Stdio --> Memory[Sequential Thinking MCP]
```

### 4. Key Files

- [`src/lib/mcp/mcp-manager.ts`](src/lib/mcp/mcp-manager.ts) (Major Update)
- [`src/lib/mcp/transports/`](src/lib/mcp/transports/) (New)
- [`src/components/settings/mcp-settings.tsx`](src/components/settings/mcp-settings.tsx) (New)
- [`src/app/api/chat/route.ts`](src/app/api/chat/route.ts) (Integration)