"use client";

import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface BranchNavigatorProps {
  index: number; // 0-based
  count: number;
  onPrev: () => void;
  onNext: () => void;
}

export function BranchNavigator({ index, count, onPrev, onNext }: BranchNavigatorProps) {
  if (count <= 1) return null;

  return (
    <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-6 w-6"
        onClick={onPrev}
        title="Previous branch"
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <span>
        Branch {index + 1} of {count}
      </span>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-6 w-6"
        onClick={onNext}
        title="Next branch"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

