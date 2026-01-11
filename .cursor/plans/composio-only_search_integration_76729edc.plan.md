---
name: Composio-Only Search Integration
overview: Deprecate all other integration paths and make Composio the single integration hub for Lumina. Users generate a Composio MCP URL/API key once on composio.dev, paste it in Lumina, test connection, cache tools, and govern per-tool toggles before chat injection.
todos:
  - id: deprecate-old
    content: Remove legacy connectors/other hubs; Composio only
    status: pending
  - id: registry-composio
    content: Single Composio definition in registry
    status: pending
    dependencies:
      - deprecate-old
  - id: db-state
    content: InstalledIntegration supports Composio fields/tools/status
    status: pending
    dependencies:
      - registry-composio
  - id: ui-settings
    content: Composio-only settings UI with test+tool toggles
    status: pending
    dependencies:
      - db-state
  - id: runtime-inject
    content: Inject/filter Composio tools; safety caps; runtime fallback
    status: pending
    dependencies:
      - db-state
  - id: qa
    content: Test URL/auth/listTools/policy/caps/SSRF/fallback
    status: pending
    dependencies:
      - runtime-inject
---

# Composio-Only Search Integration

## What changes

- Remove legacy connectors/other hubs and make **Composio** the only supported integration path (remote MCP SSE).
- Users go to composio.dev once to generate the MCP URL + key, paste into Lumina, test connection, cache tools, and enable/disable tools globally.
- Chat uses only Composio tools (namespaced, policy-filtered) with safety caps and https/SSRF guardrails.

## Implementation steps

1) Deprecate other integrations

- Remove/disable legacy connectors and prior hub/custom install entries in Settings and data models so Composio is the sole option.

2) Registry

- In [`src/lib/integrations/registry.ts`](/home/umer/Documents/Github/llm-frontend/src/lib/integrations/registry.ts), keep a single `IntegrationDefinition` for Composio: id/name/logo/categories(search), kind:"hub", transport:"sse", setup steps pointing to composio.dev (generate MCP URL/key), auth schema for bearer header.

3) Installed state & queries

- Ensure `InstalledIntegration` (in [`src/lib/db/schema.ts`](/home/umer/Documents/Github/llm-frontend/src/lib/db/schema.ts)) supports: definitionId (Composio), url, auth header/key, enabled, status/lastConnectedAt/lastError, cachedTools[], toolPolicy (denylist), timestamps.
- Update queries in [`src/lib/db/queries.ts`](/home/umer/Documents/Github/llm-frontend/src/lib/db/queries.ts) to read/write Composio installs and expose cachedTools/toolPolicy.

4) Settings UI (Composio-only)

- In [`src/components/settings/mcp-marketplace.tsx`](/home/umer/Documents/Github/llm-frontend/src/components/settings/mcp-marketplace.tsx) (or renamed): show only the Composio card with fields to paste MCP URL + API key (no embed); copy explains “generate once on composio.dev”.
- Add Test Connection: call listTools, persist status/lastConnectedAt/cachedTools; show tool count/preview; provide per-tool enable/disable toggles (denylist stored client-side).

5) Chat/tool injection

- In [`src/lib/mcp/mcp-manager.ts`](/home/umer/Documents/Github/llm-frontend/src/lib/mcp/mcp-manager.ts): accept InstalledIntegration, connect via SSE to Composio URL, namespace tools `integrationId/toolName`, filter by toolPolicy, cache tool metadata, cap injected tools.
- In [`src/app/api/chat/route.ts`](/home/umer/Documents/Github/llm-frontend/src/app/api/chat/route.ts): accept `integrations` payload (Composio only), enforce https + block private IPs/localhost, apply caps, and call McpManager; switch route to Node runtime if SSE is not Edge-compatible.
- In [`src/hooks/use-chat.ts`](/home/umer/Documents/Github/llm-frontend/src/hooks/use-chat.ts): send enabled Composio integration with cached tools to `/api/chat`.

6) Safety & UX

- Add warnings for data sharing; show status/errors in UI; ensure one-time paste experience (persist auth locally); remove redundant navigation to other hubs.

7) Tests

- Manual/unit where available: valid/invalid URL, auth failure, listTools success, toolPolicy filtering, tool caps, SSRF guardrails, and Edge→Node fallback.

## Mermaid: Data path

```mermaid
flowchart TD
  SettingsUI -->|paste URL+key,test| IndexedDB[(InstalledIntegrations)]
  SettingsUI -->|Test:listTools| McpManager
  McpManager -->|SSE connect| ComposioHub
  ComposioHub -->|listTools| McpManager
  McpManager -->|cache tools + policy filter| IndexedDB
  ChatUI -->|getEnabledIntegrations| IndexedDB
  ChatUI -->|POST /api/chat integrations| ChatAPI
  ChatAPI -->|build tools (namespaced, filtered)| McpManager
  ChatAPI -->|tool calls| ComposioHub
```