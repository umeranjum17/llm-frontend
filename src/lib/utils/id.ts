/**
 * Generates a reasonably collision-resistant ID for client-side persistence.
 *
 * Why not always `crypto.randomUUID()`?
 * - Some environments (older browsers, insecure contexts) may not support it.
 * - We still prefer UUID when available.
 */
export function generateId(prefix?: string): string {
  const p = prefix ? `${prefix}_` : "";

  try {
    const c = (globalThis as any).crypto as Crypto | undefined;
    if (c && typeof (c as any).randomUUID === "function") {
      return `${p}${(c as any).randomUUID()}`;
    }
  } catch {
    // fall through to non-crypto id
  }

  // Fallback: timestamp + random (base36). Not a UUID, but stable enough for local IDs.
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `${p}${ts}_${rand}`;
}

