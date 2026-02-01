# Lumina ↔ Claw Integration Reference

## Backend Repo
**Path:** `/home/umer/Github/claw`

## Architecture

The frontend is a thin portal for Claw. It sends the raw user message to the Claw backend and displays the response. All intelligence lives in the backend:

- **Intent detection** — the backend LLM decides if a message is a task, schedule request, status check, etc.
- **Schedule/task creation** — the backend LLM has native tools (`create_schedule`, `list_schedules`, `delete_schedule`, `list_tasks`, `get_recent_activity`) that it calls directly
- **Context building** — the backend manages its own memory (Mem0), conversation context, and state
- **Tool execution** — Composio tools + native tools are all handled server-side

## Key Backend Files
| File | Purpose |
|------|---------|
| `src/core/brain.ts` | `think()` function — processes messages, calls LLM with tools |
| `src/core/capabilities.ts` | System prompt assembly |
| `src/tools/native.ts` | Built-in tools for schedule/task/activity CRUD |
| `src/tools/composio.ts` | External app tools (Gmail, Reddit, GitHub, etc.) |
| `src/core/scheduler.ts` | Cron job execution — runs scheduled instructions |
| `src/memory/local.ts` | DB CRUD for tasks, schedules, activity |
| `src/channels/api.ts` | HTTP API — all endpoints the frontend calls |
| `src/events/emitter.ts` | EventBus — drives SSE updates to frontend |

## Key Frontend Files (This Repo)
| File | Purpose |
|------|---------|
| `src/hooks/use-chat.ts` | Claw chat routing (thin — just sends message, shows response) |
| `src/stores/claw-store.ts` | Zustand store for Claw state + API calls |
| `src/lib/claw/client.ts` | HTTP client wrapping all Claw endpoints |
| `src/components/settings/claw-settings.tsx` | Settings UI for manual schedule/task management |
| `src/hooks/use-claw-events.ts` | SSE listener for real-time updates |
