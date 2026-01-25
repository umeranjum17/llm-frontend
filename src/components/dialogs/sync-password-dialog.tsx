"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { validateSyncPassword, type PasswordValidationResult } from "@/lib/crypto/api-key-sync-crypto";
import { AlertTriangle, Eye, EyeOff, Lock } from "lucide-react";

interface SyncPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "setup" | "sync" | "change";
  onSubmit: (password: string, hint?: string) => Promise<void>;
  hint?: string; // Password hint to display
}

export function SyncPasswordDialog({
  open,
  onOpenChange,
  mode,
  onSubmit,
  hint,
}: SyncPasswordDialogProps) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [oldPassword, setOldPassword] = useState("");
  const [passwordHint, setPasswordHint] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validation, setValidation] = useState<PasswordValidationResult | null>(null);

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (!open) {
      setPassword("");
      setConfirmPassword("");
      setOldPassword("");
      setPasswordHint("");
      setShowPassword(false);
      setShowConfirmPassword(false);
      setShowOldPassword(false);
      setValidation(null);
    }
  }, [open]);

  // Validate password on change
  useEffect(() => {
    if (password) {
      setValidation(validateSyncPassword(password));
    } else {
      setValidation(null);
    }
  }, [password]);

  const getPasswordStrengthColor = (score: number) => {
    if (score === 0) return "bg-red-500";
    if (score === 1) return "bg-orange-500";
    if (score === 2) return "bg-yellow-500";
    if (score === 3) return "bg-blue-500";
    return "bg-green-500";
  };

  const getPasswordStrengthLabel = (score: number) => {
    if (score === 0) return "Too Weak";
    if (score === 1) return "Weak";
    if (score === 2) return "Fair";
    if (score === 3) return "Good";
    return "Strong";
  };

  const handleSubmit = async () => {
    if (mode === "setup" || mode === "change") {
      if (!validation?.valid) {
        return;
      }

      if (password !== confirmPassword) {
        return;
      }
    }

    setIsSubmitting(true);
    try {
      if (mode === "change") {
        // For password change, pass both old and new passwords
        // The onSubmit handler should handle the old password verification
        await onSubmit(oldPassword + "|" + password, passwordHint || undefined);
      } else {
        await onSubmit(password, passwordHint || undefined);
      }
      onOpenChange(false);
    } catch (error) {
      console.error("Password dialog submit error:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSubmit = () => {
    if (mode === "sync") {
      return password.length > 0;
    }

    if (mode === "change") {
      return (
        oldPassword.length > 0 &&
        validation?.valid &&
        password === confirmPassword
      );
    }

    // setup mode
    return validation?.valid && password === confirmPassword;
  };

  const getTitle = () => {
    if (mode === "setup") return "Enable Secure API Key Sync";
    if (mode === "change") return "Change Sync Password";
    return "Enter Sync Password";
  };

  const getDescription = () => {
    if (mode === "setup") {
      return "Create a strong password to encrypt your API keys for cloud sync. This password will be required on all devices.";
    }
    if (mode === "change") {
      return "Change your sync password. All API keys will be re-encrypted with the new password.";
    }
    return hint
      ? `Enter your sync password to continue. Hint: ${hint}`
      : "Enter your sync password to continue.";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            {getTitle()}
          </DialogTitle>
          <DialogDescription>{getDescription()}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Warning banner */}
          {(mode === "setup" || mode === "change") && (
            <div className="flex gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="space-y-1 text-sm">
                <p className="font-medium text-amber-900 dark:text-amber-100">
                  CRITICAL: If you forget this password, your encrypted API keys CANNOT be recovered.
                </p>
                <ul className="list-disc list-inside text-amber-800 dark:text-amber-200 space-y-0.5 mt-2">
                  <li>Use a strong, unique password</li>
                  <li>Store it in a password manager</li>
                  <li>Optional: Write a password hint below</li>
                </ul>
              </div>
            </div>
          )}

          {/* Old password field (change mode only) */}
          {mode === "change" && (
            <div className="space-y-2">
              <Label htmlFor="old-password">Current Password</Label>
              <div className="relative">
                <Input
                  id="old-password"
                  type={showOldPassword ? "text" : "password"}
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  placeholder="Enter current password"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowOldPassword(!showOldPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showOldPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          )}

          {/* Password field */}
          <div className="space-y-2">
            <Label htmlFor="password">
              {mode === "change" ? "New Password" : mode === "sync" ? "Password" : "Password"}
            </Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "sync" ? "Enter password" : "Min 12 characters"}
                autoComplete={mode === "sync" ? "current-password" : "new-password"}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            {/* Password strength meter */}
            {(mode === "setup" || mode === "change") && password && (
              <div className="space-y-1">
                <div className="flex gap-1">
                  {[...Array(5)].map((_, i) => (
                    <div
                      key={i}
                      className={`h-1 flex-1 rounded ${
                        i < (validation?.score || 0) + 1
                          ? getPasswordStrengthColor(validation?.score || 0)
                          : "bg-gray-200 dark:bg-gray-700"
                      }`}
                    />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Strength: {getPasswordStrengthLabel(validation?.score || 0)}
                </p>
                {validation?.errors && validation.errors.length > 0 && (
                  <ul className="text-xs text-red-500 space-y-0.5">
                    {validation.errors.map((error, i) => (
                      <li key={i}>• {error}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* Confirm password field */}
          {(mode === "setup" || mode === "change") && (
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <div className="relative">
                <Input
                  id="confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {confirmPassword && password !== confirmPassword && (
                <p className="text-xs text-red-500">Passwords do not match</p>
              )}
            </div>
          )}

          {/* Password hint field */}
          {(mode === "setup" || mode === "change") && (
            <div className="space-y-2">
              <Label htmlFor="hint">Password Hint (Optional)</Label>
              <Input
                id="hint"
                type="text"
                value={passwordHint}
                onChange={(e) => setPasswordHint(e.target.value)}
                placeholder="e.g., My favorite quote"
                maxLength={100}
              />
              <p className="text-xs text-muted-foreground">
                A reminder to help you remember your password (not the password itself)
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit() || isSubmitting}>
            {isSubmitting ? "Processing..." : mode === "change" ? "Change Password" : "Continue"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
