---
name: Sidebar polish + DnD
overview: Fix sidebar overflow/clipping, make drag/drop reliable during scrolling, and ensure action labels are accessible via proper tooltips while keeping the UI compact.
todos:
  - id: scroll-single-owner
    content: "Remove nested ScrollArea usage: make ChatList own scrolling; add min-h-0/overflow-x-hidden where needed."
    status: completed
  - id: resizable-full-height
    content: Ensure ResizablePanelGroup fills available height and doesn’t cause sidebar overflow (add h-full, verify panel wrappers).
    status: completed
    dependencies:
      - scroll-single-owner
  - id: text-overflow-polish
    content: Add truncation/max-width for drag overlay + dropdown items; verify min-w-0 on flex rows; prevent horizontal bleed.
    status: completed
    dependencies:
      - scroll-single-owner
  - id: dnd-start-reliability
    content: Make drag handle discoverable; adjust PointerSensor activation; add touch-none/select-none to reduce misfires.
    status: completed
    dependencies:
      - scroll-single-owner
  - id: dnd-scroll-stability
    content: Tune DndContext autoScroll + measuring while dragging; restrict to vertical axis; keep NoFolder drop zone mounted and visible during drag.
    status: completed
    dependencies:
      - dnd-start-reliability
  - id: actions-tooltips
    content: Replace title-based labels with Radix tooltips for action buttons; avoid collisions with row-level summary tooltip trigger.
    status: completed
    dependencies:
      - text-overflow-polish
  - id: manual-qa
    content: Run through sidebar resize + long-text + drag-while-scroll checks on desktop and mobile sheet.
    status: completed
    dependencies:
      - dnd-scroll-stability
      - actions-tooltips
      - resizable-full-height
---

# Sidebar polish, overflow fixes, and reliable drag/drop

## Goals

- **No overflow/clipping**: sidebar content should never bleed outside its panel; long titles/previews should truncate gracefully.
- **Stable drag/drop**: drag should start reliably from the handle and stay usable while scrolling (auto-scroll near edges, correct drop targets).
- **Accessible actions**: keep icon-only actions, but show consistent tooltips (not clipped/hidden).

## What’s likely causing the issues (based on current code)

- **Nested scroll containers**: `Sidebar` wraps `ChatList` in a `ScrollArea`, but `ChatList` also contains its own `ScrollArea`. This often causes double scrollbars, broken sticky behavior, and DnD “scroll while dragging” weirdness.
- Files: [`/home/umer/Documents/Github/llm-frontend/src/components/sidebar/sidebar.tsx`](/home/umer/Documents/Github/llm-frontend/src/components/sidebar/sidebar.tsx), [`/home/umer/Documents/Github/llm-frontend/src/components/sidebar/chat-list.tsx`](/home/umer/Documents/Github/llm-frontend/src/components/sidebar/chat-list.tsx)
- **Missing `min-h-0` on flex children**: Radix `ScrollArea` uses a viewport with `h-full`; without `min-h-0` on the flex item, content can overflow instead of scrolling.
- **Drag handle discoverability + activation threshold**: the handle is effectively hidden (`opacity-0`) unless you hover precisely; and the pointer sensor uses `distance: 8`, which can feel like “drag doesn’t start” on trackpads.
- **Tooltip/text issues for actions**: chat summary tooltip wraps the whole row, while action buttons rely on `title` strings; tooltips can feel inconsistent and can visually conflict.

## Plan of attack (targeted, minimal surface area)

### 1) Normalize layout + scrolling (eliminate nested scroll)

- **Make `ChatList` the sole owner of vertical scrolling**.
- In [`src/components/sidebar/sidebar.tsx`](/home/umer/Documents/Github/llm-frontend/src/components/sidebar/sidebar.tsx), replace the outer `<ScrollArea className="flex-1">` wrapper with a plain container (`div`) using `flex-1 min-h-0 overflow-hidden`.
- In [`src/components/sidebar/chat-list.tsx`](/home/umer/Documents/Github/llm-frontend/src/components/sidebar/chat-list.tsx), keep a single `ScrollArea` for the list portion and ensure it has `className="flex-1 min-h-0"`.
- Add **`overflow-x-hidden`** at the right container level to prevent horizontal bleed (especially at narrow sidebar widths).
- Ensure the resizable shell fills height:
- Add `className="h-full"` to the `ResizablePanelGroup` in [`src/app/page.tsx`](/home/umer/Documents/Github/llm-frontend/src/app/page.tsx) (mirrors how `ChatShell` already does it).

### 2) Fix text overflow + “polish” details

- Add/verify `min-w-0` on any flex rows that contain truncating text.
- Clamp/truncate places that currently render unbounded strings:
- Drag overlay chat/folder labels should have a max width + `truncate`.
- Folder/chat names inside dropdowns should truncate within a max width.
- Add a tiny spacing polish pass (consistent paddings, align icon hit-targets to at least 28–32px in dense rows).

### 3) Make drag/drop reliable (especially while scrolling)

- **Improve drag start**:
- Make the drag handle visible at low opacity by default (e.g. `opacity-30`), stronger on hover.
- Reduce `PointerSensor` activation distance (e.g. from `8` → `3–5`) to better match trackpad feel.
- Add `touch-none select-none` to the handle and `select-none` to draggable rows to prevent text selection interfering with drag.
- **Improve scroll while dragging**:
- Enable/tune `DndContext` `autoScroll` options so dragging near the top/bottom scrolls the list smoothly.
- Set `measuring` strategy for droppables while dragging so rects stay accurate when the user scrolls.
- Add a vertical-axis restriction modifier (prevents diagonal drift that can cause jitter).
- **De-flake drop targets**:
- Make the “No folder” drop zone always mounted (not only when `isOver`) so it can actually be discovered and hovered; visually show it only during drag / when hovered.
- Consider a collision strategy that prefers folder drop targets when dragging a chat (reduces accidental reorders when you intended “move to folder”).

### 4) Make action tooltips consistent (icon-only UI)

- Replace `title=` usage on action buttons with the app’s Radix tooltip components so labels are consistent and keyboard accessible.
- Avoid tooltip collisions:
- Move the “chat summary” tooltip trigger to just the text block (title/preview), not the entire row, so action-button tooltips work predictably.

### 5) QA checklist (manual)

- Resize sidebar to minimum + maximum; verify no horizontal scrollbars and no text bleed.
- Long chat titles, long folder names, long previews: verify truncation and tooltips.
- Drag starts reliably from handle (trackpad): reorder chats within a folder, reorder folders, move chat onto a folder.
- While dragging, move pointer near top/bottom: list auto-scrolls and drop target remains correct.
- Mobile sheet sidebar (`src/components/mobile-nav.tsx`) still behaves (no overflow).

## Files expected to change

- [`/home/umer/Documents/Github/llm-frontend/src/app/page.tsx`](/home/umer/Documents/Github/llm-frontend/src/app/page.tsx)
- [`/home/umer/Documents/Github/llm-frontend/src/components/sidebar/sidebar.tsx`](/home/umer/Documents/Github/llm-frontend/src/components/sidebar/sidebar.tsx)
- [`/home/umer/Documents/Github/llm-frontend/src/components/sidebar/chat-list.tsx`](/home/umer/Documents/Github/llm-frontend/src/components/sidebar/chat-list.tsx)
- (Optional) [`/home/umer/Documents/Github/llm-frontend/src/components/mobile-nav.tsx`](/home/umer/Documents/Github/llm-frontend/src/components/mobile-nav.tsx) if any width/overflow tweaks are needed for the sheet.

## Implementation todos