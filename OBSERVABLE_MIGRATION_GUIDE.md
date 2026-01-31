# RxDB Observable Migration Guide

## Overview

Observable-based queries provide **true reactivity** without polling, reducing CPU usage and improving battery life. The polling interval has been reduced from 1s to 5s, but observables eliminate polling entirely.

## When to Use Observables

### ✅ Good Use Cases

- **Simple list queries**: `getAllChats()`, `getAllAgents()`, `getAllTags()`
- **Filtered queries**: `getChats().where('folderId').equals(id)`
- **Sorted queries**: `getChats().orderBy('updatedAt').reverse()`
- **Single collection queries**: Any query on a single collection

### ❌ Keep Using Promises

- **Transaction-based queries**: Multi-collection transactions with Promise.all()
- **Complex business logic**: Queries with post-processing or filtering
- **One-time queries**: Queries that don't need reactivity
- **Mutations**: Updates, deletes, and inserts (always Promise-based)

## Migration Examples

### Example 1: Simple List Query

**Before (Promise-based with 5s polling):**
```typescript
const { data: chats } = useRxQuery(
  () => db.chats.toArray(),
  []
);
```

**After (Observable - no polling):**
```typescript
const { data: chats } = useRxQuery(
  () => db.chats.toArray$(),
  []
);
```

### Example 2: Filtered Query

**Before:**
```typescript
const { data: folderChats } = useRxQuery(
  () => db.chats.where('folderId').equals(folderId).toArray(),
  [folderId]
);
```

**After:**
```typescript
const { data: folderChats } = useRxQuery(
  () => db.chats.where('folderId').equals(folderId).toArray$(),
  [folderId]
);
```

### Example 3: Sorted Query

**Before:**
```typescript
const { data: recentChats } = useRxQuery(
  () => db.chats.orderBy('updatedAt').reverse().toArray(),
  []
);
```

**After:**
```typescript
const { data: recentChats } = useRxQuery(
  () => db.chats.orderBy('updatedAt').reverse().toArray$(),
  []
);
```

## Available Observable Methods

All RxDB helpers now support observable methods (ending with `$`):

- `toArray$()` - Get all items reactively
- `where(field).equals(value).toArray$()` - Filtered query
- `orderBy(field).toArray$()` - Sorted ascending
- `orderBy(field).reverse().toArray$()` - Sorted descending

## How It Works

Observable methods return an object with a `$` property that has a `subscribe` function:

```typescript
const query = db.chats.toArray$();
// query.$ is an RxDB observable

// The useRxQuery hook detects this and subscribes:
const subscription = query.$.subscribe((chats) => {
  // Called immediately and whenever data changes
  setChats(chats);
});

// Auto-unsubscribes on unmount
```

## Performance Impact

- **Promise-based**: Polls every 5 seconds → ~12 queries/minute
- **Observable-based**: 0 polling → only updates on actual changes

For a component with 10 queries open:
- **Before**: 120 queries/minute
- **After**: 0 queries/minute + updates only when data changes

## Migration Priority

### High Priority (Common UI Queries)

1. `src/components/sidebar/chat-list.tsx` - Chat list (if simplified)
2. `src/components/agents/agent-picker-dialog.tsx` - Agent list
3. `src/components/tags/tag-selector.tsx` - Tag list
4. `src/components/projects/project-selector.tsx` - Project list

### Medium Priority

- Settings pages with simple lists
- Dropdown selectors
- Search results (if using direct queries)

### Low Priority (Keep as Promise)

- Transaction-based queries (chat-list.tsx current implementation)
- Complex multi-collection queries
- Queries with business logic

## Notes

- **Transaction queries**: The current chat-list.tsx uses transactions for performance. This is acceptable with 5s polling.
- **Helper compatibility**: Observable methods work alongside Promise methods - no breaking changes.
- **Type safety**: Observable methods have the same return types, just wrapped in a subscription.

## Testing Observable Migrations

1. Replace `.toArray()` with `.toArray$()`
2. Test that UI updates when:
   - Creating new items
   - Updating existing items
   - Deleting items
3. Verify no console errors
4. Check that polling stops (use browser dev tools Network tab)

## Future Improvements

- Add `count$()` for reactive counts
- Add `get$(id)` for reactive single-item queries
- Add composite observable builders for common patterns
