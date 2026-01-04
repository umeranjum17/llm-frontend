# Lumina — Best-in-World LLM Frontend (Research‑Backed Plan)

Build a premium, fast, trustworthy LLM chat “workstation” inspired by TypingMind + T3 Chat, but anchored in what users praise and request publicly: **model control**, **context control**, **agentic tools**, **plugins**, **performance**, and **trust**.

---

## Product principles

- **Premium UX**: smooth, “native” feel; keyboard-first; delightful micro-interactions; no jank while streaming.
- **Performance at scale**: instant startup; instant chat search; virtualized lists; handles 10k+ chats.
- **Trust**: clear data flow; minimal/no logs; BYOK; optional self-hostable relay.
- **Extensible**: tool/plugin system (MCP compatible) so capability grows without shipping everything yourself.

---

## Research notes (why users pay)

### TypingMind (praised)
- **External KB connectors** (Google Drive / Notion / GitHub) are celebrated because they reduce friction and can avoid paid storage/sync limits (users explicitly mention hitting limits and not wanting to pay for storage).
- **Fast new-model adoption** is a trust/retention lever (users publicly praise TypingMind for adding hot models quickly).
- **Tool/Plugin ecosystem via MCP** is a recurring theme: users build/ask for MCP bridges that expose tools as plugins in TypingMind.

### T3 Chat (praised + what it implies)
- **Speed + UX** is repeatedly described as a “daily driver” / “game-changer”.
- **Price-to-power** (premium models for ~$8/mo) is a major pull; large threads debate how “unlimited” it is and what the true limits are.
- **Top user asks** cluster around: better model picker (search/categories/favorites), reasoning controls, @file referencing, multi-search web tool quality, sidebar organization.

### Implication for our MVP
To stay close to what’s already making money, the early product must nail:
- **Best-in-class Model Picker** (search/categories/favorites/pinned sets) + **Reasoning/Cost controls**
- **Context primitives**: **@file referencing** + external KB/project context
- **Agentic web tool quality**: allow **multiple searches per answer**
- **Extensible tool system**: MCP-compatible plugin framework
- **Trust Pack**: clear data-flow + minimal/no-logs proxy + optional self-host

---

## Architecture & stack

### Core
- **Framework**: Next.js 14 (App Router) + TypeScript
- **UI**: Tailwind CSS + Shadcn UI + CSS variables (theming) + `Geist Sans`
- **PWA**: `next-pwa` (installable “app” without app stores)

### Premium UX building blocks
- **Animation**: `framer-motion`
- **Split panes**: `react-resizable-panels` (Claude-like artifacts/tools view)
- **Mobile drawers**: `vaul`
- **Toasts**: `sonner`
- **Command palette**: `cmdk`
- **Shortcuts**: `react-hotkeys-hook`

### Rendering & content
- **Markdown**: `react-markdown` + `remark-gfm`
- **Code highlight**: `shiki`
- **Diagrams**: `mermaid`
- **Math**: `katex`
- **Charts**: `recharts`

### Data & performance
- **Local DB**: `dexie` (IndexedDB) for chats/messages/projects
- **Fuzzy search**: `fuse.js`
- **Virtualized lists**: `react-virtuoso`
- **Token/cost estimation**: `gpt-tokenizer`

### AI layer
- **Client**: Vercel AI SDK (streaming + tool calling)
- **Providers**:
  - **BYOK OpenRouter** (single key → many models)
  - OpenAI / Anthropic / Google / others as needed
  - **Ollama** (local models) as a strategic “free/community” option

### Thin relay (recommended)
Many LLM providers have CORS/credential constraints. To avoid a fragile client-only approach:
- **Thin API proxy**: Cloudflare Worker / Vercel Edge route (BYOK still supported).
- **Trust Pack**: publish the relay code + no-logs mode + self-host instructions.

### Optional (Phase 3+)
- **Local RAG**: evaluate `voy` (WASM vector DB) once core UX is world-class.

---

## Pillars (what we must be best at)

1. **Model control**
   - Best model picker: search, categories, favorites, pinned sets, “recent”.
   - Reasoning/effort controls per model (low/med/high/xhigh).
   - Budget controls: per chat + per project spend cap; “cheap/fast vs smart/slow” toggle.
2. **Context control**
   - Projects/workspaces with default system prompt + attached docs.
   - **@file referencing** and **cross-chat referencing** (“use chat X as context”).
3. **Agentic tools**
   - Web tool that can do **multiple searches per answer**.
   - Tool selection UI (plugins/tools toggles like TypingMind/T3).
4. **Plugins ecosystem**
   - MCP-compatible tool framework so community can ship integrations.
5. **Performance + trust**
   - Instant load, no freezes, no lost messages, predictable storage.
   - Clear “where data goes” UX; privacy-first defaults.

---

## Feature tiers (monetization)

### Free tier (hook)
- Unlimited local chats (IndexedDB)
- BYOK providers (OpenRouter + others)
- Model picker (solid) + basic parameters
- Virtualized history + search
- Export/Import JSON
- Keyboard shortcuts
- Basic tool/plugin framework (limited)

### Pro license ($49–$79 one-time)
These are the **pay-for-productivity** features:
- **Projects & Global Context**: auto-inject project context into new chats (the daily time-saver).
- **Prompt chains/workflows**: chain tools/models reliably (“Search → Summarize → Draft”).
- **Local Folder Sync** (File System Access API): save to a local folder (Git/iCloud/Dropbox friendly).
- **Multi-model arena** (“LLM council” / compare 2–3 models side-by-side).
- **Artifacts 2.0**: persistent artifacts workspace with download as zip/folder.
- **Voice mode**: STT + TTS (optional BYOK for providers).

### Future add-ons (optional recurring revenue)
- Hosted sync/convenience features (if you choose), team admin, shared projects, SSO.

---

## MVP scope (what to build first)

### Non-negotiable MVP (aligned with praise + top requests)
- **Best model picker** (search/categories/favorites/pinned)
- **Reasoning button/dial** + robust handling of long reasoning outputs
- **@file referencing** within a Project
- **Multi-search web tool** (agent can search multiple times per answer)
- **Sidebar organization** (pinned/favorites/grouping) + fast local search
- **BYOK onboarding** that’s frictionless (and explains costs)

### MVP “delight”
- Smooth streaming + optimistic UI
- Copy buttons everywhere (code blocks, messages)
- Natural auto-scroll (pause on user scroll)
- Polished empty states and settings UX

---

## Data model (Dexie)

```ts
interface Project {
  id: string;
  name: string;
  systemPrompt?: string;
  createdAt: number;
  updatedAt: number;
}

interface ProjectFile {
  id: string;
  projectId: string;
  name: string;
  mime: string;
  text?: string; // extracted for LLM context
  createdAt: number;
}

interface Chat {
  id: string;
  projectId?: string;
  title: string;
  modelId: string;
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
  tags?: string[];
}

interface Message {
  id: string;
  chatId: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  createdAt: number;
  parentId?: string; // future branching
}

interface Workflow {
  id: string;
  name: string;
  steps: Array<{ toolId: string; providerId?: string; modelId?: string; template: string }>;
}
```

---

## Implementation phases (lean, outcome-driven)

### Phase 1 — “Daily driver” foundation
- App shell + theme + PWA
- Local DB (Dexie) + virtualized sidebar + Fuse search
- Chat streaming (Vercel AI SDK)
- BYOK onboarding (OpenRouter first) + basic model picker

### Phase 2 — “Best model control”
- Model picker v2 (categories/favorites/pins)
- Reasoning/cost controls + token estimates + budgets
- Robust long-reasoning rendering (no empty messages / truncation errors)

### Phase 3 — “Context wins”
- Projects
- File upload → text extraction → @file referencing
- Cross-chat referencing (bring summary + selected messages)

### Phase 4 — “Agentic tools + plugins”
- Web tool with multiple searches per answer
- Tool selector UI
- MCP-compatible plugin framework (start minimal, iterate)

### Phase 5 — “Pro paywall features”
- Prompt chains/workflows builder
- Local folder sync (File System Access API)
- Multi-model arena
- Artifacts 2.0
- License integration (LemonSqueezy)

---

## Trust pack (must ship early)

- “Where your data goes” screen (provider-by-provider).
- No-logs relay (open-source) + self-host option.
- Local-first storage by default; explicit opt-ins for sync/features that transmit data.

---

## Risks & mitigations

- **CORS/provider limitations** → thin relay + self-host option.
- **Local RAG complexity** → keep optional; don’t ship until it’s fast + reliable.
- **Security concerns around keys** → vault UX, encryption at rest, never log keys, transparent docs.


