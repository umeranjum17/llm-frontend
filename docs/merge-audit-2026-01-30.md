# Merge Audit & Fix Report — Jan 30, 2026

## What Was Done

### Branches Merged into Main
1. **feature/unified-code-runner-and-expanded-artifacts** (13 commits) — Clean merge
2. **feature/cloud-sync** — Problematic merge, partially reverted

### Branches Deleted (local + remote)
- `feature/unified-code-runner-and-expanded-artifacts`
- `feature/cloud-sync`
- `feature/delta-sync`
- `feature/multi-model-mode`
- `fix/audit-fixes`
- `launch-readiness`

### Worktrees Removed
- `.worktrees/unified-code-runner`

---

## New Features Added

### Sandpack Code Fence Parsing
- `markdown-renderer.tsx` now handles `` ```sandpack:template `` fences
- Parses `// @file /path` markers to split into multiple files
- New component: `src/components/markdown/sandpack-inline-preview.tsx`
- During streaming: shows as regular code block
- After streaming: shows file listing with "Open in Sandpack" fullscreen button

### Inline HTML Preview
- `code-block.tsx` detects HTML code blocks containing `<!DOCTYPE`, `<html`, or `<body>`
- Shows Eye/Code toggle button for preview
- Preview uses sandboxed `<iframe srcDoc>` with `sandbox="allow-scripts"`
- Useful for games, demos, landing pages

### Unified Code Runner & Artifact Viewers (from feature branch)
- `src/components/artifacts/slides-viewer.tsx` — Interactive slides with PPTX/PDF export
- `src/components/artifacts/document-viewer.tsx` — Rich document viewer with TOC, DOCX/PDF export
- `src/components/artifacts/spreadsheet-viewer.tsx` — Interactive table with sorting/filtering, XLSX/CSV export
- `src/components/artifacts/code-runner.tsx` — Unified Sandpack + E2B executor
- `src/lib/utils/export-utils.ts` — Export utilities (lazy-loaded: pptxgenjs, jspdf, docx, xlsx)

### Updated Skill Prompts
- Code Writer skill: clear decision guide (HTML → `html` fence, multi-file → `sandpack:template`, computation → E2B)
- Slides skill: now uses `slides` fence with `---` separators (not JSON)
- Document skill: now uses `document` fence with optional YAML frontmatter
- Spreadsheet skill: now uses `spreadsheet` fence with CSV data

---

## What Broke & How It Was Fixed

### Cloud-Sync Merge Damage (CRITICAL)
**Problem:** `feature/cloud-sync` was based on old main and tried to replace Dexie with RxDB. The `-X ours` merge strategy only resolved conflict markers — non-conflicting changes still got through:
- `queries.ts` was rewritten to import from `rxdb-helpers` (rxdb not installed)
- `message-list.tsx` changed to use `useRxQueryWithTimeout` (doesn't exist)
- 20+ new files added that were orphaned dead code

**Fix:**
- Restored `queries.ts`, `message-list.tsx`, `schema.ts` to pre-cloud-sync state
- Removed all cloud-sync/rxdb files:
  - `src/lib/cloud-sync/` (entire directory)
  - `src/lib/backup/emergency-backup.ts`
  - `src/lib/db/rxdb-helpers.ts`, `src/lib/db/rxdb.ts`
  - `src/stores/cloud-sync-store.ts`
  - `src/hooks/use-cloud-sync-init.ts`, `src/hooks/use-cloud-sync.ts`
  - `src/components/cloud-sync/sync-status-indicator.tsx`
  - `src/components/settings/cloud-sync-settings.tsx`
  - Various markdown docs (OBSERVABLE_MIGRATION_GUIDE, etc.)

### 280 Type Errors
**Problem:** Feature branches brought files without type annotations under `strict: true` tsconfig.
**Fix:** Added proper type annotations to 40 files (Agent, Skill, Message, Chat, Model, Tag, etc. types on `.map()`, `.filter()`, `.find()`, `.reduce()` callbacks).

### Mermaid Diagram Error
**Problem:** "Could not find a suitable point for the given distance" — known mermaid edge routing issue with `curve: "basis"`.
**Fix:** Changed `curve: "basis"` → `curve: "linear"` in `mermaid-diagram.tsx`.

### Missing Dependencies
**Problem:** Unified-code-runner branch added artifact viewers that need export libraries.
**Fix:** `npm install pptxgenjs jspdf html2canvas docx xlsx`

### Test Suite (vitest)
**Problem:** 17 test suites all failing — no jest config, tests written for vitest.
**Fix:**
- Tests use vitest (config already existed at `vitest.config.ts`)
- Fixed 4 failing suites:
  - `code-block.test.tsx` — Updated mocks for new imports (CodeBlockContext, RUNNABLE_LANGUAGES), collapse/expand now uses conditional rendering not CSS grid
  - `input-area.test.tsx` — Added mocks for new imports, changed `getByTitle` → `getByLabelText`, updated placeholder text
  - `chat-list.test.tsx` — Replaced dexie-react-hooks mock with useLiveQueryWithTimeout, added @tanstack/react-virtual mock
  - `message-content.test.ts` — Updated expectations (function now returns string for single text, joined string for mixed content)

### Dead Code Removed
- `src/components/markdown/slide-renderer.tsx` — Replaced by `artifacts/slides-viewer.tsx`
- `src/components/markdown/document-renderer.tsx` — Replaced by `artifacts/document-viewer.tsx`

---

## What Was NOT Affected

### Delta Sync System (fully intact)
The production sync system in `src/lib/sync/` is completely separate from the removed cloud-sync code:

| Component | File |
|-----------|------|
| Sync manager | `src/lib/sync/sync-manager.ts` |
| S3 adapter (AWS/R2/MinIO) | `src/lib/sync/s3-adapter.ts` |
| Change tracker (Dexie hooks) | `src/lib/sync/change-tracker.ts` |
| Conflict resolution | `src/lib/sync/apply-change.ts` |
| Device management | `src/lib/sync/device-id.ts` |
| Retention cleanup | `src/lib/sync/retention-cleanup.ts` |
| Init hook | `src/hooks/use-sync-init.tsx` |
| Auto-sync hook | `src/hooks/use-auto-sync.tsx` |
| Status indicator | `src/components/sync-status-indicator.tsx` |
| Settings UI + wizard | `src/components/settings/sync-settings.tsx` |

All wired into `global-hooks.tsx` and `settings/page.tsx`.

### Other Verified Systems
- Chat system (message-list, streaming, queries)
- Sidebar (chat-list, folders, tags, sync indicator)
- Skills (quick-select, definition block, settings, embeddings)
- Agents (picker, editor, definition block)
- Model picker
- Settings page (all 13 sections)
- Database layer (Dexie, schema v31, table-registry)
- Markdown rendering (all 8 block types)

---

## Final State

| Check | Result |
|-------|--------|
| TypeScript errors | 0 |
| Build | Passes |
| Tests | 237/237 pass (17 suites) |
| Branches | main only |
| Remote branches | main only |
| Worktrees | none |
| Working tree | clean |

## Commits
- `09f15b4` — feat: add sandpack code fence parsing + inline HTML preview
- `227810f` — merge: integrate unified-code-runner branch
- `c099406` — merge: cloud-sync (problematic)
- `f17e8a5` — fix: revert broken cloud-sync merge, fix 280 type errors, update tests
