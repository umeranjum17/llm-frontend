"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Fingerprint, Lock, Timer, Unlock } from "lucide-react";
import { toast } from "sonner";
import { useApiKeysStore } from "@/stores/api-keys-store";
import { providerLabel } from "@/lib/ai/provider-routing";
import { isPasskeySupported } from "@/lib/crypto/vault-passkey";

const rememberOptions: Array<{ label: string; value: number }> = [
  { label: "1 hour", value: 60 * 60 * 1000 },
  { label: "24 hours", value: 24 * 60 * 60 * 1000 },
  { label: "7 days", value: 7 * 24 * 60 * 60 * 1000 },
];

export function VaultUnlockDialog() {
  const {
    vault,
    vaultUnlockRequest,
    clearVaultUnlockRequest,
    unlockVault,
    unlockVaultWithPasskey,
    setVaultRememberMs,
  } = useApiKeysStore();
  const [passphrase, setPassphrase] = useState("");
  const [rememberMs, setRememberMs] = useState(vault.rememberMs);
  const [busy, setBusy] = useState(false);
  const [passkeySupported, setPasskeySupported] = useState(false);

  useEffect(() => {
    setRememberMs(vault.rememberMs);
  }, [vault.rememberMs]);

  useEffect(() => {
    setPasskeySupported(isPasskeySupported());
  }, []);

  useEffect(() => {
    if (!vaultUnlockRequest) {
      setPassphrase("");
      setBusy(false);
    }
  }, [vaultUnlockRequest]);

  if (!vault.meta) {
    return null;
  }

  const providerName = vaultUnlockRequest?.providerId
    ? providerLabel(vaultUnlockRequest.providerId)
    : "API key";
  const hasPasskey = !!vault.passkey && passkeySupported;

  const handleUnlock = async () => {
    if (!passphrase) {
      toast.error("Enter your vault passphrase");
      return;
    }
    setBusy(true);
    try {
      await unlockVault(passphrase, rememberMs);
      toast.success("Vault unlocked");
      clearVaultUnlockRequest();
      setPassphrase("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to unlock vault";
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const handleUnlockWithPasskey = async () => {
    setBusy(true);
    try {
      await unlockVaultWithPasskey(rememberMs);
      toast.success("Vault unlocked");
      clearVaultUnlockRequest();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to unlock vault";
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const handleRememberChange = async (value: string) => {
    const nextValue = Number(value);
    setRememberMs(nextValue);
    try {
      await setVaultRememberMs(nextValue);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update remember duration";
      toast.error(message);
    }
  };

  return (
    <Dialog
      open={!!vaultUnlockRequest}
      onOpenChange={(open) => {
        if (!open) {
          clearVaultUnlockRequest();
          setPassphrase("");
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-4 w-4" />
            Unlock vault
          </DialogTitle>
          <DialogDescription>
            Unlock the vault to use your {providerName} credentials.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Timer className="h-3.5 w-3.5 text-muted-foreground" />
              Remember unlock (this tab)
            </Label>
            <Select value={String(rememberMs)} onValueChange={handleRememberChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {rememberOptions.map((opt) => (
                  <SelectItem key={opt.value} value={String(opt.value)}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Passphrase</Label>
            <Input
              type="password"
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
              placeholder="Enter passphrase"
              autoComplete="current-password"
              name="vault-passphrase"
              disabled={busy}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {hasPasskey && (
            <Button variant="outline" onClick={handleUnlockWithPasskey} disabled={busy}>
              <Fingerprint className="mr-2 h-4 w-4" />
              Unlock with passkey
            </Button>
          )}
          <Button onClick={handleUnlock} disabled={busy}>
            <Unlock className="mr-2 h-4 w-4" />
            Unlock
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
