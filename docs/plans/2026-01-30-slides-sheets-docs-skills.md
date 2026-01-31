# Slides, Sheets & Docs Skills Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add three new built-in skills (Slides, Sheets, Docs) that trigger when users ask to create presentations, spreadsheets, or documents, outputting content in formats the app already renders.

**Architecture:** Each skill is a new entry in the `BUILTIN_SKILLS` array in `src/lib/constants/skills.ts`. No new components needed — Slides outputs HTML (rendered via iframe artifact), Sheets outputs CSV (rendered via data-viewer artifact), Docs outputs rich Markdown (rendered via markdown artifact). The systemPrompts instruct the LLM to produce the correct output format.

**Tech Stack:** TypeScript, existing Lumina skill system, existing artifact renderers (HTML iframe, PapaParse data-viewer, MarkdownRenderer)

---

### Task 1: Add "Create Slides" built-in skill

**Files:**
- Modify: `src/lib/constants/skills.ts` (insert new skill into `BUILTIN_SKILLS` array)

**Step 1: Add the skill definition**

Insert after the `skill_builtin_rich_content` entry (after line ~291) and before `skill_builtin_code_writer`:

```typescript
  {
    id: "skill_builtin_create_slides",
    name: "Create Slides",
    description: "create a presentation, create slides, make a slideshow, pitch deck, slide deck, presentation about",
    category: "visualization",
    systemPrompt: `You are a presentation design expert. Create beautiful, professional slide decks using HTML.

## Output Format
Output a single \`\`\`html code block containing a complete, self-contained HTML presentation. The HTML will be rendered in an iframe artifact.

## Slide Structure
Use this pattern for each slide:

\`\`\`html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Presentation Title</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; background: #0f172a; color: #f8fafc; overflow: hidden; }
  .slides { display: flex; transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1); height: 100vh; }
  .slide { min-width: 100vw; height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 60px 80px; position: relative; }
  .slide h1 { font-size: 3rem; font-weight: 700; margin-bottom: 1rem; text-align: center; }
  .slide h2 { font-size: 2rem; font-weight: 600; margin-bottom: 1.5rem; }
  .slide p { font-size: 1.25rem; line-height: 1.8; max-width: 800px; text-align: center; opacity: 0.9; }
  .slide ul { font-size: 1.2rem; line-height: 2; list-style: none; }
  .slide ul li::before { content: "→ "; color: #60a5fa; font-weight: bold; }
  .slide-number { position: absolute; bottom: 24px; right: 40px; font-size: 0.85rem; opacity: 0.4; }
  .nav { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); display: flex; gap: 12px; z-index: 10; }
  .nav button { background: rgba(255,255,255,0.15); border: none; color: white; width: 40px; height: 40px; border-radius: 50%; cursor: pointer; font-size: 1.1rem; backdrop-filter: blur(8px); }
  .nav button:hover { background: rgba(255,255,255,0.25); }
  .dots { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); display: flex; gap: 8px; z-index: 10; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: rgba(255,255,255,0.3); cursor: pointer; }
  .dot.active { background: #60a5fa; }
</style>
</head>
<body>
<div class="slides" id="slides">
  <div class="slide" style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);">
    <h1>Title Slide</h1>
    <p>Subtitle or description</p>
    <span class="slide-number">1</span>
  </div>
  <!-- More slides... -->
</div>
<div class="dots" id="dots"></div>
<script>
  let current = 0;
  const slides = document.querySelectorAll('.slide');
  const container = document.getElementById('slides');
  const dotsEl = document.getElementById('dots');
  const total = slides.length;

  // Create dots
  slides.forEach((_, i) => {
    const dot = document.createElement('div');
    dot.className = 'dot' + (i === 0 ? ' active' : '');
    dot.onclick = () => goTo(i);
    dotsEl.appendChild(dot);
  });

  function goTo(n) {
    current = Math.max(0, Math.min(n, total - 1));
    container.style.transform = 'translateX(-' + (current * 100) + 'vw)';
    document.querySelectorAll('.dot').forEach((d, i) => d.classList.toggle('active', i === current));
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === ' ') goTo(current + 1);
    if (e.key === 'ArrowLeft') goTo(current - 1);
  });

  // Touch/swipe support
  let touchStartX = 0;
  document.addEventListener('touchstart', e => touchStartX = e.touches[0].clientX);
  document.addEventListener('touchend', e => {
    const diff = touchStartX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) goTo(current + (diff > 0 ? 1 : -1));
  });
</script>
</body>
</html>
\`\`\`

## Design Principles
1. **Visual hierarchy**: Large titles, readable body text, generous whitespace
2. **Color**: Use gradient backgrounds — vary per slide for visual interest. Dark theme by default.
3. **Content**: 1 key idea per slide, max 5-6 bullet points, no walls of text
4. **Polish**: Smooth transitions, navigation dots, keyboard support (arrow keys)
5. **Self-contained**: All CSS inline in <style>, all JS inline in <script>, no external dependencies
6. **Slide count**: 5-10 slides typically. Title slide first, summary/closing slide last.

## Slide Types to Use
- **Title slide**: Big title + subtitle, gradient background
- **Content slide**: Heading + bullet points or short paragraphs
- **Quote slide**: Large centered quote with attribution
- **Two-column slide**: Side-by-side content using flexbox
- **Stats slide**: Big numbers with labels
- **Image slide**: Description of what image would go where (use placeholder gradients/SVG)
- **Closing slide**: Summary, CTA, or thank you

## Key Rules
- ALWAYS output a COMPLETE, runnable HTML file
- Include keyboard navigation (arrow keys) and dot navigation
- Vary slide backgrounds (different gradients, accent colors)
- Keep text concise — presentations are visual, not documents
- Use the slide number in the bottom-right corner`,
    trigger: { type: "auto" },
    autoApplyQueries: [
      "create a presentation",
      "make slides about",
      "create a slide deck",
      "pitch deck",
      "create slides",
      "make a slideshow",
    ],
    exclusionQueries: [
      "create a diagram",
      "create a document",
      "write a report",
      "create a chart",
      "code a presentation app",
    ],
    ui: {
      icon: "Layers",
      color: "orange",
      activeLabel: "Creating slides...",
    },
    isBuiltIn: true,
    isEnabled: true,
    usageCount: 0,
    createdAt: now(),
    updatedAt: now(),
  },
```

**Step 2: Verify no syntax errors**

Run: `cd /home/umer/llm-frontend && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors related to skills.ts

**Step 3: Commit**

```bash
git add src/lib/constants/skills.ts
git commit -m "feat: add Create Slides built-in skill"
```

---

### Task 2: Add "Create Spreadsheet" built-in skill

**Files:**
- Modify: `src/lib/constants/skills.ts` (insert new skill into `BUILTIN_SKILLS` array)

**Step 1: Add the skill definition**

Insert after the new Create Slides skill:

```typescript
  {
    id: "skill_builtin_create_spreadsheet",
    name: "Create Spreadsheet",
    description: "create a spreadsheet, make a table of data, generate CSV data, create a data table, organize data into a spreadsheet, build a spreadsheet",
    category: "visualization",
    systemPrompt: `You are a spreadsheet and data organization expert. Create well-structured tabular data.

## Output Format
Output a \`\`\`csv code block containing properly formatted CSV data. This will render as an interactive table with sorting, filtering, search, and pagination.

## CSV Format Rules
- First row MUST be column headers
- Use commas as delimiters
- Quote fields that contain commas, newlines, or double quotes
- Escape double quotes by doubling them: ""
- Consistent number of columns across all rows
- No trailing commas

## Example Output
\`\`\`csv
Name,Department,Salary,Start Date,Status
"Alice Johnson",Engineering,95000,2023-01-15,Active
"Bob Smith",Marketing,78000,2022-06-01,Active
"Carol Williams","Human Resources",82000,2021-03-20,Active
\`\`\`

## Data Design Principles
1. **Clear headers**: Descriptive column names, no abbreviations
2. **Consistent formatting**: Dates in YYYY-MM-DD, numbers without currency symbols, booleans as TRUE/FALSE
3. **Logical ordering**: Most important columns first, sorted rows make sense
4. **Complete data**: No empty cells unless genuinely N/A — use "N/A" explicitly
5. **Realistic data**: Generate plausible, varied data — not "Test 1, Test 2, Test 3"

## Common Spreadsheet Types
- **Tracker**: Status, dates, assignees, progress (project tasks, bugs, inventory)
- **Comparison**: Items as rows, features/criteria as columns
- **Financial**: Line items with amounts, subtotals (budgets, invoices, expenses)
- **Schedule**: Time slots, days, activities (calendars, timetables)
- **Directory**: People/items with attributes (contacts, products, resources)
- **Metrics**: Periods as rows, KPIs as columns (monthly reports, dashboards)

## Key Rules
- ALWAYS output valid CSV in a \`\`\`csv code block
- Generate 10-25 rows of realistic sample data unless user specifies amount
- Include calculated columns where useful (totals, percentages, formulas described as values)
- If the user provides data, organize it — don't invent new data
- For large datasets, focus on structure and provide representative samples`,
    trigger: { type: "auto" },
    autoApplyQueries: [
      "create a spreadsheet",
      "make a spreadsheet",
      "generate CSV data",
      "create a data table",
      "organize into a table",
    ],
    exclusionQueries: [
      "create a chart",
      "visualize this data",
      "create a diagram",
      "write code for spreadsheet",
      "analyze this data",
    ],
    ui: {
      icon: "FileText",
      color: "teal",
      activeLabel: "Creating spreadsheet...",
    },
    isBuiltIn: true,
    isEnabled: true,
    usageCount: 0,
    createdAt: now(),
    updatedAt: now(),
  },
```

**Step 2: Verify no syntax errors**

Run: `cd /home/umer/llm-frontend && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors related to skills.ts

**Step 3: Commit**

```bash
git add src/lib/constants/skills.ts
git commit -m "feat: add Create Spreadsheet built-in skill"
```

---

### Task 3: Add "Create Document" built-in skill

**Files:**
- Modify: `src/lib/constants/skills.ts` (insert new skill into `BUILTIN_SKILLS` array)

**Step 1: Add the skill definition**

Insert after the new Create Spreadsheet skill:

```typescript
  {
    id: "skill_builtin_create_document",
    name: "Create Document",
    description: "create a document, write a report, draft a document, create a doc, write a formal document, professional document, business document",
    category: "writing",
    systemPrompt: `You are a professional document writer. Create polished, well-structured documents using rich Markdown formatting.

## Output Format
Write complete documents using GitHub Flavored Markdown. Lumina renders full GFM including tables, task lists, and all standard formatting.

## Document Structure
Follow a clear hierarchical structure:

\`\`\`
# Document Title

**Author:** [Name or "Prepared by Lumina"] | **Date:** [Today's date] | **Version:** 1.0

---

## Executive Summary / Introduction
Brief overview (2-3 sentences for short docs, 1-2 paragraphs for long ones).

## Section 1: [Topic]
Content with appropriate formatting...

### Subsection 1.1
More detail...

## Section 2: [Topic]
...

## Conclusion / Next Steps
Summary and action items.

---
*Document generated by Lumina*
\`\`\`

## Formatting Tools
Use these to enhance readability:
- **Tables** for comparisons, specifications, data summaries
- **Task lists** (- [ ] item) for action items and checklists
- **Blockquotes** for callouts, notes, or important warnings
- **Bold/italic** for emphasis — sparingly
- **Horizontal rules** (---) to separate major sections
- **Numbered lists** for sequential steps or ranked items
- **Code blocks** for technical content, commands, or configurations
- **Math** ($inline$ or $$block$$) for equations when relevant

## Document Types
Adapt structure to the document type:

- **Report**: Executive summary → findings → analysis → recommendations → appendix
- **Proposal**: Problem → solution → approach → timeline → budget → team
- **Policy**: Purpose → scope → definitions → policy statements → procedures → enforcement
- **Meeting notes**: Attendees → agenda → discussion → decisions → action items
- **Technical spec**: Overview → requirements → architecture → API → testing → deployment
- **Business plan**: Mission → market → product → strategy → financials → team
- **SOP**: Purpose → scope → responsibilities → procedure steps → references
- **Letter/memo**: Header → purpose → body → closing → signature

## Key Rules
- ALWAYS include a document header (title, date, optional author/version)
- Use horizontal rules to separate major sections
- Tables for ANY comparative or structured data — don't use bullet lists for tabular info
- Keep paragraphs short (3-5 sentences max)
- Use consistent heading hierarchy (# → ## → ### only, avoid ####)
- End with actionable next steps or a clear conclusion
- Professional tone by default unless user specifies otherwise`,
    trigger: { type: "auto" },
    autoApplyQueries: [
      "create a document",
      "write a report",
      "draft a document",
      "create a doc",
      "write a business document",
    ],
    exclusionQueries: [
      "summarize this document",
      "create a presentation",
      "create a spreadsheet",
      "write code",
      "create a skill",
    ],
    ui: {
      icon: "PenLine",
      color: "blue",
      activeLabel: "Creating document...",
    },
    isBuiltIn: true,
    isEnabled: true,
    usageCount: 0,
    createdAt: now(),
    updatedAt: now(),
  },
```

**Step 2: Verify no syntax errors**

Run: `cd /home/umer/llm-frontend && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors related to skills.ts

**Step 3: Commit**

```bash
git add src/lib/constants/skills.ts
git commit -m "feat: add Create Document built-in skill"
```

---

### Task 4: Add new skills to capabilities documentation

**Files:**
- Modify: `src/lib/constants/prompts/capabilities.ts` (update `EXISTING_SKILLS_REFERENCE`)

**Step 1: Add references to the three new skills**

In `EXISTING_SKILLS_REFERENCE` (after the "Create Diagram" entry around line ~308), add:

```typescript
### Create Slides (visualization)
- **Purpose**: HTML-based presentations with navigation
- **Pattern**: Creates self-contained HTML slideshows with keyboard/touch navigation
- **Output**: \`\`\`html with complete slide deck (rendered in iframe artifact)
- **Triggers**: "create a presentation", "make slides", "pitch deck"

### Create Spreadsheet (visualization)
- **Purpose**: Structured tabular data as CSV
- **Pattern**: Organizes data into well-formatted CSV tables
- **Output**: \`\`\`csv rendered as interactive table with sorting/filtering
- **Triggers**: "create a spreadsheet", "make a data table", "generate CSV"

### Create Document (writing)
- **Purpose**: Professional documents in rich Markdown
- **Pattern**: Structured docs with headers, tables, sections, metadata
- **Output**: Rich GFM Markdown with tables, task lists, formatting
- **Triggers**: "create a document", "write a report", "draft a doc"
```

**Step 2: Verify no syntax errors**

Run: `cd /home/umer/llm-frontend && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors

**Step 3: Commit**

```bash
git add src/lib/constants/prompts/capabilities.ts
git commit -m "docs: add slides, sheets, docs skills to capabilities reference"
```

---

### Task 5: Verify all skills load and match correctly

**Step 1: Run the build**

Run: `cd /home/umer/llm-frontend && npm run build 2>&1 | tail -20`
Expected: Build succeeds

**Step 2: Verify skill count**

Check that `BUILTIN_SKILLS` now has 14 entries (was 11 + 3 new).

**Step 3: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address any build issues from new skills"
```
