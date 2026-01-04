# Gap Analysis & Task Breakdown for Developer

**Date:** Generated from comprehensive codebase review  
**Status:** Ready for implementation

---

## ✅ IMPLEMENTED FEATURES (Do Not Rebuild)

### Core Features
- ✅ **Real-time streaming updates** - Implemented in `src/hooks/use-chat.ts` (lines 99-102)
- ✅ **Continue Response Button** - Fully implemented:
  - Hook: `src/hooks/use-chat.ts` (lines 149-280)
  - UI: `src/components/chat/message-item.tsx` (lines 78-91)
  - Schema: `canContinue` field in Message schema
- ✅ **Command Palette** - Fully implemented:
  - Component: `src/components/command-palette/command-palette.tsx`
  - Wired up: `src/app/layout.tsx` (line 44)
  - Cmd+K shortcut working
- ✅ **@Mention Autocomplete** - Implemented:
  - Component: `src/components/chat/at-mention-autocomplete.tsx`
  - Integrated: `src/components/chat/input-area.tsx` (lines 45-90)
- ✅ **Budget Settings** - Implemented:
  - Component: `src/components/chat/budget-settings-dialog.tsx`
  - Warning: `src/components/chat/budget-warning.tsx`
- ✅ **Tool Selector** - Implemented: `src/components/tools/tool-selector.tsx`
- ✅ **Reasoning Control** - Implemented: `src/components/chat/reasoning-control.tsx`
- ✅ **Cross-chat referencing** - Partially implemented (parsing exists in `parseReferences`)

---

## ❌ CRITICAL MISSING FEATURES (Priority Order)

### Phase 1: Core UX (Week 1) - HIGH PRIORITY

#### 1. Settings Page (CRITICAL - Missing Entirely)
**Status:** ❌ Not implemented  
**Files to create:**
- `src/app/settings/page.tsx` - Main settings page
- `src/components/settings/api-keys-settings.tsx` - API key management
- `src/components/settings/theme-settings.tsx` - Theme selector
- `src/components/settings/keyboard-shortcuts-settings.tsx` - Shortcuts reference
- `src/components/settings/export-import-settings.tsx` - Export/Import UI

**Requirements:**
- API key management (add, test, remove per provider)
- Theme selector (already in command palette, but needs dedicated page)
- Keyboard shortcuts reference/help
- Default model selection
- Export/Import settings
- Parameter presets management (see #2 below)

**Reference:** Command palette already routes to `/settings` (line 73 in command-palette.tsx) but page doesn't exist.

---

#### 2. Keyboard Shortcuts System (HIGH PRIORITY)
**Status:** ❌ Not implemented  
**Files to create:**
- `src/hooks/use-keyboard-shortcuts.ts` - Global shortcuts hook

**Files to modify:**
- `src/app/layout.tsx` - Register global shortcuts
- `src/components/chat/input-area.tsx` - Input-specific shortcuts

**Shortcuts to implement:**
- `Cmd+K` / `Ctrl+K` - Command palette (already works, but needs hook)
- `Cmd+N` / `Ctrl+N` - New chat
- `Cmd+/` - Keyboard shortcuts help dialog
- `Cmd+F` - Focus search in sidebar
- `Escape` - Close modals/dialogs
- `Cmd+Enter` - Send message (alternative to Enter)

**Note:** `react-hotkeys-hook` is already in package.json but not used.

---

#### 3. Auto-Scroll with Pause (HIGH PRIORITY)
**Status:** ❌ Not implemented  
**Files to modify:**
- `src/components/chat/message-list.tsx`

**Requirements:**
- Detect when user scrolls up manually
- Pause auto-scroll when user scrolls up
- Show "New messages" indicator when paused
- Resume auto-scroll when user scrolls to bottom
- Use `react-virtuoso`'s scroll detection APIs

**Current state:** Auto-scrolls always (lines 23-30), no pause logic.

---

#### 4. Enhanced Error Handling with Toasts
**Status:** ⚠️ Partially implemented  
**Files to modify:**
- `src/hooks/use-chat.ts` - Add toast notifications for errors
- `src/app/api/chat/route.ts` - Better error responses

**Requirements:**
- Use `sonner` (already installed) for error toasts
- Retry logic with exponential backoff
- Rate limit handling with user-friendly messages
- Network error handling
- API key validation errors

**Current state:** Errors are set in state but not shown to user via toasts.

---

### Phase 2: Model Control (Week 2) - HIGH USER DEMAND

#### 5. Model-Specific Parameter Management (TOP USER REQUEST)
**Status:** ❌ Not implemented  
**Files to modify:**
- `src/components/model-picker/model-picker-dialog.tsx`
- Create: `src/lib/constants/model-capabilities.ts`

**Requirements:**
- Create model capability registry (which parameters each model supports)
- Auto-hide unsupported parameters per model
- Conditional parameter display based on selected model
- Show only relevant controls (temperature, max_tokens, etc.)

**Example:**
```typescript
const MODEL_CAPABILITIES = {
  'gpt-4': { 
    supportsSystemPrompt: true, 
    maxTemperature: 2.0,
    supportsTopP: true,
    supportsFrequencyPenalty: true
  },
  'claude-3': { 
    supportsSystemPrompt: true, 
    supportsReasoning: true,
    maxTemperature: 1.0
  },
  // ...
};
```

---

#### 6. Parameter Presets/Modes (TOP USER REQUEST)
**Status:** ❌ Not implemented  
**Files to create:**
- `src/components/settings/parameter-presets.tsx`
- `src/lib/db/schema.ts` - Add ParameterPreset interface
- `src/lib/db/queries.ts` - CRUD for presets

**Files to modify:**
- `src/components/chat/chat-shell.tsx` - Add preset selector
- `src/app/settings/page.tsx` - Preset management UI

**Requirements:**
- Save presets (temperature, max_tokens, top_p, etc.)
- Quick switch with one click from chat header
- Preset management UI in settings
- Preset names (e.g., "Creative", "Precise", "Fast")

**Database schema addition needed:**
```typescript
interface ParameterPreset {
  id: string;
  name: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  frequencyPenalty?: number;
  createdAt: number;
}
```

---

#### 7. Enhanced Tagging System (TOP USER REQUEST)
**Status:** ⚠️ Basic tags exist, enhanced features missing  
**Files to modify:**
- `src/components/sidebar/chat-list.tsx`
- `src/lib/db/schema.ts` - Enhance Tag interface
- `src/lib/db/queries.ts` - Tag CRUD operations

**Requirements:**
- Color-coded tags (add `color` field to tags)
- Tag creation, deletion, renaming UI
- Automated tagging rules (e.g., auto-tag based on keywords)
- Tag usage statistics
- Tag filtering in sidebar
- Tag management dialog

**Current state:** Tags exist in Chat schema (`tags?: string[]`) but no UI for management.

---

#### 8. Model Favorites & Pinned Sets
**Status:** ⚠️ Schema exists, UI missing  
**Files to modify:**
- `src/components/model-picker/model-picker-dialog.tsx`
- `src/lib/db/queries.ts` - ModelFavorite CRUD (schema exists)

**Requirements:**
- Star/favorite models button
- Pinned model sets section
- Recent models section (track last used)
- Quick switch from header

**Current state:** `ModelFavorite` interface exists in schema.ts (lines 68-73) but no UI.

---

### Phase 3: Context & Organization (Week 2-3)

#### 9. Recent Activity View (HIGH USER DEMAND)
**Status:** ❌ Not implemented  
**Files to create:**
- `src/components/sidebar/recent-activity.tsx`

**Files to modify:**
- `src/components/sidebar/sidebar.tsx` - Add recent activity section

**Requirements:**
- Show last 3-5 requests/chats
- Quick access from sidebar
- Click to jump to chat
- Show timestamp and preview

---

#### 10. Conversation Forking
**Status:** ⚠️ Schema supports it, UI missing  
**Files to modify:**
- `src/components/chat/message-item.tsx` - Add fork button
- `src/lib/db/queries.ts` - Fork conversation function

**Requirements:**
- Branch conversations from any message
- Use `parentId` in schema (already exists)
- Fork button in message actions
- Create new chat from fork

**Current state:** `parentId` exists in Message schema (line 43) but no UI.

---

#### 11. Advanced Sidebar Organization
**Status:** ⚠️ Basic organization exists, advanced features missing  
**Files to modify:**
- `src/components/sidebar/chat-list.tsx`
- `src/lib/db/schema.ts` - Folder interface exists (lines 75-80)

**Requirements:**
- Folders with drag & drop
- Tag filtering
- Pinned/favorites sections (schema has `pinned` and `favorite` fields)
- Nested folder support
- Folder management UI

**Current state:** Folders exist in schema but no UI for creation/management.

---

### Phase 4: Advanced Features (Week 3-4)

#### 12. LLM Council Feature (TOP USER REQUEST)
**Status:** ❌ Not implemented  
**Files to create:**
- `src/components/llm-council/llm-council.tsx`
- `src/lib/llm-council/council-orchestrator.ts`
- `src/app/api/council/route.ts`

**Requirements:**
- Query multiple models simultaneously
- Each model reviews others' outputs
- Rank and synthesize final response
- "Chairman" model for final compilation
- Display all stages in UI with collapsible sections

**Architecture:**
1. Stage 1: Query all models in parallel
2. Stage 2: Each model reviews others' outputs
3. Stage 3: Chairman model synthesizes final response

---

#### 13. Multi-Provider Support
**Status:** ⚠️ Only OpenRouter supported  
**Files to modify:**
- `src/app/onboarding/page.tsx` - Support multiple providers
- `src/app/api/chat/route.ts` - Route to correct provider
- `src/stores/api-keys-store.ts` - Enhance provider support

**Providers to add:**
- OpenAI (direct API)
- Anthropic (direct API)
- Google (via OpenRouter initially, then direct)
- Ollama (local models)

**Requirements:**
- Provider selection in onboarding
- API key per provider
- Guided setup for non-technical users
- Provider-specific error handling

---

#### 14. Slash Commands
**Status:** ❌ Not implemented  
**Files to create:**
- `src/components/chat/slash-commands.tsx`

**Files to modify:**
- `src/components/chat/input-area.tsx` - Integrate slash commands

**Commands to implement:**
- `/new` - New chat
- `/model` - Change model
- `/clear` - Clear conversation
- `/export` - Export chat
- `/settings` - Open settings

**Requirements:**
- Autocomplete in input area
- Show command list on `/`
- Execute command on Enter

---

#### 15. File Upload & @File Referencing Enhancement
**Status:** ⚠️ Component exists, needs enhancement  
**Files to modify:**
- `src/components/projects/file-uploader.tsx` - Enhance existing
- `src/lib/utils/file-extractor.ts` - Enhance existing
- `src/components/chat/input-area.tsx` - Add file upload button

**Requirements:**
- Drag & drop file upload
- PDF, DOCX, TXT extraction (libraries exist: pdf-parse, mammoth)
- File preview in sidebar
- @file referencing in messages (parsing exists, needs UI polish)

**Current state:** File uploader component exists but may need UI improvements.

---

#### 16. Tool Calling Framework Enhancement
**Status:** ⚠️ Basic tool selector exists, framework needs work  
**Files to create:**
- `src/lib/tools/tool-registry.ts`
- `src/lib/tools/web-search.ts`
- `src/lib/tools/image-generation.ts`

**Files to modify:**
- `src/app/api/chat/route.ts` - Add tool definitions
- `src/components/chat/message-item.tsx` - Render tool calls better

**Requirements:**
- Web search (with multiple searches per answer)
- Image generation (2K/4K support)
- Plugin management UI (rearrange/organize)
- Tool selector component (exists but may need enhancement)

---

#### 17. Mermaid & Recharts Integration
**Status:** ❌ Not implemented  
**Files to create:**
- `src/components/markdown/mermaid-diagram.tsx`
- `src/components/markdown/chart-renderer.tsx`

**Files to modify:**
- `src/components/markdown/markdown-renderer.tsx` - Add mermaid support

**Requirements:**
- Detect mermaid code blocks
- Render diagrams client-side
- Support recharts JSON in markdown
- Lazy load heavy libraries

**Note:** `mermaid` and `recharts` are already in package.json.

---

#### 18. Audio Input/Output
**Status:** ❌ Not implemented  
**Files to create:**
- `src/components/chat/audio-input.tsx`

**Requirements:**
- Voice input (Web Speech API)
- Text-to-speech
- Audio file upload
- Microphone button in input area

---

#### 19. High-Resolution Image Generation
**Status:** ❌ Not implemented  
**Files to create:**
- `src/lib/tools/image-generation.ts`

**Requirements:**
- 2K/4K resolution support
- DALL-E, Midjourney API integration
- Quality settings
- Cost estimation

---

#### 20. Chat Sharing & Continue Feature
**Status:** ❌ Not implemented  
**Files to create:**
- `src/components/chat/share-chat.tsx`
- `src/app/share/[chatId]/page.tsx` - Shared chat route

**Requirements:**
- Generate shareable chat links
- Private links (logged-in only)
- Continue conversation feature
- Access control

---

#### 21. Memory Tools (MCP)
**Status:** ❌ Not implemented  
**Files to create:**
- `src/lib/mcp/memory-connector.ts`
- `src/components/memory/memory-manager.tsx`

**Requirements:**
- MCP-compatible memory connector
- Persistent memory across chats
- Memory management UI
- Memory search

---

### Phase 5: Polish & Performance (Week 4)

#### 22. Mobile Responsiveness
**Status:** ⚠️ Needs work  
**Files to modify:**
- All components - Responsive layouts
- `src/components/sidebar/sidebar.tsx` - Mobile drawer (use `vaul`)

**Requirements:**
- Responsive layouts for all screens
- Mobile-optimized sidebar (drawer)
- Touch-friendly interactions
- Mobile keyboard handling

**Note:** `vaul` is already in package.json for mobile drawers.

---

#### 23. Accessibility
**Status:** ⚠️ Basic, needs enhancement  
**Files to modify:**
- All components - Add ARIA labels
- `src/app/globals.css` - High contrast mode

**Requirements:**
- Screen reader support
- Keyboard navigation
- Text resize options
- High contrast mode
- ARIA labels everywhere
- WCAG 2.1 AA compliance

---

#### 24. Feedback Mechanisms
**Status:** ❌ Not implemented  
**Files to modify:**
- `src/components/chat/message-item.tsx` - Add thumbs up/down

**Requirements:**
- Thumbs up/down buttons
- Implicit tracking (acceptance, follow-ups)
- Response quality metrics
- Store feedback in database

---

#### 25. Export/Import
**Status:** ❌ Not implemented  
**Files to create:**
- `src/lib/utils/export-import.ts`
- `src/components/settings/export-import-settings.tsx`

**Requirements:**
- Export chats as JSON, PDF, CSV
- Import with validation (Zod schemas)
- Bulk operations
- Export all data

---

#### 26. PWA Configuration
**Status:** ⚠️ Basic manifest exists, needs enhancement  
**Files to modify:**
- `next.config.mjs` - Add PWA config
- `public/manifest.json` - Enhance manifest
- `src/app/layout.tsx` - Add PWA meta tags

**Requirements:**
- Installable PWA
- Offline support (service worker)
- App icons
- Splash screens

**Note:** `@ducanh2912/next-pwa` is in devDependencies but not configured.

---

#### 27. Transparent Pricing Display
**Status:** ⚠️ Cost calculation exists, display missing  
**Files to create:**
- `src/components/chat/cost-display.tsx`

**Files to modify:**
- `src/components/chat/chat-shell.tsx` - Add cost display
- `src/components/chat/message-item.tsx` - Show per-message cost

**Requirements:**
- Real-time cost estimation
- Per-chat cost tracking (already exists in schema)
- Per-project budget caps
- Cost alerts
- Clear breakdown (platform vs API costs)

**Current state:** Cost calculation exists in `use-chat.ts` (line 118) but not displayed.

---

## 📊 Implementation Status Summary

### ✅ Completed: 8 features
1. Real-time streaming updates
2. Continue Response Button
3. Command Palette
4. @Mention Autocomplete
5. Budget Settings
6. Tool Selector
7. Reasoning Control
8. Cross-chat referencing (parsing)

### ❌ Missing: 27 features
- **Critical (Week 1):** 4 features
- **High Priority (Week 2):** 4 features
- **Medium Priority (Week 3):** 3 features
- **Advanced (Week 3-4):** 10 features
- **Polish (Week 4):** 6 features

---

## 🎯 Recommended Implementation Order

### Week 1 (Critical UX)
1. Settings Page (#1)
2. Keyboard Shortcuts (#2)
3. Auto-Scroll Pause (#3)
4. Enhanced Error Handling (#4)

### Week 2 (User-Requested Features)
5. Model-Specific Parameters (#5)
6. Parameter Presets (#6)
7. Enhanced Tagging (#7)
8. Model Favorites (#8)
9. Recent Activity View (#9)

### Week 3 (Advanced Features)
10. LLM Council (#12)
11. Multi-Provider Support (#13)
12. Conversation Forking (#10)
13. Advanced Sidebar Organization (#11)

### Week 4 (Polish & Tools)
14. Slash Commands (#14)
15. Mermaid/Recharts (#17)
16. Export/Import (#25)
17. PWA Configuration (#26)
18. Mobile Responsiveness (#22)
19. Accessibility (#23)

---

## 📝 Notes for Developer

1. **Database Schema:** Most schemas exist in `src/lib/db/schema.ts`. Check before creating new ones.
2. **Existing Components:** Many UI components exist in `src/components/ui/`. Reuse them.
3. **State Management:** Uses Zustand stores in `src/stores/`. Follow existing patterns.
4. **Database Queries:** All queries in `src/lib/db/queries.ts`. Add new queries there.
5. **Styling:** Uses Tailwind CSS with shadcn/ui components. Follow existing patterns.
6. **TypeScript:** Strict typing. All interfaces in `src/lib/db/schema.ts`.

---

## 🔗 Key Files Reference

- **Database Schema:** `src/lib/db/schema.ts`
- **Database Queries:** `src/lib/db/queries.ts`
- **Chat Hook:** `src/hooks/use-chat.ts`
- **UI Store:** `src/stores/ui-store.ts`
- **Settings Store:** `src/stores/settings-store.ts`
- **API Keys Store:** `src/stores/api-keys-store.ts`
- **Main Layout:** `src/app/layout.tsx`
- **Home Page:** `src/app/page.tsx`
- **Chat Shell:** `src/components/chat/chat-shell.tsx`
- **Command Palette:** `src/components/command-palette/command-palette.tsx`

---

**Good luck! 🚀**

