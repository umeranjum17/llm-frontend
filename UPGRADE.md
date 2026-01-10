# Lumina - The Ultimate LLM Frontend

## Vision
Build the most powerful, beautiful, and intuitive LLM frontend that surpasses Typing Mind, T3Chat, and ChatGPT. A tool that feels magical to use, works flawlessly on mobile, and integrates seamlessly with your digital life.

---

## 1. UI/UX Overhaul - "Make It Beautiful"

### Design Philosophy
Move from the current "functional but dull" design to a **vibrant, modern aesthetic** inspired by the best SaaS products.

### Color System Revamp
```
Current: Muted teal/cyan accents on dark background
Target:  Dynamic gradient system with depth and energy
```

**New Palette:**
- **Primary gradient**: Pink (#FF6B9D) → Purple (#C084FC) → Blue (#60A5FA)
- **Background**: Deep charcoal (#0D0D0F) with subtle noise texture
- **Cards**: Glassmorphism with `backdrop-blur` and subtle borders
- **Accents**: Vibrant neon highlights for interactive elements
- **Success/Error**: Soft green/red with gradient undertones

### Component Upgrades

#### Cards & Containers
- [ ] Add glassmorphism: `bg-white/5 backdrop-blur-xl border border-white/10`
- [ ] Subtle gradient borders on hover
- [ ] Floating shadows with color tint: `shadow-lg shadow-pink-500/10`
- [ ] Micro-animations on interaction (scale, glow)

#### Buttons & CTAs
- [ ] Gradient buttons for primary actions
- [ ] Shimmer effect on hover
- [ ] Soft press animation (scale down 0.98)
- [ ] Icon animations (rotate, bounce)

#### Input Fields
- [ ] Glowing focus rings with gradient
- [ ] Floating labels with smooth transitions
- [ ] Inline validation with animated icons
- [ ] Voice input button with pulsing animation

#### Chat Interface
- [ ] Message bubbles with subtle gradients
- [ ] Typing indicator with smooth dot animation
- [ ] Code blocks with syntax-highlighted gradient headers
- [ ] Smooth scroll with momentum
- [ ] Message reactions with particle effects

#### Sidebar
- [ ] Collapsible with smooth animation
- [ ] Active item with gradient indicator bar
- [ ] Hover states with glow effect
- [ ] Folder icons with subtle color coding
- [ ] Quick actions on hover (pin, delete, rename)

### Typography
- [ ] Larger, bolder headings with gradient text option
- [ ] Better line-height for readability (1.6 for body)
- [ ] Subtle letter-spacing on headings
- [ ] Font weight contrast (300 for body, 600 for emphasis)

### Animations & Micro-interactions
- [ ] Page transitions with Framer Motion
- [ ] Staggered list animations
- [ ] Skeleton loaders with shimmer
- [ ] Toast notifications slide + fade
- [ ] Modal zoom-in with backdrop blur transition
- [ ] Button ripple effects
- [ ] Scroll-triggered animations

### Dark/Light Mode
- [ ] Refined light mode (not just inverted colors)
- [ ] Smooth theme transition animation
- [ ] Auto-detect system preference
- [ ] Accent color customization

---

## 2. Mobile-First Excellence

### Current State
Basic responsive design with sidebar toggle. Needs significant improvement for true mobile-first experience.

### Native-Like Mobile Experience

#### Bottom Navigation Bar
```
┌─────────────────────────────────────┐
│                                     │
│         Chat Content Area           │
│                                     │
├─────────────────────────────────────┤
│  [Chat]  [Search]  [+]  [Lib]  [Me] │
└─────────────────────────────────────┘
```
- [ ] Swipe gestures for navigation
- [ ] Haptic feedback on actions (Web Vibration API)
- [ ] Bottom sheet modals (slide up)
- [ ] Pull-to-refresh for chat history

#### Mobile Input Experience
- [ ] Full-screen composer option
- [ ] Swipe-to-reply on messages
- [ ] Long-press context menus
- [ ] Quick voice input button
- [ ] Attachment picker sheet
- [ ] Smart keyboard avoidance

#### Mobile Chat Features
- [ ] Swipe left/right between chats
- [ ] Double-tap to react
- [ ] Pinch-to-zoom on images/code
- [ ] Share sheet integration
- [ ] Copy code with one tap

#### PWA Enhancements
- [ ] App icon with badge notifications
- [ ] Splash screen with branding
- [ ] Offline mode with queue
- [ ] Background sync for messages
- [ ] Push notifications for responses
- [ ] "Add to Home Screen" prompt

#### Touch Optimizations
- [ ] Minimum 44px touch targets
- [ ] Swipe-to-delete in lists
- [ ] Drag handles for reordering
- [ ] Edge swipe for back navigation
- [ ] Momentum scrolling everywhere

---

## 3. Dynamic @ Mentions System

### Current State
Prompts accessed via `/` slash commands in modal picker.

### New @ Mention System
Transform how users access prompts, agents, files, and more with an inline, intuitive @ mention system.

#### Trigger Characters
```
@  - Agents, Prompts, Commands
#  - Tags, Categories
/  - Quick actions (legacy support)
[[  - Link to chats/documents
```

#### @ Mention Popup
When user types `@`:
```
┌─────────────────────────────────┐
│ 🔍 Search agents & prompts...   │
├─────────────────────────────────┤
│ RECENTLY USED                   │
│ @summarize    ⭐ Summarize text │
│ @code-review  Review code       │
│ @translate    Multi-language    │
├─────────────────────────────────┤
│ AGENTS                          │
│ @analyst      Research Analyst  │
│ @coder        Code Assistant    │
├─────────────────────────────────┤
│ PROMPTS                         │
│ @explain      Explain concept   │
│ @debug        Debug issue       │
└─────────────────────────────────┘
```

#### Inline Execution
```
User types: "@summarize this article about AI safety"
           └─ Agent/prompt auto-applied, no modal needed
```

#### Variable Injection
```
User types: "@translate to {{lang}}"
           └─ Inline variable picker appears
              [Spanish] [French] [German] [Custom...]
```

#### Chained Mentions
```
"@summarize then @translate to Spanish"
└─ Sequential agent execution
```

#### Implementation
- [ ] Textarea mention plugin (like Twitter/Slack)
- [ ] Fuzzy search with Fuse.js
- [ ] Keyboard navigation (↑↓ Enter Esc)
- [ ] Recent/favorite prioritization
- [ ] Custom aliases (`@s` → `@summarize`)
- [ ] Mention highlighting in input
- [ ] Auto-complete suggestions

#### @ Types
| Prefix | Entity | Example |
|--------|--------|---------|
| `@` | Agent | `@code-assistant` |
| `@` | Prompt | `@summarize` |
| `@file:` | File | `@file:readme.md` |
| `@chat:` | Previous chat | `@chat:yesterday` |
| `@web:` | Web search | `@web:latest news` |
| `@mem:` | Memory | `@mem:my preferences` |

---

## 4. Connector & Integration System

### Vision
Let users connect their data sources and sync information bidirectionally with the LLM.

### Connector Architecture
```
┌─────────────────────────────────────────────┐
│              LUMINA CORE                     │
├─────────────────────────────────────────────┤
│  ┌─────────┐  ┌─────────┐  ┌─────────┐     │
│  │ Notion  │  │ Google  │  │ GitHub  │     │
│  │Connector│  │Connector│  │Connector│     │
│  └────┬────┘  └────┬────┘  └────┬────┘     │
│       │            │            │           │
│       ▼            ▼            ▼           │
│  ┌─────────────────────────────────────┐   │
│  │         Unified Data Layer          │   │
│  │   (Vector Store + Metadata Index)   │   │
│  └─────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

### Connector Types

#### Document Sources
- [ ] **Notion** - Pages, databases, comments
- [ ] **Google Drive** - Docs, Sheets, Slides
- [ ] **Dropbox** - Files and folders
- [ ] **OneDrive** - Microsoft documents
- [ ] **Obsidian** - Vault sync (local)
- [ ] **Roam Research** - Graph database

#### Code & Dev
- [ ] **GitHub** - Repos, issues, PRs, discussions
- [ ] **GitLab** - Similar to GitHub
- [ ] **Linear** - Issues and projects
- [ ] **Jira** - Tickets and sprints

#### Communication
- [ ] **Slack** - Channels, DMs, threads
- [ ] **Discord** - Servers and channels
- [ ] **Email** - Gmail, Outlook (read-only)
- [ ] **Twitter/X** - Bookmarks, likes

#### Knowledge
- [ ] **Readwise** - Highlights and notes
- [ ] **Pocket** - Saved articles
- [ ] **Raindrop** - Bookmarks
- [ ] **Zotero** - Research papers

#### Productivity
- [ ] **Todoist** - Tasks and projects
- [ ] **Calendar** - Google/Outlook events
- [ ] **Airtable** - Bases and records

### Connector Settings UI
```
┌─────────────────────────────────────────────┐
│ 🔌 Connectors                               │
├─────────────────────────────────────────────┤
│                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │  Notion  │  │  GitHub  │  │  Slack   │  │
│  │    ✓     │  │    ✓     │  │  Setup   │  │
│  │Connected │  │Connected │  │          │  │
│  └──────────┘  └──────────┘  └──────────┘  │
│                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │  Gmail   │  │  Linear  │  │ Obsidian │  │
│  │  Setup   │  │  Setup   │  │  Setup   │  │
│  └──────────┘  └──────────┘  └──────────┘  │
│                                             │
│  [+ Add Custom Connector]                   │
│                                             │
├─────────────────────────────────────────────┤
│ SYNC STATUS                                 │
│ Last sync: 5 minutes ago                    │
│ Documents indexed: 1,247                    │
│ [Sync Now]  [View Logs]                     │
└─────────────────────────────────────────────┘
```

### Sync Features
- [ ] **Selective sync** - Choose specific folders/channels
- [ ] **Sync schedules** - Real-time, hourly, daily
- [ ] **Incremental updates** - Only sync changes
- [ ] **Conflict resolution** - Handle bidirectional edits
- [ ] **Sync history** - Log of all sync operations
- [ ] **Storage quota** - Manage vector store size

### Using Connected Data
```
User: "What did we discuss about the API redesign?"
      └─ Searches: Slack #engineering, Notion docs, GitHub issues
         Returns relevant context automatically
```

```
User: "@notion:Project Specs summarize the requirements"
      └─ Fetches specific Notion page, summarizes
```

### OAuth Flow
- [ ] Secure OAuth 2.0 implementation
- [ ] Token refresh handling
- [ ] Scope management
- [ ] Revocation support

### Custom Connectors
- [ ] REST API connector builder
- [ ] Webhook receiver
- [ ] Zapier/Make integration
- [ ] Custom embedding pipeline

---

## 5. Advanced Agent System

### Current State
Basic agent selection with system prompts and tool configuration.

### Next-Gen Agent Features

#### Agent Workflows
```yaml
name: "Research & Write"
steps:
  - agent: @researcher
    action: "Search and gather information"
    output: research_notes

  - agent: @analyst
    action: "Analyze {{research_notes}}"
    output: analysis

  - agent: @writer
    action: "Write article based on {{analysis}}"
    output: final_article
```

#### Agent Marketplace
- [ ] Community-shared agents
- [ ] Import/export agent configs
- [ ] Agent ratings and reviews
- [ ] Featured agent collections
- [ ] One-click install

#### Agent Capabilities
- [ ] **Multi-step reasoning** - Chain-of-thought with checkpoints
- [ ] **Tool orchestration** - Multiple tools in sequence
- [ ] **Memory per agent** - Separate context per agent
- [ ] **Conditional logic** - If/then agent routing
- [ ] **Parallel execution** - Run multiple agents simultaneously
- [ ] **Human-in-the-loop** - Approval checkpoints

#### Agent Builder UI
```
┌─────────────────────────────────────────────┐
│ Create Agent                                │
├─────────────────────────────────────────────┤
│ Name: [Research Assistant        ]          │
│ Icon: [🔬] ← emoji picker                   │
│                                             │
│ System Prompt:                              │
│ ┌─────────────────────────────────────────┐ │
│ │ You are a research assistant...         │ │
│ │                                         │ │
│ │ Variables: {{topic}}, {{depth}}         │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ Tools: [✓] Web Search  [✓] Read Files      │
│        [ ] Code Exec   [✓] Memory          │
│                                             │
│ Connectors: [✓] Notion  [ ] GitHub         │
│                                             │
│ Triggers:                                   │
│ • @research, @study                         │
│ • "research about...", "find info on..."   │
│                                             │
│ [Test Agent]  [Save]  [Publish to Market]  │
└─────────────────────────────────────────────┘
```

---

## 6. Enhanced Chat Experience

### Message Threading
- [ ] Reply to specific messages
- [ ] Collapsible thread views
- [ ] Thread summary generation
- [ ] Jump to context

### Collaboration (Future)
- [ ] Shared chats with link
- [ ] Real-time collaboration
- [ ] Comments on messages
- [ ] @mention team members

### Rich Message Types
- [ ] Polls and surveys
- [ ] Interactive forms
- [ ] Embedded widgets
- [ ] Live data previews
- [ ] Audio messages

### Chat Organization
- [ ] Smart folders (auto-categorize)
- [ ] Custom views (by date, agent, topic)
- [ ] Powerful search with filters
- [ ] Bulk operations

### Context Window
- [ ] Visual token usage meter
- [ ] Context compression options
- [ ] Smart truncation preview
- [ ] "Continue from here" markers

---

## 7. Power User Features

### Command Palette (Cmd+K)
```
┌─────────────────────────────────────────────┐
│ 🔍 Type a command or search...              │
├─────────────────────────────────────────────┤
│ QUICK ACTIONS                               │
│ ⌘N  New Chat                                │
│ ⌘⇧P Open Prompts                            │
│ ⌘/  Toggle Sidebar                          │
├─────────────────────────────────────────────┤
│ RECENT CHATS                                │
│ 📝 API Design Discussion                    │
│ 💻 Debug React Issue                        │
├─────────────────────────────────────────────┤
│ AGENTS                                      │
│ 🔬 Research Assistant                       │
│ 💻 Code Helper                              │
└─────────────────────────────────────────────┘
```

### Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| `⌘ K` | Command palette |
| `⌘ N` | New chat |
| `⌘ ⇧ N` | New chat with agent |
| `⌘ /` | Toggle sidebar |
| `⌘ ⇧ P` | Quick prompt |
| `⌘ Enter` | Send message |
| `⌘ ⇧ C` | Copy last response |
| `⌘ ⇧ R` | Regenerate |
| `⌘ E` | Edit last message |
| `⌘ ↑/↓` | Navigate history |

### Templates System
- [ ] Chat templates (pre-filled context)
- [ ] Response templates (reusable outputs)
- [ ] Project templates (full workspace setup)

### Analytics Dashboard
- [ ] Token usage over time
- [ ] Cost breakdown by model/agent
- [ ] Most used agents/prompts
- [ ] Response time metrics
- [ ] Usage patterns

---

## 8. Technical Improvements

### Performance
- [ ] Virtual scrolling for long chats
- [ ] Lazy load old messages
- [ ] Image lazy loading + blur placeholder
- [ ] Service worker caching strategy
- [ ] Optimistic UI updates
- [ ] Debounced search
- [ ] Web Workers for heavy computations

### Reliability
- [ ] Message queue for offline
- [ ] Auto-retry with exponential backoff
- [ ] Conflict resolution for sync
- [ ] Health checks for providers
- [ ] Graceful degradation

### Security
- [ ] Encrypt API keys at rest
- [ ] Content Security Policy
- [ ] Input sanitization
- [ ] Rate limiting awareness
- [ ] Audit logging

### Developer Experience
- [ ] Plugin/extension API
- [ ] Theme customization API
- [ ] Webhook support
- [ ] REST API for automation
- [ ] CLI companion tool

---

## 9. Implementation Priorities

### Phase 1: Foundation (UI + Mobile)
1. Color system and design tokens overhaul
2. Component library upgrade (glassmorphism, gradients)
3. Mobile bottom navigation
4. Touch gestures and PWA enhancements
5. Animation system with Framer Motion

### Phase 2: @ Mentions System
1. Textarea mention plugin
2. Agent/prompt inline picker
3. Variable injection UI
4. Keyboard navigation
5. Custom aliases

### Phase 3: Connectors
1. Connector architecture
2. OAuth flow implementation
3. Notion connector (most requested)
4. GitHub connector
5. Sync management UI

### Phase 4: Advanced Features
1. Agent workflows
2. Collaboration features
3. Analytics dashboard
4. Plugin system

---

## 10. Success Metrics

### User Experience
- First contentful paint < 1s
- Time to interactive < 2s
- Lighthouse score > 95
- Mobile usability score 100%

### Engagement
- Daily active usage increase
- Session duration improvement
- Feature adoption rates
- User satisfaction (NPS)

### Technical
- Zero downtime deployments
- API response time < 200ms
- Error rate < 0.1%
- 100% offline capability

---

## Design Inspiration

### Reference Products
- **ChatGPT** - Conversation UX, streaming
- **Notion** - Block-based editing, connectors
- **Linear** - Speed, keyboard-first, clean design
- **Raycast** - Command palette, extensibility
- **Arc Browser** - Innovative UI, spaces
- **Slack** - @ mentions, threads, integrations
- **TrustMRR** - Vibrant gradients, glassmorphism, dark mode excellence

### Design Principles
1. **Speed is a feature** - Every interaction feels instant
2. **Progressive disclosure** - Simple by default, powerful when needed
3. **Keyboard-first** - Everything accessible via keyboard
4. **Mobile-native** - Not mobile-responsive, mobile-FIRST
5. **Delightful details** - Micro-interactions that spark joy
6. **Accessible** - WCAG 2.1 AA compliance minimum

---

*This document is a living roadmap. Features will be prioritized based on user feedback and technical feasibility.*
