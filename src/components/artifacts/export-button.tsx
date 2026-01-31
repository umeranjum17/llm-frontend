"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ExportButtonProps {
  label: string;
  onClick: () => Promise<void>;
  variant?: "outline" | "ghost" | "secondary";
  size?: "sm" | "default" | "icon";
}

export function ExportButton({
  label,
  onClick,
  variant = "outline",
  size = "sm",
}: ExportButtonProps) {
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");

  const handleClick = async () => {
    setState("loading");
    try {
      await onClick();
      setState("done");
      toast.success(`Exported as ${label}`);
      setTimeout(() => setState("idle"), 1500);
    } catch (error) {
      toast.error(`Export failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      setState("idle");
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      className={cn(
        "gap-1.5 text-xs transition-all",
        state === "done" && "text-green-500 border-green-500/30"
      )}
      onClick={handleClick}
      disabled={state === "loading"}
    >
      {state === "loading" ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : state === "done" ? (
        <Check className="h-3 w-3" />
      ) : (
        <Download className="h-3 w-3" />
      )}
      {label}
    </Button>
  );
}
