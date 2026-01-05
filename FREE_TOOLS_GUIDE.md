# Free Third-Party Tools Guide: Close TypingMind Gaps

**Focus:** FREE/Open-Source tools only - NO recurring pricing  
**Date:** January 2025

---

## Executive Summary

This guide maps each TypingMind gap to **free/open-source** tools and libraries that can be integrated to close the gaps quickly and cost-effectively. All recommendations are either:
- Completely free (no cost)
- Open-source (self-hostable)
- Free tier with generous limits
- Browser-native APIs (no external service)

---

## Gap #1: External Knowledge Base Connectors

### Free Solutions

#### 1. **Direct API Integration (Free)**
- **Notion API** - Free, no limits for personal use
  - OAuth integration
  - Read/write pages, databases
  - Real-time sync via webhooks
  - **Implementation:** `@notionhq/client` (official SDK)

- **Google Drive API** - Free tier: 1M requests/day
  - OAuth 2.0 integration
  - File listing, download, metadata
  - **Implementation:** `googleapis` npm package

- **GitHub API** - Free, 5,000 requests/hour
  - OAuth integration
  - Repository content, issues, files
  - **Implementation:** `@octokit/rest` (official SDK)

#### 2. **LangChain.js (Open-Source)**
- **Free:** MIT License
- Pre-built document loaders for:
  - Notion (`@langchain/notion`)
  - Google Drive (`@langchain/google-drive`)
  - GitHub (`@langchain/github`)
- **Implementation:** `npm install @langchain/community`
- **Docs:** https://js.langchain.com/docs/integrations/document_loaders

#### 3. **KlavisAI MCP Servers (Free)**
- Free MCP servers for Google Drive, Notion, GitHub
- **GitHub:** https://github.com/klavis-ai/mcp-servers
- Can be used as reference or integrated directly

**Recommendation:** Start with direct API integration (free, no dependencies), then add LangChain.js for advanced features.

---

## Gap #2: AI Agents System

### Free Solutions

#### 1. **LangChain.js Agents (Open-Source)**
- **Free:** MIT License
- Built-in agent framework
- Tool calling, memory, chains
- **Implementation:** `npm install langchain`
- **Docs:** https://js.langchain.com/docs/modules/agents

#### 2. **AutoGen (Open-Source)**
- **Free:** MIT License
- Multi-agent conversations
- **Note:** Python-based, but can be used via API
- **GitHub:** https://github.com/microsoft/autogen

#### 3. **Custom Implementation (Free)**
- Build on existing schema
- Use LangChain.js for tool calling
- Store agents in IndexedDB (already have Dexie)

**Recommendation:** Use LangChain.js agents framework - it's TypeScript, free, and well-documented.

---

## Gap #3: Prompt Library

### Free Solutions

#### 1. **Local Storage (Free)**
- Store prompts in IndexedDB (already have Dexie)
- No external service needed
- **Implementation:** Add `Prompt` interface to schema

#### 2. **GitHub Gists (Free)**
- Optional: Sync prompts via GitHub Gists API
- Free, unlimited public gists
- **Implementation:** `@octokit/rest` for Gist API

#### 3. **JSON File Export/Import (Free)**
- Export prompts as JSON
- Import from community templates
- **Implementation:** Already have export/import in settings

**Recommendation:** Start with local IndexedDB storage (free, fast, private). Add GitHub Gists sync as optional feature.

---

## Gap #4: Conversation Branching

### Free Solutions

#### 1. **Custom Implementation (Free)**
- Schema already has `parentId` field
- Just need UI components
- No external service needed

**Recommendation:** Build custom - it's just UI work, schema is ready.

---

## Gap #5: MCP Plugin Ecosystem

### Free Solutions

#### 1. **MCP TypeScript SDK (Open-Source)**
- **Free:** MIT License
- Official MCP SDK from Anthropic
- **GitHub:** https://github.com/modelcontextprotocol/typescript-sdk
- **Implementation:** `npm install @modelcontextprotocol/sdk`

#### 2. **MCP Server Examples (Free)**
- Free reference implementations
- **GitHub:** https://github.com/modelcontextprotocol/servers
- Can use as templates

**Recommendation:** Use official MCP TypeScript SDK - it's free and maintained by Anthropic.

---

## Gap #6: Multi-Tab Support

### Free Solutions

#### 1. **Custom Implementation (Free)**
- Use React state management (Zustand - already have)
- Store tab state in IndexedDB
- No external service needed

**Recommendation:** Build custom - simple state management, no external dependency.

---

## Gap #7: In-Chat Search

### Free Solutions

#### 1. **Fuse.js (Open-Source)**
- **Free:** Apache 2.0 License
- Already installed in project!
- Fuzzy search for messages
- **Implementation:** Already have `fuse.js` in package.json

#### 2. **Browser Native Search (Free)**
- `Ctrl+F` / `Cmd+F` in browser
- Can enhance with custom highlighting

**Recommendation:** Use Fuse.js (already installed) for in-chat search.

---

## Gap #8: Dynamic Model List

### Free Solutions

#### 1. **OpenRouter API (Free)**
- Free API access (no key needed for public endpoints)
- `/models` endpoint lists all available models
- **Implementation:** `fetch('https://openrouter.ai/api/v1/models')`
- Cache results in IndexedDB

#### 2. **Local Caching (Free)**
- Cache model list in IndexedDB
- Update on app start
- Fallback to hardcoded list if API fails

**Recommendation:** Use OpenRouter `/models` endpoint - it's free and comprehensive.

---

## Gap #9: Proper RAG System

### Free Solutions

#### 1. **transformers.js (Open-Source)**
- **Free:** Apache 2.0 License
- Client-side embeddings in browser
- No API costs
- **Implementation:** `npm install @xenova/transformers`
- **Docs:** https://huggingface.co/docs/transformers.js

#### 2. **Chroma (Open-Source)**
- **Free:** Apache 2.0 License
- Local vector database
- Can run in browser (WASM) or Node.js
- **GitHub:** https://github.com/chroma-core/chroma

#### 3. **LanceDB (Open-Source)**
- **Free:** Apache 2.0 License
- Vector database with WASM support
- **GitHub:** https://github.com/lancedb/lancedb

#### 4. **Voy (Open-Source)**
- **Free:** MIT License
- WASM vector database
- Perfect for browser
- **GitHub:** https://github.com/tantaraio/voy

**Recommendation:** Use `transformers.js` for embeddings + `Voy` for vector search - both run in browser, zero API costs.

---

## Gap #10: Cloud Sync (Optional)

### Free Solutions

#### 1. **PouchDB (Open-Source)**
- **Free:** Apache 2.0 License
- Local-first database that syncs with CouchDB
- Can sync with free CouchDB hosting (Cloudant free tier)
- **Implementation:** `npm install pouchdb`
- **Docs:** https://pouchdb.com

#### 2. **Supabase (Free Tier)**
- **Free:** 500MB database, 2GB bandwidth/month
- Real-time sync
- **Alternative:** Self-host Supabase (open-source)

#### 3. **Firebase (Free Tier)**
- **Free:** 1GB storage, 10GB bandwidth/month
- Real-time sync
- **Note:** Google-owned, but free tier is generous

#### 4. **Custom Sync via GitHub (Free)**
- Store encrypted backups in GitHub Gists
- Free, unlimited public gists
- Manual sync (not real-time)

**Recommendation:** Start with PouchDB + free CouchDB hosting, or use Supabase free tier for real-time sync.

---

## Additional Free Tools

### Voice Input/Output

#### 1. **Web Speech API (Free)**
- Browser-native API
- No external service needed
- Speech-to-text and text-to-speech
- **Implementation:** `window.speechRecognition` and `window.speechSynthesis`

#### 2. **Whisper.cpp (Open-Source)**
- **Free:** MIT License
- Can run locally via WASM
- Better accuracy than Web Speech API
- **GitHub:** https://github.com/ggerganov/whisper.cpp

**Recommendation:** Use Web Speech API first (zero cost), add Whisper.cpp for better accuracy.

---

### URL/Webpage Reading

#### 1. **Jina Reader API (Free Tier)**
- **Free:** 1,000 requests/month
- Clean content extraction
- **API:** https://r.jina.ai/

#### 2. **Firecrawl (Free Tier)**
- **Free:** 1,000 credits/month
- Web scraping API
- **Alternative:** Self-host Firecrawl (open-source)

#### 3. **Custom Implementation (Free)**
- Use `fetch()` + DOMParser
- Extract main content (heuristic-based)
- No external service needed

**Recommendation:** Use Jina Reader free tier, fallback to custom implementation.

---

### Image Generation

#### 1. **Stable Diffusion (Open-Source)**
- **Free:** CreativeML Open RAIL-M License
- Can run locally via API
- **GitHub:** https://github.com/Stability-AI/stablediffusion

#### 2. **Hugging Face Inference API (Free Tier)**
- **Free:** Limited requests
- Access to Stable Diffusion models
- **API:** https://huggingface.co/inference-api

**Recommendation:** Use Hugging Face Inference API free tier for testing, self-host Stable Diffusion for production.

---

### Observability/Monitoring

#### 1. **Custom Analytics (Free)**
- Store metrics in IndexedDB
- Export to JSON/CSV
- No external service needed

#### 2. **PostHog (Open-Source)**
- **Free:** Self-hostable
- Analytics and feature flags
- **GitHub:** https://github.com/PostHog/posthog

**Recommendation:** Start with custom IndexedDB analytics, add PostHog if needed.

---

## Implementation Priority

### Phase 1: Quick Wins (Free, Easy)
1. ✅ **In-Chat Search** - Use Fuse.js (already installed)
2. ✅ **Dynamic Model List** - OpenRouter API (free)
3. ✅ **Prompt Library** - IndexedDB storage (free)
4. ✅ **Conversation Branching** - Custom UI (schema ready)

### Phase 2: Medium Effort (Free)
5. ✅ **MCP Plugin System** - Official MCP SDK (free)
6. ✅ **Multi-Tab Support** - Custom implementation (free)
7. ✅ **Voice I/O** - Web Speech API (free, browser-native)

### Phase 3: Advanced (Free, More Complex)
8. ✅ **RAG System** - transformers.js + Voy (free, browser-native)
9. ✅ **External KB Connectors** - Direct APIs (free)
10. ✅ **AI Agents** - LangChain.js (free, open-source)

### Phase 4: Optional (Free Tier)
11. ✅ **Cloud Sync** - Supabase free tier or PouchDB
12. ✅ **URL Reading** - Jina Reader free tier

---

## Cost Summary

| Feature | Tool | Cost |
|---------|------|------|
| External KB Connectors | Direct APIs | **FREE** |
| AI Agents | LangChain.js | **FREE** (MIT) |
| Prompt Library | IndexedDB | **FREE** |
| Conversation Branching | Custom | **FREE** |
| MCP Plugins | MCP SDK | **FREE** (MIT) |
| Multi-Tab | Custom | **FREE** |
| In-Chat Search | Fuse.js | **FREE** (already installed) |
| Dynamic Models | OpenRouter API | **FREE** |
| RAG System | transformers.js + Voy | **FREE** (browser-native) |
| Cloud Sync | Supabase/PouchDB | **FREE** (tier) |
| Voice I/O | Web Speech API | **FREE** (browser-native) |
| URL Reading | Jina Reader | **FREE** (1k/month) |

**Total Recurring Cost: $0/month** ✅

---

## Recommended Tech Stack (All Free)

```json
{
  "dependencies": {
    "@langchain/core": "^0.3.0",           // FREE - Agents, tools
    "@langchain/community": "^0.3.0",      // FREE - Document loaders
    "@modelcontextprotocol/sdk": "^0.1.0", // FREE - MCP support
    "@xenova/transformers": "^2.0.0",      // FREE - Client-side embeddings
    "@notionhq/client": "^2.0.0",          // FREE - Notion API
    "googleapis": "^130.0.0",              // FREE - Google Drive API
    "@octokit/rest": "^20.0.0",            // FREE - GitHub API
    "fuse.js": "^7.0.0",                   // FREE - Already installed!
    "pouchdb": "^8.0.0"                    // FREE - Optional sync
  }
}
```

---

## Next Steps

1. **Install free dependencies:**
   ```bash
   npm install @langchain/core @langchain/community @modelcontextprotocol/sdk @xenova/transformers @notionhq/client googleapis @octokit/rest
   ```

2. **Start with Quick Wins:**
   - In-chat search (Fuse.js - 1 hour)
   - Dynamic model list (OpenRouter API - 2 hours)
   - Prompt library (IndexedDB - 4 hours)

3. **Then move to Medium:**
   - MCP plugin system (MCP SDK - 1 day)
   - Multi-tab support (Custom - 1 day)

4. **Finally Advanced:**
   - RAG system (transformers.js + Voy - 3 days)
   - External KB connectors (Direct APIs - 2 days)

---

## Resources

- **LangChain.js Docs:** https://js.langchain.com
- **MCP SDK:** https://github.com/modelcontextprotocol/typescript-sdk
- **transformers.js:** https://huggingface.co/docs/transformers.js
- **Voy Vector DB:** https://github.com/tantaraio/voy
- **Notion API:** https://developers.notion.com
- **Google Drive API:** https://developers.google.com/drive
- **GitHub API:** https://docs.github.com/en/rest

---

**All tools listed are FREE with no recurring costs!** 🎉



