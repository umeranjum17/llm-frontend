# Fix Mermaid Diagram Rendering — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix mermaid diagrams so blocks don't overflow their containers, text is clear, and diagrams are visually polished.

**Architecture:** The root cause is twofold: (1) the SVG wrapper uses `w-fit` which allows unbounded width, (2) several prose CSS resets are missing coverage so Tailwind prose styles still bleed through. We'll constrain the SVG container, add a comprehensive wildcard CSS reset, and configure mermaid's `useMaxWidth` for all diagram types.

**Tech Stack:** Tailwind CSS, Mermaid.js ^11.4.0, React, Next.js

---

### Task 1: Fix SVG container overflow

**Files:**
- Modify: `src/components/markdown/mermaid-diagram.tsx:146-150`

**Step 1: Update the SVG wrapper to constrain width**

Change the inner div wrapping the SVG from `w-fit` to `w-full flex justify-center` and use `[&>svg]:max-w-full` instead of `[&>svg]:overflow-visible` to keep SVGs within bounds.

**Step 2: Verify visually** — render a flowchart in chat, confirm no overflow.

**Step 3: Commit**

```bash
git add src/components/markdown/mermaid-diagram.tsx
git commit -m "fix: constrain mermaid SVG width to prevent overflow"
```

---

### Task 2: Add comprehensive CSS resets for all prose elements inside mermaid

**Files:**
- Modify: `src/app/globals.css:498-536`

**Step 1: Replace the existing mermaid isolation CSS**

Replace the element-by-element rules with a single wildcard reset:

```css
.prose .mermaid-container,
.prose .mermaid-container * {
  margin: 0;
  padding: 0;
  line-height: normal;
  color: inherit;
  border: none;
  background: none;
  text-decoration: none;
  font-size: inherit;
  font-style: normal;
  font-weight: normal;
  letter-spacing: normal;
  white-space: normal;
  list-style: none;
  border-radius: 0;
  box-shadow: none;
  min-width: 0;
  min-height: 0;
  max-width: none;
  max-height: none;
}
```

Then restore the container's own margin and add foreignObject overflow handling.

**Step 2: Verify CSS compiles** — run `npx next build`.

**Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "fix: comprehensive prose reset for mermaid containers"
```

---

### Task 3: Enable useMaxWidth for all mermaid diagram types

**Files:**
- Modify: `src/components/markdown/mermaid-diagram.tsx:15-20`

**Step 1: Update mermaid.initialize**

Add `useMaxWidth: true` config for flowchart, sequence, gantt, class, state, er, pie, journey, and mindmap diagram types. This tells mermaid to size SVGs to 100% container width rather than intrinsic pixel dimensions — the single most impactful fix for overflow.

**Step 2: Verify** — test flowchart and sequence diagrams render within bounds.

**Step 3: Commit**

```bash
git add src/components/markdown/mermaid-diagram.tsx
git commit -m "fix: enable useMaxWidth for all mermaid diagram types"
```

---

### Task 4: Fix fullscreen modal SVG rendering

**Files:**
- Modify: `src/components/markdown/mermaid-diagram.tsx:172-176`

**Step 1: Update fullscreen modal container**

Constrain to `max-w-[90vw] max-h-[85vh]` with `flex items-center justify-center` and padding.

**Step 2: Verify fullscreen** — click maximize, confirm diagram is centered and scrollable.

**Step 3: Commit**

```bash
git add src/components/markdown/mermaid-diagram.tsx
git commit -m "fix: improve fullscreen modal diagram layout"
```

---

### Task 5: Visual QA

**Step 1: Test all diagram types** — flowchart, sequence, class diagram.

**Step 2: Verify** — no overflow, clear text, proper containment within message bubble.

**Step 3: Final commit if tweaks needed**

```bash
git add -A
git commit -m "fix: mermaid diagram rendering polish"
```
