# RxDB Schema Versioning Strategy

## Current Status

All schemas are at **version 1**, which is appropriate for the initial production release. This document outlines the strategy for handling future schema changes.

## Schema Versioning in RxDB

RxDB uses sequential version numbers starting at 0 or 1. Each time you modify a schema, you must:

1. Increment the version number
2. Provide a migration strategy for existing data
3. Test the migration on a copy of production data

## When to Increment Schema Version

### Required Changes (Must Increment)

- Adding a new required field
- Removing a field
- Changing a field type (e.g., string → number)
- Renaming a field
- Changing index configuration
- Modifying validation rules

### Safe Changes (No Increment Needed - Use with Caution)

- Adding optional fields (use defaults for existing docs)
- Changing field descriptions
- Updating comments

**Recommendation**: Even for "safe" changes, increment the version for traceability.

## Migration Strategy

### Basic Migration Pattern

```typescript
// Example: Adding a new required field in version 2

export const chatSchema: RxJsonSchema<any> = {
  version: 2, // Incremented from 1
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    title: { type: 'string' },
    // ... existing fields ...

    // NEW FIELD
    archivedAt: { type: 'number' }, // New field added
  },
  required: ['id', 'title', 'createdAt', 'updatedAt'],
  indexes: ['createdAt', 'updatedAt'],
};

// Migration function
export const chatMigrationStrategies = {
  1: (oldDoc: any) => {
    // Migrate from version 1 to version 2
    return {
      ...oldDoc,
      archivedAt: undefined, // Set default value for new field
    };
  },
};
```

### Complex Migration Example

```typescript
// Example: Restructuring data (version 3)

export const chatMigrationStrategies = {
  1: (oldDoc: any) => {
    return {
      ...oldDoc,
      archivedAt: undefined,
    };
  },
  2: (oldDoc: any) => {
    // Migrate from version 2 to version 3
    // Example: Split tags string into array
    return {
      ...oldDoc,
      tags: oldDoc.tags ? oldDoc.tags.split(',') : [],
    };
  },
};
```

## Migration Implementation

### Step 1: Update Schema

```typescript
// src/lib/db/rxdb-schemas.ts
export const messageSchema: RxJsonSchema<any> = {
  version: 2, // Increment version
  // ... schema definition with changes
};
```

### Step 2: Add Migration Strategy

```typescript
// src/lib/db/rxdb.ts
import { createRxDatabase, addRxPlugin } from 'rxdb';
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie';

const migrationStrategies = {
  messages: {
    1: (oldDoc: any) => {
      // Migration logic for messages collection
      return {
        ...oldDoc,
        newField: 'default value',
      };
    },
  },
  chats: {
    1: (oldDoc: any) => {
      // Migration logic for chats collection
      return oldDoc;
    },
  },
};

// When creating collection:
await db.addCollections({
  messages: {
    schema: messageSchema,
    migrationStrategies: migrationStrategies.messages,
  },
});
```

### Step 3: Test Migration

```typescript
// Test migration before deploying
describe('Schema Migration v1 -> v2', () => {
  it('should migrate messages correctly', async () => {
    // Create test database with old schema
    const testDb = await createTestDatabase();

    // Insert test data with old schema
    await testDb.messages.insert({
      id: 'test-1',
      chatId: 'chat-1',
      role: 'user',
      content: 'test',
      createdAt: Date.now(),
    });

    // Apply migration (done automatically when schema version changes)
    await testDb.messages.migratePromise();

    // Verify migrated data
    const doc = await testDb.messages.findOne('test-1').exec();
    expect(doc.toJSON().newField).toBe('default value');
  });
});
```

## Version Increment Schedule

### Minor Additions (Patch Versions)

- Version 1 → 2: Add optional fields
- Version 2 → 3: Add indexes
- Version 3 → 4: Add new collections

### Major Restructuring (Major Versions)

- Version 10 → 11: Complete data model redesign
- Version 20 → 21: Breaking changes to core schemas

**Recommendation**: Use version numbers sequentially (1, 2, 3...) rather than semantic versioning (1.0, 1.1, 2.0).

## Special Considerations

### JSON String Fields

Many fields are stored as JSON strings (e.g., `content`, `toolCalls`, `parameters`). When changing these:

1. Parse the JSON in the migration function
2. Transform the data structure
3. Stringify back to JSON

```typescript
migrationStrategies: {
  1: (oldDoc: any) => {
    const parsedContent = JSON.parse(oldDoc.content);
    // Transform structure
    const newContent = {
      ...parsedContent,
      metadata: {}, // Add new nested field
    };
    return {
      ...oldDoc,
      content: JSON.stringify(newContent),
    };
  },
}
```

### Cloud Sync Compatibility

When changing schemas with cloud sync enabled:

1. **Graceful degradation**: Ensure old clients can still read new data
2. **Version tracking**: Include schema version in sync metadata
3. **Migration on pull**: Apply migrations when pulling data from cloud
4. **Conflict resolution**: Handle schema version conflicts in merge logic

### Rollback Plan

Always have a rollback plan:

1. **Backup data**: Before migration, export full database
2. **Version check**: Add version validation before applying migrations
3. **Revert script**: Create script to restore from backup if migration fails

```typescript
// Example rollback helper
async function rollbackToVersion(db: RxDatabase, targetVersion: number) {
  // 1. Export current data
  const backup = await db.exportJSON();

  // 2. Clear database
  await db.remove();

  // 3. Restore with old schema
  await createDatabaseWithOldSchema(targetVersion);
  await db.importJSON(backup);
}
```

## Migration Testing Checklist

Before deploying a schema change:

- [ ] Test migration on development data
- [ ] Test migration on staging data
- [ ] Test migration on a copy of production data
- [ ] Verify all queries still work
- [ ] Test cloud sync with mixed schema versions
- [ ] Verify performance impact of migration
- [ ] Create rollback script
- [ ] Document breaking changes in changelog

## Example Migrations

### Adding an Optional Field

```typescript
// Version 1 → 2: Add "archived" boolean
migrationStrategies: {
  1: (oldDoc: any) => ({
    ...oldDoc,
    archived: false, // Default value
  }),
}
```

### Renaming a Field

```typescript
// Version 2 → 3: Rename "favorite" to "starred"
migrationStrategies: {
  2: (oldDoc: any) => {
    const { favorite, ...rest } = oldDoc;
    return {
      ...rest,
      starred: favorite ?? false,
    };
  },
}
```

### Restructuring Data

```typescript
// Version 3 → 4: Move settings into nested object
migrationStrategies: {
  3: (oldDoc: any) => {
    const { temperature, maxTokens, ...rest } = oldDoc;
    return {
      ...rest,
      parameters: {
        temperature,
        maxTokens,
      },
    };
  },
}
```

## Future Schema Changes

### Planned Changes (Hypothetical)

Version 2 candidates:
- Add `chat.archivedAt` for archive feature
- Add `message.editHistory` for edit tracking
- Add `chat.participantIds` for multi-user support

Version 3 candidates:
- Restructure `message.content` to support rich media
- Add composite indexes for advanced queries
- Add full-text search indexes

## Resources

- [RxDB Migration Guide](https://rxdb.info/migration-schema.html)
- [RxDB Schema Validation](https://rxdb.info/rx-schema.html)
- [IndexedDB Schema Migration Best Practices](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB#version_changes)

## Summary

- **Current**: All schemas at version 1
- **Next Migration**: Increment to version 2 when first schema change is needed
- **Testing**: Always test migrations on copy of production data
- **Rollback**: Always have backup and rollback plan
- **Documentation**: Document all schema changes in this file
