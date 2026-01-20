"use client";

import { useState, forwardRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SecretInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  validationState?: "success" | "error" | "validating" | null;
  errorMessage?: string;
}

export const SecretInput = forwardRef<HTMLInputElement, SecretInputProps>(
  ({ className, validationState, errorMessage, ...props }, ref) => {
    const [showSecret, setShowSecret] = useState(false);

    return (
      <div className="space-y-2">
        <div className="relative">
          <Input
            ref={ref}
            type={showSecret ? "text" : "password"}
            className={cn(
              "pr-20 font-mono text-sm",
              validationState === "success" &&
                "border-green-500 focus-visible:ring-green-500",
              validationState === "error" &&
                "border-destructive focus-visible:ring-destructive",
              className
            )}
            {...props}
          />

          {/* Validation Indicators & Toggle */}
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {validationState === "validating" && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
            {validationState === "success" && (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            )}
            {validationState === "error" && (
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

        {/* Error Message */}
        {validationState === "error" && errorMessage && (
          <p className="text-xs text-destructive">{errorMessage}</p>
        )}
      </div>
    );
  }
);

SecretInput.displayName = "SecretInput";
