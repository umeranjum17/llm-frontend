# Lumina LLM Frontend - Strategic Roadmap

**Last updated:** January 2026
**Research sources:** TypingMind, T3Chat, LobeChat, LibreChat, OpenRouter ecosystem

---

## Executive Summary

Lumina is already competitive with TypingMind and T3Chat on core features. The path to becoming the **best** LLM frontend requires:

1. **MCP Plugin Ecosystem** - The industry is standardizing on MCP (OpenAI adopted it March 2025)
2. **Client-Side RAG** - Zero-cost embeddings with transformers.js
3. **Interactive Artifacts** - Sandboxed code execution like Claude.ai
4. **Speed Optimization** - T3Chat claims 2x faster than ChatGPT

---

## Competitive Landscape (2025-2026)

| Feature | TypingMind | T3Chat | LobeChat | LibreChat | **Lumina** |
|---------|------------|--------|----------|-----------|------------|
| Multi-Model | ✅ | ✅ | ✅ | ✅ | ✅ |
| Conversation Branching | ⚠️ Fork only | ✅ Full | ✅ | ❌ | ✅ |
| AI Agents | ✅ | ❌ | ✅ | ✅ | ✅ |
| Prompt Library | ✅ | ❌ | ✅ | ✅ | ✅ |
| MCP Plugins | ✅ Full | ❌ | ✅ Marketplace | ⚠️ | ❌ Types only |
| RAG/Knowledge Base | ✅ | ❌ | ✅ | ✅ | ❌ |
| Interactive Artifacts | ❌ | ❌ | ✅ | ✅ | ⚠️ View-only |
| Voice I/O | ✅ Full | ❌ | ✅ | ✅ | ⚠️ Input only |
| Local-First | ✅ | ✅ | ⚠️ Optional | ❌ Server | ✅ |
| Cost Tracking | ❌ | ❌ | ❌ | ❌ | ✅ |
| In-Chat Search | ✅ | ✅ | ✅ | ✅ | ❌ |
| Multi-Tab | ❌ | ❌ | ✅ | ❌ | ❌ |
| Image Generation | ✅ | ✅ | ✅ | ✅ | ❌ |

### Lumina's Competitive Advantages (Already Built)
1. **Best-in-class branching** - Full tree navigation, not just fork
2. **Per-message cost tracking** - No competitor has this
3. **True local-first** - Works offline, no server required
4. **BYOK model** - No subscription lock-in
5. **Agents + Prompts with variables** - Matches TypingMind

### Critical Gaps to Close
1. **MCP Plugin System** - Industry standard (Anthropic → Linux Foundation)
2. **RAG** - Scale beyond full file injection
3. **In-Chat Search** - Power user expectation
4. **Interactive Artifacts** - Code execution like Claude.ai

---

## What Users Actually Want (Reddit/Community Research)

Based on 2025 user feedback across Reddit, Product Hunt, and forums:

| Priority | Feature | Why Users Care |
|----------|---------|----------------|
| 1 | **Speed** | "No one wants lag" - T3Chat wins on this |
| 2 | **Memory/Context** | Long conversations without losing context |
| 3 | **Privacy** | Local-first, data never leaves device |
| 4 | **Multi-Model** | Switch models mid-conversation |
| 5 | **Affordability** | BYOK > subscription |
| 6 | **Plugins/Tools** | Extend AI capabilities |
| 7 | **Knowledge Bases** | RAG for documents |

**Lumina already excels at:** Privacy, Multi-Model, Affordability, Memory (via branching)
**Lumina needs work on:** Speed optimization, Plugins (MCP), Knowledge Bases (RAG)

---

## Current State: What's Built

### Core Features (Production Ready)
- ✅ **Multi-Model Support** - Dynamic list from OpenRouter (100+ models)
- ✅ **Streaming Responses** - Real-time with token counting
- ✅ **Cost Tracking** - Per-message and per-chat in USD
- ✅ **AI Agents** - 6 built-in + custom creation
- ✅ **Prompt Library** - Templates with `{{variable}}` syntax
- ✅ **Conversation Branching** - Fork, navigate, regenerate-as-branch
- ✅ **Vision/Images** - Upload, paste, drag-drop + model detection
- ✅ **Voice Input** - Browser Speech Recognition
- ✅ **Web Search** - 4 providers (Tavily, Serper, Brave, SearxNG)
- ✅ **Projects** - System prompts, file attachments (PDF/DOCX/TXT)
- ✅ **Organization** - Tags, folders, pinning, favorites, search
- ✅ **Arena Mode** - Side-by-side model comparison
- ✅ **Command Palette** - Cmd+K navigation
- ✅ **Parameter Presets** - Creative, Precise, Coding
- ✅ **PWA Support** - Installable app
- ✅ **Local-First** - IndexedDB, works offline

### Partial Implementations
- ⚠️ **MCP Types** - `src/lib/mcp/types.ts` exists, no client
- ⚠️ **Artifacts** - View-only, HTML preview, no sandbox execution
- ⚠️ **Voice** - Input only, no TTS output

---

## Implementation Roadmap

### Phase 1: Quick Wins (1-2 weeks)

#### 1.1 In-Chat Search
**Effort:** 2-3 days | **Impact:** High | **Dependencies:** None

Fuse.js is already installed. Just need UI.

**Implementation:**
- Search bar in chat header (Cmd+F trigger)
- Highlight matches in message list
- Next/prev navigation with scroll-to
- Match count indicator

**Files to modify:**
- `src/components/chat/chat-shell.tsx` - Add search bar
- `src/components/chat/message-item.tsx` - Highlight logic
- `src/hooks/use-chat-search.ts` - New hook

---

#### 1.2 Text-to-Speech (TTS)
**Effort:** 2 days | **Impact:** Medium | **Dependencies:** None

Browser SpeechSynthesis API is free.

**Implementation:**
- Play button on assistant messages
- Voice selector in settings
- Speed/pitch controls
- Auto-play toggle

**Files to modify:**
- `src/hooks/use-text-to-speech.ts` - New hook
- `src/components/chat/message-item.tsx` - Add play button
- `src/components/settings/voice-settings.tsx` - New component

---

#### 1.3 Multi-Tab Support
**Effort:** 3-4 days | **Impact:** High | **Dependencies:** None

**Implementation:**
- Tab bar above chat
- Zustand store for tab state
- Keyboard shortcuts (Cmd+1-9, Cmd+T, Cmd+W)
- Drag to reorder
- Persist open tabs

**Files to modify:**
- `src/stores/tabs-store.ts` - New store
- `src/components/chat/tab-bar.tsx` - New component
- `src/components/chat/chat-shell.tsx` - Integrate tabs

---

### Phase 2: Competitive Parity (2-4 weeks)

#### 2.1 MCP Plugin System
**Effort:** 1-2 weeks | **Impact:** Critical | **Dependencies:** None

MCP is now the industry standard (OpenAI adopted March 2025, donated to Linux Foundation Dec 2025).

**Architecture:**
```
┌─────────────────────────────────────────────────┐
│                  Lumina Chat                     │
├─────────────────────────────────────────────────┤
│  MCP Client Manager                             │
│  ├── Server Registry (IndexedDB)                │
│  ├── Connection Pool (SSE/WebSocket)            │
│  ├── Tool Discovery                             │
│  └── Health Monitoring                          │
├─────────────────────────────────────────────────┤
│  MCP Servers                                    │
│  ├── Remote (HTTP/SSE) ──→ GitHub, Notion, etc  │
│  └── Local (stdio) ──→ npx, uvx, Docker         │
└─────────────────────────────────────────────────┘
```

**Implementation:**
1. MCP client transport (SSE for remote, message passing for local)
2. Server registry in IndexedDB
3. Tool discovery → integrate with existing tool selector
4. Settings UI for adding/managing servers
5. Health checks and auto-reconnect

**Popular MCP Servers to Support:**
- **GitHub** - Issues, PRs, files (most requested)
- **Memory** - Persistent memory across chats
- **Sequential Thinking** - Chain-of-thought reasoning
- **Filesystem** - Local file access
- **Brave Search** - Web search

**Files to create:**
- `src/lib/mcp/client.ts` - MCP client implementation
- `src/lib/mcp/transports/` - SSE, WebSocket, stdio
- `src/lib/mcp/manager.ts` - Connection management
- `src/components/settings/mcp-settings.tsx` - UI
- `src/lib/db/schema.ts` - Add MCPServer table

**Package to add:**
```bash
npm install @modelcontextprotocol/sdk
```

---

#### 2.2 Interactive Artifacts (Sandboxed Execution)
**Effort:** 1 week | **Impact:** High | **Dependencies:** None

Current state: HTML-only preview, no sandbox.

**Target:** Match Claude.ai artifacts experience.

**Implementation:**
1. Sandboxed iframe for JS/HTML/CSS execution
2. React component preview (compile JSX in browser)
3. Mermaid diagram rendering (already have mermaid package)
4. Version history with diff view
5. "Iterate on this" button to send back to AI

**Security model:**
- srcdoc iframe with sandbox attribute
- CSP headers to block external requests
- No access to parent window

**Files to modify:**
- `src/components/artifacts/artifact-shell.tsx` - Major upgrade
- `src/components/artifacts/code-sandbox.tsx` - New component
- `src/components/artifacts/react-preview.tsx` - New component
- `src/components/artifacts/mermaid-renderer.tsx` - New component

---

#### 2.3 Image Generation (DALL-E Tool)
**Effort:** 3-4 days | **Impact:** Medium | **Dependencies:** OpenAI API key

**Implementation:**
1. Image generation tool (DALL-E 3 via OpenAI)
2. Display generated images inline
3. Download, regenerate, edit prompt buttons
4. Size/quality/style parameters

**Files to create:**
- `src/lib/tools/image-generation.ts` - Tool implementation
- `src/app/api/chat/route.ts` - Register tool

---

### Phase 3: Differentiation (4-6 weeks)

#### 3.1 Client-Side RAG System
**Effort:** 2-3 weeks | **Impact:** Critical | **Dependencies:** None

Current state: Full file injection (doesn't scale).
Target: Semantic retrieval with zero API costs.

**Architecture:**
```
Documents → Chunker → Embeddings (transformers.js) → Vector Index (Voy)
                                                           ↓
User Query → Query Embedding → Top-K Retrieval → Context Injection
                                                           ↓
                                              LLM Response + Citations
```

**Why client-side?**
- Zero API costs (embeddings run in browser via WASM)
- Privacy (documents never leave device)
- Offline capability

**Implementation:**
1. Document chunking with metadata (source, page, position)
2. Embeddings via transformers.js (all-MiniLM-L6-v2 model)
3. Vector storage in IndexedDB via Voy
4. Top-K retrieval with configurable threshold
5. Source citations in responses

**Schema additions:**
```typescript
interface KnowledgeBase {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
}

interface KnowledgeChunk {
  id: string;
  knowledgeBaseId: string;
  content: string;
  embedding: Float32Array;
  metadata: {
    sourceFileId: string;
    sourceFileName: string;
    chunkIndex: number;
    pageNumber?: number;
  };
}
```

**Files to create:**
- `src/lib/rag/chunker.ts` - Document splitting
- `src/lib/rag/embeddings.ts` - transformers.js integration
- `src/lib/rag/vector-store.ts` - Voy wrapper
- `src/lib/rag/retriever.ts` - Search logic
- `src/components/knowledge/knowledge-manager.tsx` - UI

**Packages to add:**
```bash
npm install @xenova/transformers voy-search
```

---

#### 3.2 External Knowledge Base Connectors
**Effort:** 1-2 weeks per connector | **Impact:** High

This is TypingMind's #1 value proposition.

**Phase 1: Read-only + Manual Refresh**
- GitHub (repos, files, issues)
- Google Drive (docs, sheets)
- Notion (pages, databases)

**Phase 2: Real-time Sync**
- Webhooks for auto-refresh
- Incremental sync (diffing)

**Implementation per connector:**
1. OAuth flow (popup or redirect)
2. API client wrapper
3. File listing and content fetching
4. Integration with RAG pipeline

**Packages:**
```bash
npm install @octokit/rest googleapis @notionhq/client
```

---

### Phase 4: Polish & Optimization

#### 4.1 Speed Optimization
T3Chat claims 2x faster than ChatGPT. We should benchmark and optimize.

**Areas to optimize:**
- Message list virtualization (react-virtuoso already installed)
- Image lazy loading
- IndexedDB query optimization (indexes exist, need profiling)
- Bundle size reduction (code splitting)
- Edge function optimization

#### 4.2 Cloud Sync (Optional)
**If** users request it:
- End-to-end encrypted sync
- Supabase free tier or PouchDB + CouchDB
- Conflict resolution strategy

#### 4.3 Additional Features
- Chat sharing (generate public links)
- ChatGPT import (parse export format)
- Better mobile experience
- Accessibility audit (WCAG compliance)

---

## Technical Decisions

### Why Client-Side RAG?
| Approach | Cost | Privacy | Offline | Latency |
|----------|------|---------|---------|---------|
| OpenAI Embeddings API | $0.0001/1K tokens | ❌ | ❌ | ~200ms |
| transformers.js (client) | $0 | ✅ | ✅ | ~50ms |

**Winner:** transformers.js - Zero cost, better privacy, works offline.

### Why MCP over Custom Plugins?
- Industry standard (Anthropic, OpenAI, Linux Foundation)
- Pre-built servers for popular services
- Future-proof (ecosystem growing rapidly)
- TypeScript SDK available

### Why Voy for Vector Search?
- MIT license, browser-native (WASM)
- Works in IndexedDB
- Sufficient for local knowledge bases
- Alternatives: LanceDB (more features, larger bundle)

---

## Free Tools Summary

All features can be built with free/open-source tools:

| Feature | Tool | License | Cost |
|---------|------|---------|------|
| In-Chat Search | Fuse.js | Apache 2.0 | $0 (installed) |
| TTS | SpeechSynthesis API | Browser | $0 |
| MCP | @modelcontextprotocol/sdk | MIT | $0 |
| RAG Embeddings | transformers.js | Apache 2.0 | $0 |
| RAG Vector DB | Voy | MIT | $0 |
| GitHub Connector | @octokit/rest | MIT | $0 |
| Google Connector | googleapis | Apache 2.0 | $0 |
| Notion Connector | @notionhq/client | MIT | $0 |

**Total recurring cost: $0/month**

---

## Priority Matrix

| Feature | Impact | Effort | Priority | Phase |
|---------|--------|--------|----------|-------|
| In-Chat Search | High | Low | 1 | 1 |
| TTS | Medium | Low | 2 | 1 |
| Multi-Tab | High | Medium | 3 | 1 |
| MCP Plugin System | Critical | High | 4 | 2 |
| Interactive Artifacts | High | Medium | 5 | 2 |
| Image Generation | Medium | Low | 6 | 2 |
| Client-Side RAG | Critical | High | 7 | 3 |
| GitHub Connector | High | Medium | 8 | 3 |
| Google Drive Connector | High | Medium | 9 | 3 |
| Notion Connector | Medium | Medium | 10 | 3 |

---

## Success Metrics

### Feature Parity
- [ ] All TypingMind Standard features
- [ ] All TypingMind Extended features
- [ ] T3Chat branching (✅ done)
- [ ] LobeChat MCP marketplace equivalent

### Performance
- [ ] Time to first message < 2s
- [ ] Streaming latency < 50ms
- [ ] Bundle size < 500KB gzipped

### User Engagement
- [ ] Users create custom agents
- [ ] Users save prompts
- [ ] Users use branching
- [ ] Users install MCP plugins
- [ ] Users build knowledge bases

---

## What Makes Lumina Different

After this roadmap is complete:

1. **Only truly local-first** - Competitors require servers
2. **Best cost transparency** - Per-message tracking
3. **Best branching** - Full tree, not just fork
4. **Zero-cost RAG** - Client-side embeddings
5. **MCP + local data** - Privacy-preserving plugins
6. **No subscription** - BYOK forever

---

## Sources

- [TypingMind](https://www.typingmind.com/) - Feature reference
- [TypingMind MCP Docs](https://docs.typingmind.com/model-context-protocol-(mcp)-in-typingmind) - MCP implementation
- [T3Chat](https://t3.chat/) - Speed and branching reference
- [LobeChat GitHub](https://github.com/lobehub/lobe-chat) - MCP marketplace, RAG
- [LibreChat](https://www.librechat.ai/) - RAG API, artifacts
- [MCP Servers](https://github.com/modelcontextprotocol/servers) - Official MCP servers
- [transformers.js](https://huggingface.co/docs/transformers.js) - Client-side embeddings
- [Voy](https://github.com/tantaraio/voy) - Browser vector search

---

*This is a living document. Update as features ship and market evolves.*
