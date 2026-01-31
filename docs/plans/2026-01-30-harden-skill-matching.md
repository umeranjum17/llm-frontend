# Harden Skill Create, Match & Edit Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Harden skill creation, matching, and editing to eliminate race conditions, missing validations, silent failures, and data integrity gaps.

**Architecture:** Add input sanitization layer, improve validation coverage, add concurrency guards, surface embedding failures properly, and prevent duplicate skills. All changes in existing files — no new files needed.

**Tech Stack:** TypeScript, Dexie (IndexedDB), React/Zustand, cosine similarity embeddings

---

### Task 1: Sanitize trigger phrases and exclusion queries before save

**Files:**
- Modify: `src/components/skill-editor/skill-editor-shell.tsx`

**Step 1: Write the failing test**

No test infrastructure exists for this component. Skip TDD — this is a straightforward sanitization fix.

**Step 2: Add sanitization to the save flow**

In `skill-editor-shell.tsx`, find the two places where `triggerPhrases` and `exclusionQueries` are passed to the skill object (both create and edit paths). Replace raw usage with filtered versions:

```typescript
// Before building the skill object, add:
const cleanedTriggerPhrases = triggerPhrases
  .map(p => p.trim())
  .filter(p => p.length > 0);
const cleanedExclusionQueries = exclusionQueries
  .map(q => q.trim())
  .filter(q => q.length > 0);

// Deduplicate
const uniqueTriggerPhrases = [...new Set(cleanedTriggerPhrases)];
const uniqueExclusionQueries = [...new Set(cleanedExclusionQueries)];
```

Then use `uniqueTriggerPhrases` and `uniqueExclusionQueries` instead of the raw arrays in both the create and edit code paths when building the skill object and when calling `setSkillAutoApplyQueries`/`setSkillExclusionQueries`.

**Step 3: Commit**

```bash
git add src/components/skill-editor/skill-editor-shell.tsx
git commit -m "fix: sanitize and deduplicate trigger phrases and exclusion queries before save"
```

---

### Task 2: Prevent duplicate skill names

**Files:**
- Modify: `src/lib/db/queries.ts`
- Modify: `src/components/skill-editor/skill-editor-shell.tsx`

**Step 1: Add duplicate check function to queries.ts**

Add near the other skill query functions:

```typescript
export async function isSkillNameTaken(
  name: string,
  excludeId?: string
): Promise<boolean> {
  const normalized = name.trim().toLowerCase();
  const match = await db.skills
    .filter(s => s.name.trim().toLowerCase() === normalized && s.id !== (excludeId ?? ""))
    .first();
  return !!match;
}
```

**Step 2: Check for duplicate in skill-editor-shell.tsx save flow**

Before calling `addSkill()` or `updateSkill()`, add:

```typescript
const { isSkillNameTaken } = await import("@/lib/db/queries");
const isDuplicate = await isSkillNameTaken(
  name,
  isEditMode ? existingSkill?.id : undefined
);
if (isDuplicate) {
  toast.error(`A skill named "${name.trim()}" already exists.`);
  setIsSaving(false);
  return;
}
```

**Step 3: Commit**

```bash
git add src/lib/db/queries.ts src/components/skill-editor/skill-editor-shell.tsx
git commit -m "fix: prevent creating skills with duplicate names"
```

---

### Task 3: Validate embedding generation results and surface failures

**Files:**
- Modify: `src/components/skill-editor/skill-editor-shell.tsx`

**Step 1: Check return values from embedding generation**

In both the create and edit paths, after calling `setSkillAutoApplyQueries` and `setSkillExclusionQueries`, check the return value:

```typescript
const triggerResult = await setSkillAutoApplyQueries(
  skillId, uniqueTriggerPhrases, apiKey, embeddingsProvider, embeddingsModelId
);
if (triggerResult && !triggerResult.success) {
  toast.warning(`Skill saved, but ${triggerResult.failedCount ?? "some"} trigger embeddings failed to generate.`);
}

const exclusionResult = await setSkillExclusionQueries(
  skillId, uniqueExclusionQueries, apiKey, embeddingsProvider, embeddingsModelId
);
if (exclusionResult && !exclusionResult.success) {
  toast.warning(`${exclusionResult.failedCount ?? "Some"} exclusion embeddings failed to generate.`);
}
```

**Step 2: Commit**

```bash
git add src/components/skill-editor/skill-editor-shell.tsx
git commit -m "fix: surface embedding generation failures with specific error messages"
```

---

### Task 4: Prevent concurrent saves with a guard

**Files:**
- Modify: `src/components/skill-editor/skill-editor-shell.tsx`

**Step 1: Add save guard**

The component likely already has an `isSaving` state. Verify it's checked at the top of the save handler:

```typescript
const handleSave = async () => {
  if (isSaving) return; // Already saving - prevent double-click
  setIsSaving(true);
  try {
    // ... existing save logic
  } finally {
    setIsSaving(false);
  }
};
```

Also ensure the Save button is disabled when `isSaving` is true (likely already done, but verify).

**Step 2: Commit**

```bash
git add src/components/skill-editor/skill-editor-shell.tsx
git commit -m "fix: prevent concurrent skill saves with isSaving guard"
```

---

### Task 5: Harden the matching algorithm against edge cases

**Files:**
- Modify: `src/lib/skills/skill-matcher.ts`

**Step 1: Add vector dimension validation**

In `matchSkill()`, after getting `messageEmbedding`, add a dimension check before computing similarities:

```typescript
// Validate embedding dimensions match before comparing
if (messageEmbedding.length === 0) {
  return null;
}
```

**Step 2: Guard against NaN/Infinity in cosine similarity**

In `cosineSimilarity()`, add a final guard:

```typescript
const result = dotProduct / (normA * normB);
if (!isFinite(result)) return 0;
return result;
```

**Step 3: Add dimension mismatch protection in the scoring loop**

In the scoring loop, skip embeddings with mismatched dimensions instead of throwing:

```typescript
for (const { embedding, skill } of eligibleSkills) {
  let primaryScore = 0;

  if (skill.autoApplyEmbeddings && skill.autoApplyEmbeddings.length > 0) {
    for (const queryEmbedding of skill.autoApplyEmbeddings) {
      if (queryEmbedding.length !== messageEmbedding.length) continue; // dimension mismatch - skip
      const sim = cosineSimilarity(messageEmbedding, queryEmbedding);
      if (sim > primaryScore) {
        primaryScore = sim;
      }
    }
  } else if (embedding.length === messageEmbedding.length) {
    primaryScore = cosineSimilarity(messageEmbedding, embedding);
  }
  // ... rest stays the same, but also guard exclusion embeddings
```

Apply the same dimension check for exclusion embeddings.

**Step 4: Apply same guards to `getAllSkillMatches`**

Mirror the dimension checks in `getAllSkillMatches()` for consistency.

**Step 5: Commit**

```bash
git add src/lib/skills/skill-matcher.ts
git commit -m "fix: harden skill matcher against NaN, dimension mismatches, and empty embeddings"
```

---

### Task 6: Add embedding generation timeout

**Files:**
- Modify: `src/lib/skills/skill-embeddings.ts`

**Step 1: Add timeout wrapper to `getEmbedding`**

Add an AbortController with a 15-second timeout to the fetch call in `getEmbedding()`:

```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 15000);

try {
  const response = await fetch("/api/embeddings", {
    method: "POST",
    headers: { ... },
    body: JSON.stringify({ ... }),
    signal: controller.signal,
  });
  // ... existing logic
} finally {
  clearTimeout(timeoutId);
}
```

Do the same for `generateSkillEmbedding()`.

**Step 2: Commit**

```bash
git add src/lib/skills/skill-embeddings.ts
git commit -m "fix: add 15s timeout to embedding API calls to prevent hanging"
```

---

### Task 7: Validate form fields at the type level

**Files:**
- Modify: `src/hooks/use-skill-editor-form.ts`

**Step 1: Strengthen validation for Step 1 (triggers)**

In `validateStep` for step 1, add validation that individual trigger phrases have content:

```typescript
case 1: {
  if (state.autoTrigger) {
    const validPhrases = state.triggerPhrases.filter(p => p.trim().length > 0);
    if (validPhrases.length === 0) {
      errors.triggerPhrases = "At least one non-empty trigger phrase is required";
    }
  }
  break;
}
```

**Step 2: Add validation for category, icon, color**

In `validateStep` for step 0:

```typescript
case 0: {
  if (state.name.trim().length < 3) {
    errors.name = "Name must be at least 3 characters";
  }
  // Category validated by the UI dropdown, but add runtime check
  const validCategories = ["creation", "visualization", "coding", "analysis", "writing", "productivity", "research", "business", "search"];
  if (!validCategories.includes(state.category)) {
    errors.category = "Invalid category";
  }
  break;
}
```

**Step 3: Commit**

```bash
git add src/hooks/use-skill-editor-form.ts
git commit -m "fix: strengthen form validation for trigger phrases and category"
```

---

### Task 8: Clear stale embeddings when trigger phrases change on edit

**Files:**
- Modify: `src/components/skill-editor/skill-editor-shell.tsx`

**Step 1: Clear old embeddings before regeneration**

In the edit path, before generating new trigger/exclusion embeddings, clear the old ones on the skill:

```typescript
// Clear stale embeddings before regeneration
await updateSkill(existingSkill.id, {
  autoApplyEmbeddings: undefined,
  exclusionEmbeddings: undefined,
});
```

This ensures if regeneration fails, the skill won't have mismatched old embeddings + new trigger phrases.

**Step 2: Commit**

```bash
git add src/components/skill-editor/skill-editor-shell.tsx
git commit -m "fix: clear stale embeddings before regeneration on skill edit"
```

---

### Task 9: Verify all changes work end-to-end

**Step 1: Run the build**

```bash
npm run build
```

Expected: No type errors, no build failures.

**Step 2: Fix any issues found**

**Step 3: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve build issues from skill hardening changes"
```
