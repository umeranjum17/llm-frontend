"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ProviderTileProps {
  name: string;
  selected?: boolean;
  recommended?: boolean;
  onClick: () => void;
}

export function ProviderTile({
  name,
  selected,
  recommended,
  onClick,
}: ProviderTileProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex items-center justify-center gap-2 px-4 py-3 rounded-md border-2 transition-all duration-150",
        "hover:border-primary/50 hover:bg-accent/50 hover:scale-[1.02] active:scale-[0.98]",
        selected
          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
          : "border-border bg-card"
      )}
    >
      <span className="font-medium text-sm">{name}</span>
      {recommended && (
        <Badge variant="secondary" className="text-xs">
          Recommended
        </Badge>
      )}
    </button>
  );
}
