"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Fingerprint, Lock } from "lucide-react";
import { useApiKeysStore } from "@/stores/api-keys-store";
import { providerLabel } from "@/lib/ai/provider-routing";
import { isPasskeySupported } from "@/lib/crypto/vault-passkey";
import { cn } from "@/lib/utils";

export function VaultUnlockDialog() {
  const {
    vault,
    vaultUnlockRequest,
    clearVaultUnlockRequest,
    unlockVault,
    unlockVaultWithPasskey,
    requestVaultUnlock,
    resetVault,
  } = useApiKeysStore();
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [passkeySupported, setPasskeySupported] = useState(false);
  const [showPassphraseInput, setShowPassphraseInput] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dismissedByUser = useRef(false);

  useEffect(() => {
    setPasskeySupported(isPasskeySupported());
  }, []);

  useEffect(() => {
    if (!vaultUnlockRequest) {
      setPassphrase("");
      setBusy(false);
      setError(null);
      setShowPassphraseInput(false);
    }
  }, [vaultUnlockRequest]);

  // Auto-prompt when vault is locked on page load (but not if user dismissed it)
  useEffect(() => {
    if (vault.meta && !vault.isUnlocked && !vaultUnlockRequest && !dismissedByUser.current) {
      requestVaultUnlock();
    }
  }, [vault.meta, vault.isUnlocked, vaultUnlockRequest, requestVaultUnlock]);

  // Reset dismissedByUser when vault becomes unlocked
  useEffect(() => {
    if (vault.isUnlocked) {
      dismissedByUser.current = false;
    }
  }, [vault.isUnlocked]);

  if (!vault.meta) {
    return null;
  }

  const providerName = vaultUnlockRequest?.providerId
    ? providerLabel(vaultUnlockRequest.providerId)
    : "API key";
  const hasPasskey = !!vault.passkey && passkeySupported;

  const handleUnlock = async () => {
    if (!passphrase) {
      setError("Enter your vault passphrase");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await unlockVault(passphrase);
      clearVaultUnlockRequest();
      setPassphrase("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to unlock vault";
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  const handleUnlockWithPasskey = async () => {
    setBusy(true);
    setError(null);
    try {
      await unlockVaultWithPasskey();
      clearVaultUnlockRequest();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to unlock vault";
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  const handleResetVault = async () => {
    const confirmed = window.confirm(
      "Resetting the vault will remove locked API keys. You will need to re-enter them. Continue?"
    );
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      await resetVault();
      clearVaultUnlockRequest();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to reset vault";
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* Hidden form always in DOM for password manager detection */}
      <form
        className="sr-only"
        aria-hidden="true"
        onSubmit={(event) => {
          event.preventDefault();
          handleUnlock();
        }}
      >
        <input
          type="text"
          name="username"
          autoComplete="username"
          defaultValue="vault"
          readOnly
          tabIndex={-1}
        />
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          value={passphrase}
          onChange={(event) => setPassphrase(event.target.value)}
          tabIndex={-1}
        />
      </form>

      <Dialog
        open={!!vaultUnlockRequest}
        onOpenChange={(open) => {
          if (!open) {
            dismissedByUser.current = true;
            clearVaultUnlockRequest();
            setPassphrase("");
          }
        }}
      >
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Unlock
            </DialogTitle>
            <DialogDescription>
              Unlock the vault to use your {providerName} credentials.
            </DialogDescription>
          </DialogHeader>

          {hasPasskey ? (
            <div className="space-y-3 py-2">
              <Button className="w-full" onClick={handleUnlockWithPasskey} disabled={busy}>
                <Fingerprint className="h-4 w-4 mr-2" />
                {busy ? "Unlocking..." : "Unlock"}
              </Button>
              <button
                className="text-xs text-muted-foreground hover:underline w-full text-center"
                onClick={() => setShowPassphraseInput(true)}
              >
                Use passphrase instead
              </button>
              <div className={cn("space-y-2", !showPassphraseInput && "hidden")}>
                <Input
                  id="vault-passphrase"
                  type="password"
                  placeholder="Passphrase"
                  value={passphrase}
                  onChange={(event) => setPassphrase(event.target.value)}
                  autoComplete="current-password"
                  name="password"
                  disabled={busy}
                  autoFocus={showPassphraseInput}
                />
                <Button variant="outline" className="w-full" onClick={handleUnlock} disabled={busy}>
                  Unlock
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3 py-2">
              <Input
                id="vault-passphrase"
                type="password"
                placeholder="Passphrase"
                value={passphrase}
                onChange={(event) => setPassphrase(event.target.value)}
                autoComplete="current-password"
                name="password"
                disabled={busy}
                autoFocus
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleUnlock();
                  }
                }}
              />
              <Button className="w-full" onClick={handleUnlock} disabled={busy}>
                {busy ? "Unlocking..." : "Unlock"}
              </Button>
            </div>
          )}

          {error && <p className="text-sm text-red-500 text-center">{error}</p>}
          <div className="mt-2 border-t pt-3 text-xs text-muted-foreground space-y-2">
            <p>Forgot your passphrase? The vault cannot be recovered.</p>
            <Button variant="outline" className="w-full" onClick={handleResetVault} disabled={busy}>
              Reset vault (remove locked keys)
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
