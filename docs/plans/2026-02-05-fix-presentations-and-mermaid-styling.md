# Fix Presentations & Mermaid Diagram Styling

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Reveal.js presentations visually polished (not bland white/black boxes) and make Mermaid diagrams use monochrome theme-aware colors (white for light mode, dark for dark mode, no colorful blues).

**Architecture:** Update the mermaid-diagram.tsx component to detect the app theme via `useTheme()` hook and switch between neutral light/dark configs. Update slides-viewer.tsx to have better visual polish in the embedded styles and use theme-adaptive mermaid colors.

**Tech Stack:** React, next-themes, Mermaid.js, Reveal.js

---

## Task 1: Update Mermaid Diagram Theming

**Files:**
- Modify: `/home/umer/Github/llm-frontend/src/components/markdown/mermaid-diagram.tsx`

**Step 1: Import useTheme hook**

Add the import at the top of the file:

```typescript
import { useTheme } from "next-themes";
```

**Step 2: Create theme-aware mermaid configs**

Replace the single `mermaidConfig` with two configs - one for light mode, one for dark mode. Use neutral grays instead of colorful blues:

```typescript
const baseMermaidConfig = {
  startOnLoad: false,
  securityLevel: "loose" as const,
  fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
  flowchart: { useMaxWidth: true, htmlLabels: true, padding: 16, curve: "linear" as const },
  sequence: { useMaxWidth: true, wrap: true },
  gantt: { useMaxWidth: true },
  class: { useMaxWidth: true },
  state: { useMaxWidth: true },
  er: { useMaxWidth: true },
  pie: { useMaxWidth: true },
  journey: { useMaxWidth: true },
  mindmap: { useMaxWidth: true },
};

const darkThemeVariables = {
  darkMode: true,
  background: "#0d1117",
  primaryColor: "#30363d",
  primaryTextColor: "#e6edf3",
  primaryBorderColor: "#484f58",
  secondaryColor: "#21262d",
  secondaryTextColor: "#e6edf3",
  secondaryBorderColor: "#30363d",
  tertiaryColor: "#161b22",
  tertiaryTextColor: "#e6edf3",
  tertiaryBorderColor: "#30363d",
  lineColor: "#484f58",
  textColor: "#e6edf3",
  mainBkg: "#30363d",
  nodeBorder: "#484f58",
  clusterBkg: "#21262d",
  clusterBorder: "#30363d",
  titleColor: "#e6edf3",
  edgeLabelBackground: "#0d1117",
  nodeTextColor: "#e6edf3",
};

const lightThemeVariables = {
  darkMode: false,
  background: "#ffffff",
  primaryColor: "#e1e4e8",
  primaryTextColor: "#24292f",
  primaryBorderColor: "#d0d7de",
  secondaryColor: "#f6f8fa",
  secondaryTextColor: "#24292f",
  secondaryBorderColor: "#d0d7de",
  tertiaryColor: "#f6f8fa",
  tertiaryTextColor: "#24292f",
  tertiaryBorderColor: "#d0d7de",
  lineColor: "#57606a",
  textColor: "#24292f",
  mainBkg: "#e1e4e8",
  nodeBorder: "#d0d7de",
  clusterBkg: "#f6f8fa",
  clusterBorder: "#d0d7de",
  titleColor: "#24292f",
  edgeLabelBackground: "#ffffff",
  nodeTextColor: "#24292f",
};
```

**Step 3: Update getMermaid function to accept theme**

Modify the mermaid initialization to accept the current theme:

```typescript
let currentMermaidTheme: "light" | "dark" | null = null;

async function getMermaid(isDark: boolean) {
  const targetTheme = isDark ? "dark" : "light";

  // Re-initialize if theme changed
  if (mermaidInstance && currentMermaidTheme !== targetTheme) {
    mermaidInstance = null;
  }

  if (!mermaidInstance) {
    const m = await import("mermaid");
    mermaidInstance = m.default;
    const themeVars = isDark ? darkThemeVariables : lightThemeVariables;
    mermaidInstance.initialize({
      ...baseMermaidConfig,
      theme: isDark ? "dark" : "default",
      themeVariables: themeVars,
    });
    currentMermaidTheme = targetTheme;
  }
  return mermaidInstance;
}
```

**Step 4: Update renderMermaidSvg to accept theme**

```typescript
async function renderMermaidSvg(id: string, code: string, isDark: boolean): Promise<string> {
  const mermaid = await getMermaid(isDark);
  const container = document.createElement("div");
  container.style.position = "absolute";
  container.style.left = "-9999px";
  container.style.top = "-9999px";
  document.body.appendChild(container);
  try {
    const { svg } = await mermaid.render(id, code, container);
    return svg;
  } finally {
    container.remove();
  }
}
```

**Step 5: Update component to use theme**

In the `MermaidDiagram` component, add theme detection and pass it through:

```typescript
export const MermaidDiagram = memo(function MermaidDiagram({ code, className }: MermaidDiagramProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  // ... existing state declarations ...
```

Update the `renderDiagram` function calls to pass `isDark`:

```typescript
// First attempt
const renderedSvg = await renderMermaidSvg(genId(), code, isDark);

// Second attempt
const renderedSvg = await renderMermaidSvg(genId(), sanitized, isDark);

// Third attempt
const renderedSvg = await renderMermaidSvg(genId(), code, isDark);
```

**Step 6: Update background colors to be theme-aware**

Replace hardcoded `bg-[#0d1117]` with theme-aware classes:

```typescript
// In diagram container (around line 478)
className={cn(
  "overflow-hidden rounded-b-lg p-4 min-h-[200px] max-h-[70vh]",
  "bg-white dark:bg-[#0d1117]",
  isPanning ? "cursor-grabbing" : "cursor-grab"
)}

// In fullscreen modal (around line 516)
className="fixed inset-0 z-50 bg-white/98 dark:bg-[#0d1117]/98 backdrop-blur-md flex flex-col"

// In fullscreen header (around line 521)
className="flex items-center justify-between px-4 py-2 border-b border-black/10 dark:border-white/10 bg-white dark:bg-[#0d1117]"
```

**Step 7: Update PNG export background**

In `handleDownloadPng`, make background theme-aware:

```typescript
ctx.fillStyle = isDark ? "#0d1117" : "#ffffff";
```

**Step 8: Add theme to useEffect dependency**

Add `isDark` to the dependencies of the render effect:

```typescript
}, [code, isDark]);
```

**Step 9: Run the dev server and verify**

Run: `cd /home/umer/Github/llm-frontend && pnpm dev`

Verify: Toggle between light and dark mode in the app, mermaid diagrams should switch between white/gray (light) and dark/gray (dark) colors.

**Step 10: Commit**

```bash
git add src/components/markdown/mermaid-diagram.tsx
git commit -m "feat: theme-aware mermaid diagrams with neutral colors

- Add light/dark theme detection via useTheme hook
- Replace colorful blues with neutral grays
- Update background colors to match app theme
- Re-initialize mermaid when theme changes

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Task 2: Polish Reveal.js Presentation Styling

**Files:**
- Modify: `/home/umer/Github/llm-frontend/src/components/artifacts/slides-viewer.tsx`

**Step 1: Improve slide section styling**

Update the CSS in `buildRevealHtml` to add visual polish - subtle shadows, better spacing, and refined typography:

```css
.reveal .slides section {
  text-align: left;
  padding: 48px 64px;
  height: 100%;
  box-sizing: border-box;
}
.reveal .slides section h1,
.reveal .slides section h2,
.reveal .slides section h3 {
  text-transform: none;
  text-align: left;
  font-weight: 600;
  letter-spacing: -0.02em;
}
.reveal .slides section h1 {
  font-size: 2em;
  margin-bottom: 0.6em;
}
.reveal .slides section h2 {
  font-size: 1.5em;
  margin-bottom: 0.5em;
}
.reveal .slides section h3 {
  font-size: 1.2em;
  margin-bottom: 0.4em;
}
.reveal .slides section ul,
.reveal .slides section ol {
  display: block;
  margin-left: 1.5em;
}
.reveal .slides section li {
  margin-bottom: 0.5em;
  font-size: 0.9em;
  line-height: 1.7;
}
.reveal .slides section p {
  font-size: 0.9em;
  line-height: 1.7;
}
.reveal .slides section code {
  font-size: 0.85em;
  padding: 3px 8px;
  border-radius: 6px;
  background: rgba(127, 127, 127, 0.15);
}
.reveal .slides section pre {
  font-size: 0.6em;
  width: 100%;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
  border-radius: 10px;
  border: 1px solid rgba(127, 127, 127, 0.1);
}
.reveal .slides section pre code {
  background: transparent;
  padding: 0;
}
.reveal .slides section blockquote {
  width: 90%;
  font-size: 0.9em;
  padding: 16px 24px;
  border-left: 4px solid currentColor;
  opacity: 0.9;
  font-style: italic;
  background: rgba(127, 127, 127, 0.05);
  border-radius: 0 8px 8px 0;
}
.reveal .slides section table {
  font-size: 0.8em;
  border-collapse: collapse;
}
.reveal .slides section table th,
.reveal .slides section table td {
  padding: 8px 12px;
  border: 1px solid rgba(127, 127, 127, 0.2);
}
.reveal .slides section table th {
  background: rgba(127, 127, 127, 0.1);
}
.reveal .slides section img {
  max-height: 50vh;
  border-radius: 10px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.2);
}
```

**Step 2: Update mermaid styling in slides**

Update the mermaid styles to remove the boxy look:

```css
.reveal .slides section .mermaid {
  background: transparent;
  text-align: center;
  padding: 16px 0;
}
.reveal .slides section .mermaid svg {
  max-height: 55vh;
  max-width: 100%;
}
```

**Step 3: Update mermaid initialization in slides to use neutral colors**

Replace the mermaid.initialize call with neutral gray colors:

```javascript
mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  securityLevel: 'loose',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  themeVariables: {
    darkMode: true,
    background: 'transparent',
    primaryColor: '#4a5568',
    primaryTextColor: '#e2e8f0',
    primaryBorderColor: '#718096',
    secondaryColor: '#2d3748',
    secondaryTextColor: '#e2e8f0',
    secondaryBorderColor: '#4a5568',
    lineColor: '#718096',
    textColor: '#e2e8f0',
    mainBkg: '#4a5568',
    nodeBorder: '#718096',
    clusterBkg: '#2d3748',
    clusterBorder: '#4a5568',
    titleColor: '#e2e8f0',
    edgeLabelBackground: 'transparent',
    nodeTextColor: '#e2e8f0',
  }
});
```

**Step 4: Add smooth transitions**

Add transition styles for slide changes:

```css
.reveal .slides section * {
  transition: opacity 0.3s ease;
}
```

**Step 5: Run dev server and verify**

Run: `cd /home/umer/Github/llm-frontend && pnpm dev`

Create a test presentation with markdown and verify:
- Headers look polished with proper weight and spacing
- Code blocks have subtle shadows and borders
- Lists have proper spacing and line height
- Mermaid diagrams use gray colors, not blue

**Step 6: Commit**

```bash
git add src/components/artifacts/slides-viewer.tsx
git commit -m "style: polish reveal.js presentation styling

- Improve typography with better weights and spacing
- Add subtle shadows to code blocks and images
- Style blockquotes with border and background
- Use neutral gray colors for mermaid diagrams
- Add proper table styling with borders

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

---

## Summary

After completing both tasks:
1. Mermaid diagrams will use theme-aware neutral colors (white/gray for light mode, dark/gray for dark mode)
2. Reveal.js presentations will have polished typography, shadows, and consistent styling
3. No more colorful blue elements in diagrams
