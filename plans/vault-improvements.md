# Vault improvements plan (BYOK, privacy-first)

## Best-practice overview for BYOK in browser apps

- **Keep secrets client-only**: store API keys in IndexedDB, never send to servers unless explicitly required for provider calls. Use client-side encryption with Web Crypto and avoid logs.
- **Passphrase-based vault**: derive a vault key from a user passphrase (PBKDF2/Argon2) + random salt, encrypt keys with AES-GCM. Keep derived keys in memory only when unlocked.
- **Remember/unlock strategy**: prefer in-memory unlock per tab; if persistence is needed, use WebAuthn/Passkeys to re-unlock rather than storing raw keys. Avoid storing raw keys in `sessionStorage` or `localStorage`.
- **Passkey integration**: wrap the vault key using WebAuthn and store only wrapped blobs. Unwrap requires user presence/biometrics, reducing exposure.
- **Clear UX semantics**: “remember” should clearly define scope (this tab, this browser session, or device). Provide a “Do not remember” option.
- **Rate limits + spending caps guidance**: Encourage users to set provider limits and scoped keys.
- **Threat model messaging**: clarify that local storage is only as safe as the device/browser; extensions or malware can compromise secrets.

## Current repo vault flow (high-level)

- **Enable vault**: derive vault key from passphrase, re-encrypt existing keys to `v2:` format. Store remember duration. Source: [`src/stores/api-keys-store.ts`](../src/stores/api-keys-store.ts:683), [`src/lib/crypto/api-key-vault.ts`](../src/lib/crypto/api-key-vault.ts:47).
- **Unlock vault**: derive vault key, decrypt vault keys; optionally persist raw key in `sessionStorage` for remember. Source: [`src/stores/api-keys-store.ts`](../src/stores/api-keys-store.ts:542).
- **Unlock UI**: passphrase + passkey option with “remember” duration. Source: [`src/components/providers/vault-unlock-dialog.tsx`](../src/components/providers/vault-unlock-dialog.tsx:21).
- **Settings**: passphrase setup, enable/disable, passkey setup, remember duration; explains local-only storage. Source: [`src/components/settings/api-keys-settings.tsx`](../src/components/settings/api-keys-settings.tsx:297).

## Gaps + risks (security + UX)

1. **Raw vault key persisted to `sessionStorage`** (risk of XSS/extension access). Source: [`src/stores/api-keys-store.ts`](../src/stores/api-keys-store.ts:138).
2. **Always derive extractable keys during unlock**; extractable keys can be exported, increasing exposure. Source: [`src/stores/api-keys-store.ts`](../src/stores/api-keys-store.ts:549).
3. **Remember UI says “this tab” but values include 7 days**, which implies persistence across sessions. UX mismatch. Source: [`src/components/providers/vault-unlock-dialog.tsx`](../src/components/providers/vault-unlock-dialog.tsx:124).
4. **Wrong passphrase handling**: decrypt failures are not surfaced with a specific error type, so UX is generic. Source: [`src/stores/api-keys-store.ts`](../src/stores/api-keys-store.ts:552).
5. **Partial decrypt handling**: vault-key decrypt failures do not distinguish corrupted entries vs wrong passphrase; no recovery workflow beyond re-entry.

## Recommended policy for this use case

- **Convenience-first (approved)**: allow remember across sessions **only via passkey-wrapped key stored in IndexedDB**. If no passkey is available, fall back to **per-tab in-memory unlock** with no persisted raw key.

## Recommendations (prioritized)

### P0 — Reduce vault key exposure (aligned to approved policy)

- **Eliminate raw key persistence in `sessionStorage`**. Keep unlock state in memory only.
- **Use passkey-wrapped key for “remember across sessions”**: store wrapped key in IndexedDB and require user presence to unwrap. If no passkey, only support “remember until tab closed.”
- **Make derived vault keys non-extractable by default**; only derive extractable when explicitly needed for passkey setup.

### P0 — Passphrase verification before decrypt

- **Add a verification hash to vault metadata** (HMAC of fixed string using vault key) to detect wrong passphrases without decrypting user keys.
- **Auto-migrate V1 vault metadata to V2** on first successful unlock.

### P0 — Passphrase strength requirements

- **Enforce minimum passphrase strength** during vault setup (length, character classes, common-password checks) and show a strength meter.

### P1 — Improve error handling and recovery

- **Differentiate wrong passphrase vs corrupted key**: add an explicit error type in vault decrypt and surface a clear message.
- **Partial decrypt strategy**: if some keys fail, keep them locked and show targeted “re-enter key” prompts rather than generic failure.

### P1 — Setup risk acknowledgment

- **Add recovery warning dialog** before enabling the vault, explaining there is no passphrase recovery and keys must be re-entered.

### P2 — UX clarity improvements

- **Remember options**: add “Do not remember” and align copy with actual persistence scope. If persistence across sessions is offered, clarify it’s device-level.
- **Unlock dialog copy**: emphasize local-only, and the consequence of forgetting passphrase.
- **Passphrase strength**: add minimum length and strength feedback when enabling the vault.

## Implementation steps (for Code mode)

1. **Vault key persistence**
   - Remove raw-key persistence from [`src/stores/api-keys-store.ts`](../src/stores/api-keys-store.ts:138).
   - If “remember across sessions” is required, store a **passkey-wrapped** key in IndexedDB; otherwise default to in-memory per-tab unlock.

2. **Key derivation policy**
   - Make `deriveVaultKey` default to non-extractable; only allow extractable when setting up passkey or exporting wrapped key. Source: [`src/lib/crypto/api-key-vault.ts`](../src/lib/crypto/api-key-vault.ts:67).

3. **Passphrase verification + migration**
   - Add vault metadata V2 with verification hash in [`src/lib/crypto/api-key-vault.ts`](../src/lib/crypto/api-key-vault.ts:15).
   - Auto-upgrade V1 metadata after first successful unlock in [`src/stores/api-keys-store.ts`](../src/stores/api-keys-store.ts:542).

4. **Error handling**
   - Introduce a vault-specific `DecryptionError` or error code in [`src/lib/crypto/api-key-vault.ts`](../src/lib/crypto/api-key-vault.ts:131) and handle it in [`src/stores/api-keys-store.ts`](../src/stores/api-keys-store.ts:552).

5. **Unlock + setup UX**
   - Add “Do not remember” option, and update copy in [`src/components/providers/vault-unlock-dialog.tsx`](../src/components/providers/vault-unlock-dialog.tsx:124) and [`src/components/settings/api-keys-settings.tsx`](../src/components/settings/api-keys-settings.tsx:333).
   - Show actionable error messages (wrong passphrase vs corrupted key).
   - Add recovery warning dialog before enabling the vault.

6. **Passphrase strength**
   - Add validation and strength UI in [`src/components/settings/api-keys-settings.tsx`](../src/components/settings/api-keys-settings.tsx:188).

## Optional: Threat model snapshot

- **In scope**: casual access (lost device), synced storage backups, local file access.
- **Out of scope**: malicious extensions/XSS (needs CSP + code review), OS-level compromise.
- **Mitigations**: passphrase vault, limited remember, passkeys, user education.
