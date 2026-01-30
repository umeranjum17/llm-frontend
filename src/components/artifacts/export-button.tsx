"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

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
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      await onClick();
      toast.success(`Exported as ${label}`);
    } catch (error) {
      toast.error(`Export failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant={variant}
      size={size}
      className="gap-1.5 text-xs"
      onClick={handleClick}
      disabled={loading}
    >
      {loading ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Download className="h-3 w-3" />
      )}
      {label}
    </Button>
  );
}
