export const VAULT_PASSKEY_VERSION = 1 as const;

const CHALLENGE_LENGTH = 32;
const USER_ID_LENGTH = 16;
const PASSKEY_SALT_LENGTH = 32;
const WRAP_IV_LENGTH = 12;

export interface ApiKeyVaultPasskey {
  version: typeof VAULT_PASSKEY_VERSION;
  credentialId: string; // base64
  salt: string; // base64
  wrappedKey: string; // base64
  wrappedKeyIv: string; // base64
  method: "prf" | "hmac-secret";
}

type PasskeyExtensions = AuthenticationExtensionsClientInputs & {
  prf?: { eval?: { first: ArrayBuffer; second?: ArrayBuffer } };
  hmacCreateSecret?: boolean;
  hmacGetSecret?: { salt1: ArrayBuffer; salt2?: ArrayBuffer };
};

type PasskeyExtensionResults = AuthenticationExtensionsClientOutputs & {
  prf?: { results?: { first?: ArrayBuffer; second?: ArrayBuffer } } | { first?: ArrayBuffer };
  hmacGetSecret?: { output1?: ArrayBuffer; output2?: ArrayBuffer };
};

function assertBrowser() {
  if (typeof window === "undefined" || !window.crypto?.subtle) {
    throw new Error("Passkeys are only available in the browser");
  }
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(length));
  crypto.getRandomValues(bytes);
  return bytes;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function base64ToArray(base64: string): Uint8Array {
  return new Uint8Array(base64ToArrayBuffer(base64));
}

export function isPasskeySupported(): boolean {
  return typeof window !== "undefined" && "PublicKeyCredential" in window && !!navigator.credentials;
}

async function getPasskeySecret(
  credentialId: ArrayBuffer,
  salt: Uint8Array
): Promise<{ secret: ArrayBuffer; method: ApiKeyVaultPasskey["method"] }> {
  assertBrowser();

  const challenge = randomBytes(CHALLENGE_LENGTH);
  const publicKey: PublicKeyCredentialRequestOptions = {
    challenge: challenge.buffer as ArrayBuffer,
    allowCredentials: [{ type: "public-key", id: credentialId }],
    userVerification: "required",
    timeout: 60_000,
    extensions: {
      prf: { eval: { first: salt.buffer as ArrayBuffer } },
      hmacGetSecret: { salt1: salt.buffer as ArrayBuffer, salt2: salt.buffer as ArrayBuffer },
    } as PasskeyExtensions,
  };

  const assertion = await navigator.credentials.get({ publicKey });
  if (!assertion || !(assertion instanceof PublicKeyCredential)) {
    throw new Error("Passkey authentication was cancelled or failed");
  }

  const results = assertion.getClientExtensionResults() as PasskeyExtensionResults;
  const prfFirst = (results as PasskeyExtensionResults)?.prf
    ? ((results.prf as { results?: { first?: ArrayBuffer }; first?: ArrayBuffer }).results?.first ??
      (results.prf as { first?: ArrayBuffer }).first)
    : undefined;

  if (prfFirst) {
    return { secret: prfFirst, method: "prf" };
  }

  const hmac = results.hmacGetSecret;
  if (hmac?.output1) {
    return { secret: hmac.output1, method: "hmac-secret" };
  }

  throw new Error("This passkey doesn't support PRF/HMAC secrets");
}

export async function createVaultPasskey(
  rawVaultKey: ArrayBuffer,
  options?: { rpName?: string; userName?: string; userDisplayName?: string }
): Promise<ApiKeyVaultPasskey> {
  assertBrowser();
  if (!isPasskeySupported()) {
    throw new Error("Passkeys aren't supported in this browser");
  }

  const salt = randomBytes(PASSKEY_SALT_LENGTH);
  const userId = randomBytes(USER_ID_LENGTH);
  const challenge = randomBytes(CHALLENGE_LENGTH);

  const rpName = options?.rpName ?? "Lumina";
  const userName = options?.userName ?? "vault-user";
  const userDisplayName = options?.userDisplayName ?? "Vault user";

  const publicKey: PublicKeyCredentialCreationOptions = {
    challenge: challenge.buffer as ArrayBuffer,
    rp: { name: rpName },
    user: { id: userId.buffer as ArrayBuffer, name: userName, displayName: userDisplayName },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }],
    authenticatorSelection: { userVerification: "required" },
    timeout: 60_000,
    attestation: "none",
    extensions: {
      prf: { eval: { first: salt.buffer as ArrayBuffer } },
      hmacCreateSecret: true,
    } as PasskeyExtensions,
  };

  const credential = await navigator.credentials.create({ publicKey });
  if (!credential || !(credential instanceof PublicKeyCredential)) {
    throw new Error("Passkey creation failed");
  }

  const { secret, method } = await getPasskeySecret(credential.rawId, salt);
  const wrappingKey = await crypto.subtle.importKey(
    "raw",
    secret,
    "AES-GCM",
    false,
    ["encrypt", "decrypt"]
  );

  const iv = randomBytes(WRAP_IV_LENGTH);
  const wrapped = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
    wrappingKey,
    rawVaultKey
  );

  return {
    version: VAULT_PASSKEY_VERSION,
    credentialId: arrayBufferToBase64(credential.rawId),
    salt: arrayBufferToBase64(salt.buffer as ArrayBuffer),
    wrappedKey: arrayBufferToBase64(wrapped),
    wrappedKeyIv: arrayBufferToBase64(iv.buffer as ArrayBuffer),
    method,
  };
}

export async function unwrapVaultKeyWithPasskey(
  passkey: ApiKeyVaultPasskey
): Promise<{ rawVaultKey: ArrayBuffer; method: ApiKeyVaultPasskey["method"] }> {
  assertBrowser();
  if (passkey.version !== VAULT_PASSKEY_VERSION) {
    throw new Error("Unsupported passkey vault format");
  }

  const credentialId = base64ToArrayBuffer(passkey.credentialId);
  const salt = base64ToArray(passkey.salt);
  const { secret, method } = await getPasskeySecret(credentialId, salt);

  const wrappingKey = await crypto.subtle.importKey(
    "raw",
    secret,
    "AES-GCM",
    false,
    ["decrypt"]
  );

  const iv = base64ToArray(passkey.wrappedKeyIv);
  const wrapped = base64ToArrayBuffer(passkey.wrappedKey);

  const rawVaultKey = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
    wrappingKey,
    wrapped
  );

  return { rawVaultKey, method };
}
