"use client";

import { useState, forwardRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, CheckCircle2, AlertCircle, Loader2, Wifi, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

type ValidationPhase = "idle" | "connecting" | "verifying" | "success" | "error";

export interface SecretInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  validationPhase?: ValidationPhase;
  providerName?: string;
}

export const SecretInput = forwardRef<HTMLInputElement, SecretInputProps>(
  ({ className, validationPhase = "idle", providerName, ...props }, ref) => {
    const [showSecret, setShowSecret] = useState(false);

    return (
      <div className="relative">
        <Input
          ref={ref}
          type={showSecret ? "text" : "password"}
          className={cn(
            "pr-20 font-mono text-sm transition-colors duration-300",
            validationPhase === "connecting" &&
              "border-blue-500 focus-visible:ring-blue-500 animate-pulse",
            validationPhase === "verifying" &&
              "border-yellow-500 focus-visible:ring-yellow-500 animate-pulse",
            validationPhase === "success" &&
              "border-green-500 focus-visible:ring-green-500",
            validationPhase === "error" &&
              "border-destructive focus-visible:ring-destructive",
            className
          )}
          {...props}
        />

        {/* Validation Indicators & Toggle */}
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {validationPhase === "connecting" && (
            <Wifi className="h-4 w-4 text-blue-500 animate-pulse" />
          )}
          {validationPhase === "verifying" && (
            <Zap className="h-4 w-4 text-yellow-500 animate-pulse" />
          )}
          {validationPhase === "success" && (
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          )}
          {validationPhase === "error" && (
            <AlertCircle className="h-4 w-4 text-destructive" />
          )}

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setShowSecret(!showSecret)}
            tabIndex={-1}
          >
            {showSecret ? (
              <EyeOff className="h-3.5 w-3.5" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>
    );
  }
);

SecretInput.displayName = "SecretInput";
