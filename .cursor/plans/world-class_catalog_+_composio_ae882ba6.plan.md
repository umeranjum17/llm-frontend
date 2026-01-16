---
name: Pending Gap Fixes (Composio + MCP)
overview: Only the remaining gaps identified from logs/review; no new scope.
todos:
  - id: execute-tool-availability
    content: Detect the actual execute tool name (MULTI_EXECUTE_TOOL vs COMPOSIO_MULTI_EXECUTE_TOOL) and include it in router-first allowlist + instructions; safe fallback if missing.
    status: pending
  - id: router-first-toggle-ux
    content: Add explicit Debug/Power toggle for router-first mode and a visible OFF indicator.
    status: pending
  - id: search-cap-relevance
    content: Cap COMPOSIO_SEARCH_TOOLS results by relevance order (from results) and trim tool_schemas to match top N.
    status: pending
  - id: parameter-guide-shape
    content: Fix parameter-guide generation to handle Composio schema shapes so required params appear.
    status: pending
  - id: tool-retry-ui
    content: Handle tool-retry-exhausted SSE event on client (toast or inline message).
    status: pending
  - id: memory-toggle-ui
    content: Add minimal per-chat UI toggle to set chat.memoryDisabled.
    status: pending
  - id: post-tool-final-response
    content: When tools succeed but no final reply is produced, show a “Continue (need more tools)” affordance or auto-print the final response.
    status: pending
---

# Pending Gap Fixes

## Scope
- Only items still broken or missing based on the latest logs/review.
- No catalog changes or new architecture.

## Success Criteria
- Execute tool available in router-first mode (no AI_NoSuchToolError).
- Router-first OFF is visible and intentional.
- Search cap is relevance-based.
- Parameter guide lists required params.
- Retry exhaustion is surfaced to user.
- Per-chat memory toggle is usable.
- If tools succeed but the model stalls, user sees “Continue (need more tools)” or a final response is printed.