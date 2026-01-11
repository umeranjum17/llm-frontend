---
name: Activepieces Hub Integration
overview: "Refine Lumina’s Integrations Marketplace around a single high-quality Integration Hub: Activepieces MCP (remote SSE). Users connect Google/Notion/SQL/etc. inside Activepieces once, then Lumina connects to one MCP endpoint, tests it, and lets users globally enable/disable tools before injecting them into chat."
todos:
  - id: select-activepieces-hub
    content: "Lock curated Integrations strategy to a single hub: Activepieces MCP; define registry entry fields and onboarding copy."
    status: pending
  - id: tool-governance-global
    content: Add global per-tool enable/disable in Lumina (persisted tool policy + UI toggles + injection-time filtering).
    status: pending
    dependencies:
      - select-activepieces-hub
  - id: test-connection-flow
    content: "Implement Test Connection: listTools, persist status/lastError/lastConnectedAt, show tool count and cache tools for toggle UI."
    status: pending
    dependencies:
      - select-activepieces-hub
  - id: runtime-compat-check
    content: Validate MCP SSE transport works in the current Next.js runtime; if not, move MCP tool discovery/calls to a Node runtime route while preserving chat streaming.
    status: pending
    dependencies:
      - test-connection-flow
  - id: safety-guards
    content: Add remote-only safety checks (https only, block private IPs/localhost, tool caps) for custom and hub URLs.
    status: pending
    dependencies:
      - test-connection-flow
---

# Refined Integrations Plan: Activepieces MCP Hub (Remote SSE)

### Decision (be specific)

- **We will use Activepieces MCP as the single third-party “Integration Hub.”**
- Rationale: **best UX** for power users with **minimal Lumina complexity**—Activepieces handles OAuth/connectors + workflow building; Lumina stays an MCP client. It also naturally supports “connect once, then expose many tools” via one MCP server URL.

### Target user experience (Lumina)

- **Settings → Integrations → Registry → Activepieces Hub → Connect**
- Lumina shows short steps:
- Create Activepieces account (cloud) or use self-host (still remote)
- Go to **AI → MCP** in Activepieces
- Connect apps/workflows you want (Google Sheets/Drive/Gmail, Notion, SQL, etc.)
- Copy the **MCP Server URL** (SSE)
- In Lumina, user pastes the URL (and optional auth header/token if Activepieces requires it).
- User clicks **Test connection** → Lumina calls `listTools` and shows:
- Connected ✅, tool count, and a preview list
- Or a clear error (auth, URL, network)
- **Global governance in Lumina**
- User can **enable/disable the entire hub**.
- User can **enable/disable individual tools** discovered from the hub (global toggle list).
- Only enabled tools are injected into chat.

### Architecture (what changes in Lumina)

#### 1) Registry: add a single curated Hub entry

- Add an `IntegrationDefinition` entry for **Activepieces Hub** in a static in-repo registry.
- Include:
- `kind: "hub"`
- `transport: "sse"`
- `setup` instructions (steps + links)
- `auth` schema (default bearer header; optional custom header)

#### 2) Persistence: store tool policy + cached tools

- Extend installed integration record (currently `McpServer`) to include:
- `toolPolicy` (start with **denylist**: “turn off a few tools” is the common UX)
- `cachedTools` + `lastConnectedAt` + `status` + `lastError`

#### 3) UI: first-class “Test connection” + tool toggles

- In Integrations settings, for the installed Activepieces entry:
- **Test connection** button
- Tools list (from cache + refresh)
- Per-tool on/off toggles (global)

#### 4) Runtime: tool injection filtered by policy

- `McpManager.getTools(...)` must:
- `listTools()`
- namespace tools (stable `integrationId/toolName`)
- filter tools by `toolPolicy`

#### 5) Safety

- Enforce remote-only:
- **https only**
- block localhost/private IP ranges
- cap number of enabled tools injected

### Important implementation risk to address early

- Your MCP loading currently runs from [`/home/umer/Documents/Github/llm-frontend/src/app/api/chat/route.ts`](/home/umer/Documents/Github/llm-frontend/src/app/api/chat/route.ts) with `runtime = "edge"`.
- The MCP SSE client (`@modelcontextprotocol/sdk` SSE transport) may not be fully compatible with Edge runtime depending on its EventSource/streaming assumptions.
- Plan: **validate MCP connection + listTools in the target runtime**. If incompatible, switch MCP operations to **Node runtime** for that route (or a dedicated Node route) while keeping chat streaming intact.

### Files likely involved (Lumina)

- Settings UI: [`/home/umer/Documents/Github/llm-frontend/src/components/settings/mcp-marketplace.tsx`](/home/umer/Documents/Github/llm-frontend/src/components/settings/mcp-marketplace.tsx) (rename/repurpose to Integrations)
- Registry: (new) `src/lib/integrations/registry.ts`
- DB schema: [`/home/umer/Documents/Github/llm-frontend/src/lib/db/schema.ts`](/home/umer/Documents/Github/llm-frontend/src/lib/db/schema.ts)
- Queries: [`/home/umer/Documents/Github/llm-frontend/src/lib/db/queries.ts`](/home/umer/Documents/Github/llm-frontend/src/lib/db/queries.ts)
- MCP manager: [`/home/umer/Documents/Github/llm-frontend/src/lib/mcp/mcp-manager.ts`](/home/umer/Documents/Github/llm-frontend/src/lib/mcp/mcp-manager.ts)
- Chat route injection: [`/home/umer/Documents/Github/llm-frontend/src/app/api/chat/route.ts`](/home/umer/Documents/Github/llm-frontend/src/app/api/chat/route.ts)

### Non-goals (for this refinement)

- No legacy “Connectors” (Notion mock / `@notion:`) path.
- No local/stdio MCP.
- No multiple hubs initially (Activepieces only).