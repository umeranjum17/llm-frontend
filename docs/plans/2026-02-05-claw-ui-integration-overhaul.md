# Claw UI Integration Overhaul

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the scattered, noisy Claw integration into a cohesive, non-intrusive experience with a single primary surface per device.

**Architecture:** Consolidate three redundant surfaces (sidebar widget, floating notifications, chat enrichment) into one primary entry point per breakpoint. Add notification deduplication. Redesign mobile as a bottom-sheet pattern.

**Tech Stack:** React, Zustand, TypeScript, Tailwind CSS, Framer Motion

---

## Problem Analysis

### Current Issues (Combined Findings)

| Problem | Source | Impact |
|---------|--------|--------|
| **Triple surface** | Sidebar widget + floating bubble + chat enrichment all render | User sees Claw UI "everywhere", overwhelming |
| **Key sync spam** | `syncKeys()` called on connect, SSE reconnect, chat start - each emits notification | Repeated "Keys Synced" messages |
| **Task created double-fire** | Toast in popover + notification from SSE event | Same event shown twice |
| **Activity = Notifications** | Sidebar shows activity feed, floating shows same as notifications | Redundant data in two formats |
| **Mobile overlap** | Floating panel at `bottom-5 right-5 z-50` covers chat input | Blocks interaction |
| **No safe-area** | Missing `env(safe-area-inset-bottom)` | iOS home indicator collision |
| **Desktop popup overload** | Widget popup has stats + task input + initiatives + activity | Too much in one popup |

### Root Cause

The integration was built incrementally without a unified design. Each surface was added independently, all consuming the same stores, creating redundancy.

---

## Solution Architecture

```
DESKTOP (sidebar visible)
├── Sidebar: ClawSidebarWidget (PRIMARY)
│   ├── Trigger: status dot + attention badge
│   └── Popover: quick actions only (no activity feed)
├── Floating: HIDDEN (sidebar handles it)
└── Chat: minimal status dot only

MOBILE (sidebar hidden)
├── Sidebar: accessible via hamburger menu
├── Floating: ClawBottomSheet (PRIMARY)
│   └── Bottom-sheet style, safe-area aware
└── Chat: HIDDEN
```

---

## Task 1: Add Notification Deduplication & Throttling

**Files:**
- Modify: `src/stores/claw-notification-store.ts`
- Create: `src/stores/__tests__/claw-notification-store.test.ts`

**Step 1: Write the failing test**

```typescript
// src/stores/__tests__/claw-notification-store.test.ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useClawNotificationStore } from '../claw-notification-store'

describe('claw-notification-store deduplication', () => {
  beforeEach(() => {
    useClawNotificationStore.getState().clearAll()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('deduplicates keys:synced within 60s window', () => {
    const { addNotification } = useClawNotificationStore.getState()

    addNotification({ type: 'keys:synced', title: 'Keys Synced', message: '3 keys' })
    addNotification({ type: 'keys:synced', title: 'Keys Synced', message: '3 keys' })
    addNotification({ type: 'keys:synced', title: 'Keys Synced', message: '3 keys' })

    expect(useClawNotificationStore.getState().notifications).toHaveLength(1)
  })

  it('allows keys:synced after window expires', () => {
    const { addNotification } = useClawNotificationStore.getState()

    addNotification({ type: 'keys:synced', title: 'Keys Synced', message: '3 keys' })
    vi.advanceTimersByTime(61_000)
    addNotification({ type: 'keys:synced', title: 'Keys Synced', message: '3 keys' })

    expect(useClawNotificationStore.getState().notifications).toHaveLength(2)
  })

  it('batches rapid task notifications', () => {
    const { addNotification } = useClawNotificationStore.getState()

    for (let i = 0; i < 5; i++) {
      addNotification({ type: 'activity:new', title: 'Task Created', message: `Task ${i}` })
    }

    vi.advanceTimersByTime(2500) // Flush batch

    const notifs = useClawNotificationStore.getState().notifications
    expect(notifs).toHaveLength(1)
    expect(notifs[0].count).toBe(5)
  })
})
```

**Step 2: Run test to verify it fails**

```bash
cd /home/umer/Github/llm-frontend && npm test -- src/stores/__tests__/claw-notification-store.test.ts
```

**Step 3: Implement deduplication**

```typescript
// src/stores/claw-notification-store.ts
import { create } from 'zustand'

const MAX_NOTIFICATIONS = 50
const DEDUPE_WINDOW_MS = 60_000
const BATCH_WINDOW_MS = 2_000

export type ClawNotificationType =
  | 'task:completed' | 'task:failed' | 'activity:new'
  | 'schedule:triggered' | 'keys:synced'
  | 'initiative:proposed' | 'initiative:approved'
  | 'initiative:rejected' | 'initiative:deferred'
  | 'monitor:alert'

export interface ClawNotification {
  id: string
  type: ClawNotificationType
  title: string
  message: string
  timestamp: number
  read: boolean
  count?: number
}

// Types to deduplicate (low-value repeated events)
const DEDUPE_TYPES = new Set(['keys:synced', 'schedule:triggered'])

// Types to batch when rapid-fire
const BATCH_TYPES = new Set(['activity:new'])

interface ClawNotificationState {
  notifications: ClawNotification[]
  lastEmitByType: Record<string, number>
  pendingBatch: Map<string, { title: string; messages: string[] }>
  batchTimeouts: Map<string, ReturnType<typeof setTimeout>>

  addNotification: (n: Omit<ClawNotification, 'id' | 'timestamp' | 'read'>) => void
  markAsRead: (id: string) => void
  markAllAsRead: () => void
  clearAll: () => void
}

export const useClawNotificationStore = create<ClawNotificationState>((set, get) => ({
  notifications: [],
  lastEmitByType: {},
  pendingBatch: new Map(),
  batchTimeouts: new Map(),

  addNotification: (n) => {
    const now = Date.now()
    const state = get()

    // Dedupe check for certain types
    if (DEDUPE_TYPES.has(n.type)) {
      const lastEmit = state.lastEmitByType[n.type] || 0
      if (now - lastEmit < DEDUPE_WINDOW_MS) return
    }

    // Batch check for rapid events
    if (BATCH_TYPES.has(n.type)) {
      const pending = state.pendingBatch.get(n.type)
      if (pending) {
        pending.messages.push(n.message)
        return
      }

      // Start new batch
      state.pendingBatch.set(n.type, { title: n.title, messages: [n.message] })

      const timeout = setTimeout(() => {
        const currentState = get()
        const batch = currentState.pendingBatch.get(n.type)
        if (!batch) return

        const count = batch.messages.length
        const notification: ClawNotification = {
          id: crypto.randomUUID(),
          type: n.type,
          title: count > 1 ? `${count} new activities` : batch.title,
          message: count > 1
            ? batch.messages.slice(0, 3).join(', ') + (count > 3 ? '...' : '')
            : batch.messages[0],
          timestamp: Date.now(),
          read: false,
          count: count > 1 ? count : undefined,
        }

        set((s) => {
          const newPending = new Map(s.pendingBatch)
          newPending.delete(n.type)
          const newTimeouts = new Map(s.batchTimeouts)
          newTimeouts.delete(n.type)

          return {
            notifications: [notification, ...s.notifications].slice(0, MAX_NOTIFICATIONS),
            lastEmitByType: { ...s.lastEmitByType, [n.type]: Date.now() },
            pendingBatch: newPending,
            batchTimeouts: newTimeouts,
          }
        })
      }, BATCH_WINDOW_MS)

      state.batchTimeouts.set(n.type, timeout)
      return
    }

    // Normal notification
    const notification: ClawNotification = {
      ...n,
      id: crypto.randomUUID(),
      timestamp: now,
      read: false,
    }

    set((s) => ({
      notifications: [notification, ...s.notifications].slice(0, MAX_NOTIFICATIONS),
      lastEmitByType: { ...s.lastEmitByType, [n.type]: now },
    }))
  },

  markAsRead: (id) => set((s) => ({
    notifications: s.notifications.map((n) => n.id === id ? { ...n, read: true } : n),
  })),

  markAllAsRead: () => set((s) => ({
    notifications: s.notifications.map((n) => ({ ...n, read: true })),
  })),

  clearAll: () => {
    const state = get()
    state.batchTimeouts.forEach((t) => clearTimeout(t))
    set({ notifications: [], pendingBatch: new Map(), batchTimeouts: new Map() })
  },
}))

export const useUnreadCount = () =>
  useClawNotificationStore((s) => s.notifications.filter((n) => !n.read).length)

export const useAttentionCount = () =>
  useClawNotificationStore((s) =>
    s.notifications.filter((n) => !n.read && n.type === 'initiative:proposed').length
  )
```

**Step 4: Run test to verify it passes**

```bash
cd /home/umer/Github/llm-frontend && npm test -- src/stores/__tests__/claw-notification-store.test.ts
```

**Step 5: Commit**

```bash
git add src/stores/claw-notification-store.ts src/stores/__tests__/claw-notification-store.test.ts
git commit -m "feat(claw): add notification deduplication and batching

- Dedupe keys:synced within 60s window
- Batch rapid activity:new events within 2s
- Prevents notification spam on reconnect and bulk operations"
```

---

## Task 2: Remove Duplicate Notification Sources

**Files:**
- Modify: `src/hooks/use-claw-events.ts`
- Modify: `src/components/sidebar/claw-sidebar-widget/claw-popover-content.tsx`

**Step 1: Read current implementations**

```bash
# Review what triggers notifications
grep -n "addNotification\|toast\." src/hooks/use-claw-events.ts src/components/sidebar/claw-sidebar-widget/claw-popover-content.tsx
```

**Step 2: Remove redundant notification triggers in use-claw-events.ts**

```typescript
// src/hooks/use-claw-events.ts

// REMOVE these notification triggers (keep only high-value ones):
// - task:created -> activity:new notification (already in activity feed)
// - activity:new -> notification (redundant with activity feed)

// KEEP only:
// - task:completed / task:failed (meaningful state changes)
// - initiative:proposed (needs user attention)
// - monitor:alert (critical)

// Example: In the task:created handler, REMOVE:
// addNotification({ type: 'activity:new', title: 'New Task Created', message: title })

// Keep refreshTasks() call but no notification
```

**Step 3: Remove toast from popover-content.tsx**

```typescript
// src/components/sidebar/claw-sidebar-widget/claw-popover-content.tsx

// REMOVE: toast.success("Task created")
// The task appearing in the list IS the feedback

// Change from:
const handleCreateTask = async () => {
  await createTask(instruction)
  toast.success("Task created")  // REMOVE THIS
  setInstruction("")
}

// To:
const handleCreateTask = async () => {
  await createTask(instruction)
  setInstruction("")
}
```

**Step 4: Test manually**

```bash
cd /home/umer/Github/llm-frontend && npm run dev
# Create a task - should see ONE feedback (task appears in list), not toast + notification
```

**Step 5: Commit**

```bash
git add src/hooks/use-claw-events.ts src/components/sidebar/claw-sidebar-widget/claw-popover-content.tsx
git commit -m "fix(claw): remove duplicate notification sources

- Remove toast.success from task creation (list update is feedback)
- Remove activity:new notifications (shown in activity feed)
- Keep only high-value notifications: completion, failure, alerts"
```

---

## Task 3: Consolidate to Single Surface Per Breakpoint

**Files:**
- Modify: `src/components/claw-floating-notifications.tsx`
- Modify: `src/components/chat/claw-agent-enrichment.tsx`
- Modify: `src/app/layout.tsx`

**Step 1: Create a responsive visibility hook**

```typescript
// src/hooks/use-claw-surface.ts
import { useMediaQuery } from '@/hooks/use-media-query'
import { useSidebarStore } from '@/stores/sidebar-store'

export function useClawSurface() {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const sidebarOpen = useSidebarStore((s) => s.isOpen)

  return {
    // Desktop with sidebar open: sidebar widget is primary
    showSidebarWidget: !isMobile,
    // Mobile OR desktop with sidebar closed: floating is primary
    showFloating: isMobile || !sidebarOpen,
    // Chat enrichment: only on desktop as minimal indicator
    showChatEnrichment: !isMobile,
  }
}
```

**Step 2: Update claw-floating-notifications.tsx**

```tsx
// src/components/claw-floating-notifications.tsx
'use client'

import { useClawSurface } from '@/hooks/use-claw-surface'
// ... other imports

export function ClawFloatingNotifications() {
  const { showFloating } = useClawSurface()

  // Don't render if sidebar widget is handling it
  if (!showFloating) return null

  // ... rest of component with mobile bottom-sheet improvements
}
```

**Step 3: Simplify chat enrichment to minimal indicator**

```tsx
// src/components/chat/claw-agent-enrichment.tsx
'use client'

import { useClawStore } from '@/stores/claw-store'
import { useClawSurface } from '@/hooks/use-claw-surface'
import { cn } from '@/lib/utils'

export function ClawAgentEnrichment() {
  const { showChatEnrichment } = useClawSurface()
  const isConnected = useClawStore((s) => s.isConnected)

  if (!showChatEnrichment) return null

  // Minimal: just a status dot, clicking opens sidebar
  return (
    <button
      className="group flex items-center gap-1.5 rounded-full px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
      onClick={() => {/* open sidebar or popover */}}
      title={isConnected ? 'Claw connected' : 'Claw disconnected'}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          isConnected ? 'bg-emerald-500' : 'bg-zinc-600'
        )}
      />
      <span className="hidden group-hover:inline">Claw</span>
    </button>
  )
}
```

**Step 4: Commit**

```bash
git add src/hooks/use-claw-surface.ts src/components/claw-floating-notifications.tsx src/components/chat/claw-agent-enrichment.tsx
git commit -m "feat(claw): consolidate to single surface per breakpoint

- Desktop with sidebar: sidebar widget is primary, hide floating
- Mobile: floating bottom-sheet is primary
- Chat enrichment: minimal status dot only"
```

---

## Task 4: Redesign Mobile as Bottom-Sheet

**Files:**
- Modify: `src/components/claw-floating-notifications.tsx`

**Step 1: Implement bottom-sheet pattern for mobile**

```tsx
// src/components/claw-floating-notifications.tsx
'use client'

import { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Bell, X, ChevronUp } from 'lucide-react'
import { useClawNotificationStore, useUnreadCount } from '@/stores/claw-notification-store'
import { useClawStore } from '@/stores/claw-store'
import { useClawSurface } from '@/hooks/use-claw-surface'
import { useMediaQuery } from '@/hooks/use-media-query'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'

export function ClawFloatingNotifications() {
  const { showFloating } = useClawSurface()
  const isMobile = useMediaQuery('(max-width: 640px)')
  const isConnected = useClawStore((s) => s.isConnected)
  const notifications = useClawNotificationStore((s) => s.notifications)
  const unreadCount = useUnreadCount()
  const markAllAsRead = useClawNotificationStore((s) => s.markAllAsRead)
  const clearAll = useClawNotificationStore((s) => s.clearAll)

  const [isExpanded, setIsExpanded] = useState(false)

  if (!showFloating) return null

  // Hide completely if no unread and not expanded
  if (unreadCount === 0 && !isExpanded) return null

  return (
    <>
      {/* Backdrop for mobile bottom-sheet */}
      <AnimatePresence>
        {isExpanded && isMobile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/50"
            onClick={() => setIsExpanded(false)}
          />
        )}
      </AnimatePresence>

      {/* Main container */}
      <div
        className={cn(
          'fixed z-50',
          isMobile
            ? 'inset-x-0 bottom-0 pb-[env(safe-area-inset-bottom)]'
            : 'bottom-4 right-4'
        )}
      >
        <AnimatePresence mode="wait">
          {isExpanded ? (
            <motion.div
              key="expanded"
              initial={isMobile ? { y: '100%' } : { opacity: 0, scale: 0.95 }}
              animate={isMobile ? { y: 0 } : { opacity: 1, scale: 1 }}
              exit={isMobile ? { y: '100%' } : { opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className={cn(
                'bg-zinc-900 border-zinc-800 shadow-xl',
                isMobile
                  ? 'w-full rounded-t-xl border-t'
                  : 'w-80 rounded-lg border'
              )}
            >
              {/* Drag handle (mobile) */}
              {isMobile && (
                <div className="flex justify-center py-2">
                  <div className="h-1 w-8 rounded-full bg-zinc-700" />
                </div>
              )}

              {/* Header */}
              <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'h-2 w-2 rounded-full',
                      isConnected ? 'bg-emerald-500' : 'bg-zinc-600'
                    )}
                  />
                  <span className="text-sm font-medium text-zinc-200">Claw</span>
                  {unreadCount > 0 && (
                    <span className="rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                      {unreadCount} new
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {unreadCount > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={markAllAsRead}
                    >
                      Mark read
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0"
                    onClick={() => setIsExpanded(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Content */}
              <ScrollArea className={cn(isMobile ? 'max-h-[50vh]' : 'max-h-64')}>
                {notifications.length === 0 ? (
                  <div className="p-6 text-center text-sm text-zinc-500">
                    No notifications
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-800/50">
                    {notifications.slice(0, 15).map((n) => (
                      <NotificationItem key={n.id} notification={n} />
                    ))}
                  </div>
                )}
              </ScrollArea>

              {/* Footer */}
              {notifications.length > 0 && (
                <div className="border-t border-zinc-800 p-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-full text-xs text-zinc-500"
                    onClick={() => { clearAll(); setIsExpanded(false) }}
                  >
                    Clear all
                  </Button>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.button
              key="collapsed"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={() => setIsExpanded(true)}
              className={cn(
                'flex items-center justify-center rounded-full shadow-lg',
                'bg-zinc-800/95 backdrop-blur-sm',
                'transition-transform hover:scale-105 active:scale-95',
                isMobile
                  ? 'mx-auto mb-4 h-12 w-12'
                  : 'h-10 w-10'
              )}
            >
              <Bell className={cn(isMobile ? 'h-5 w-5' : 'h-4 w-4')} />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </>
  )
}

function NotificationItem({ notification }: { notification: ClawNotification }) {
  const markAsRead = useClawNotificationStore((s) => s.markAsRead)

  return (
    <button
      className={cn(
        'w-full px-4 py-3 text-left text-sm transition-colors hover:bg-zinc-800/50',
        !notification.read && 'bg-zinc-800/30'
      )}
      onClick={() => markAsRead(notification.id)}
    >
      <div className="flex items-start gap-3">
        <NotificationIcon type={notification.type} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-zinc-200">{notification.title}</span>
            {notification.count && notification.count > 1 && (
              <span className="text-xs text-zinc-500">+{notification.count - 1}</span>
            )}
          </div>
          <p className="truncate text-xs text-zinc-500">{notification.message}</p>
        </div>
        <span className="shrink-0 text-[10px] text-zinc-600">
          {formatRelativeTime(notification.timestamp)}
        </span>
      </div>
    </button>
  )
}

function NotificationIcon({ type }: { type: ClawNotificationType }) {
  // ... icon mapping based on type
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  if (diff < 60_000) return 'now'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m`
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h`
  return `${Math.floor(diff / 86400_000)}d`
}
```

**Step 2: Commit**

```bash
git add src/components/claw-floating-notifications.tsx
git commit -m "feat(claw): redesign mobile as bottom-sheet

- Full-width bottom sheet on mobile with drag handle
- Safe-area inset for iOS home indicator
- Backdrop overlay when expanded
- Smaller floating button on desktop
- Auto-hide when no unread notifications"
```

---

## Task 5: Simplify Sidebar Widget Popover

**Files:**
- Modify: `src/components/sidebar/claw-sidebar-widget/claw-popover-content.tsx`
- Modify: `src/components/sidebar/claw-sidebar-widget/claw-trigger.tsx`

**Step 1: Simplify trigger to essential indicators**

```tsx
// src/components/sidebar/claw-sidebar-widget/claw-trigger.tsx
'use client'

import { Cpu } from 'lucide-react'
import { useClawStore } from '@/stores/claw-store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface ClawTriggerProps {
  onClick?: () => void
}

export function ClawTrigger({ onClick }: ClawTriggerProps) {
  const isConnected = useClawStore((s) => s.isConnected)
  const pendingInitiatives = useClawStore((s) =>
    s.initiatives.filter((i) => i.status === 'proposed').length
  )

  return (
    <Button
      variant="ghost"
      size="sm"
      className="relative h-8 w-8 p-0"
      onClick={onClick}
    >
      <Cpu className="h-4 w-4" />

      {/* Connection status - small dot */}
      <span
        className={cn(
          'absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-zinc-900',
          isConnected ? 'bg-emerald-500' : 'bg-zinc-600'
        )}
      />

      {/* Attention badge - only for initiatives needing action */}
      {pendingInitiatives > 0 && (
        <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-black">
          {pendingInitiatives}
        </span>
      )}
    </Button>
  )
}
```

**Step 2: Simplify popover content - remove activity feed**

```tsx
// src/components/sidebar/claw-sidebar-widget/claw-popover-content.tsx

// Remove the activity feed section entirely
// Keep only:
// 1. Quick stats (running tasks, active schedules)
// 2. Quick task input
// 3. Pending initiatives (if any)
// 4. Link to full /claw dashboard

export function ClawPopoverContent() {
  // ... simplified content without activity feed
  return (
    <div className="w-72 p-3">
      {/* Stats row */}
      <div className="mb-3 flex gap-2">
        <StatBadge icon={Clock} label="Running" value={runningTasks} />
        <StatBadge icon={Calendar} label="Schedules" value={activeSchedules} />
      </div>

      {/* Quick task input */}
      <div className="mb-3">
        <Input
          placeholder="Quick task..."
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
        />
      </div>

      {/* Pending initiatives */}
      {pendingInitiatives.length > 0 && (
        <div className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-2">
          <div className="mb-1 text-xs font-medium text-amber-400">
            {pendingInitiatives.length} initiative(s) need review
          </div>
          {/* ... initiative items */}
        </div>
      )}

      {/* Dashboard link */}
      <Button variant="ghost" size="sm" className="w-full" asChild>
        <Link href="/claw">Open Dashboard</Link>
      </Button>
    </div>
  )
}
```

**Step 3: Commit**

```bash
git add src/components/sidebar/claw-sidebar-widget/claw-trigger.tsx src/components/sidebar/claw-sidebar-widget/claw-popover-content.tsx
git commit -m "feat(claw): simplify sidebar widget

- Remove activity feed from popover (use /claw page)
- Cleaner trigger with just status dot + initiative badge
- Quick stats, task input, and dashboard link only
- Reduces visual noise significantly"
```

---

## Task 6: Add Notification Preference Setting

**Files:**
- Modify: `src/components/settings/claw-settings.tsx`
- Modify: `src/stores/claw-notification-store.ts`
- Create: `src/stores/claw-preferences-store.ts`

**Step 1: Create preferences store**

```typescript
// src/stores/claw-preferences-store.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type NotificationLevel = 'all' | 'important' | 'minimal' | 'none'

interface ClawPreferencesState {
  notificationLevel: NotificationLevel
  setNotificationLevel: (level: NotificationLevel) => void
}

export const useClawPreferencesStore = create<ClawPreferencesState>()(
  persist(
    (set) => ({
      notificationLevel: 'important',
      setNotificationLevel: (level) => set({ notificationLevel: level }),
    }),
    { name: 'claw-preferences' }
  )
)
```

**Step 2: Update notification store to respect preference**

```typescript
// In claw-notification-store.ts addNotification():

import { useClawPreferencesStore } from './claw-preferences-store'

const IMPORTANT_TYPES = new Set(['task:completed', 'task:failed', 'initiative:proposed', 'monitor:alert'])
const MINIMAL_TYPES = new Set(['task:failed', 'initiative:proposed', 'monitor:alert'])

addNotification: (n) => {
  const level = useClawPreferencesStore.getState().notificationLevel

  if (level === 'none') return
  if (level === 'minimal' && !MINIMAL_TYPES.has(n.type)) return
  if (level === 'important' && !IMPORTANT_TYPES.has(n.type)) return

  // ... rest of logic
}
```

**Step 3: Add UI in settings**

```tsx
// In claw-settings.tsx, add:

<div className="space-y-2">
  <Label>Notification Level</Label>
  <Select value={notificationLevel} onValueChange={setNotificationLevel}>
    <SelectTrigger>
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="all">All notifications</SelectItem>
      <SelectItem value="important">Important only (recommended)</SelectItem>
      <SelectItem value="minimal">Minimal (errors & attention)</SelectItem>
      <SelectItem value="none">None</SelectItem>
    </SelectContent>
  </Select>
  <p className="text-xs text-zinc-500">
    Control which Claw events show as notifications
  </p>
</div>
```

**Step 4: Commit**

```bash
git add src/stores/claw-preferences-store.ts src/stores/claw-notification-store.ts src/components/settings/claw-settings.tsx
git commit -m "feat(claw): add notification level preference

- all: Show everything
- important: Completions, failures, initiatives, alerts
- minimal: Only failures and attention items
- none: Silent (data still in /claw dashboard)"
```

---

## Summary

| Task | What It Fixes | Key Changes |
|------|---------------|-------------|
| 1 | Key sync spam, rapid event spam | Deduplication + batching in store |
| 2 | Double notifications (toast + widget) | Remove redundant triggers |
| 3 | Triple surface everywhere | Single surface per breakpoint |
| 4 | Mobile overlap, no safe-area | Bottom-sheet with safe-area |
| 5 | Popover overload | Remove activity feed, simplify |
| 6 | No user control | Notification level preference |

**Result:** Clean, cohesive Claw integration that respects user attention and works well on mobile.
