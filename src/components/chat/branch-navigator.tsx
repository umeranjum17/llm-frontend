"use client";

import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, GitBranch, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface BranchNavigatorProps {
  index: number; // 0-based
  count: number;
  onPrev: () => void;
  onNext: () => void;
  onDelete?: (index: number) => void;
  branchNames?: string[];
  onRename?: (index: number, name: string) => void;
}

export function BranchNavigator({ 
  index, 
  count, 
  onPrev, 
  onNext,
  onDelete,
  branchNames,
  onRename,
}: BranchNavigatorProps) {
  if (count <= 1) return null;

  const currentBranchName = branchNames?.[index] || `Branch ${index + 1}`;

  return (
    <div className="mt-2 flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <GitBranch className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="flex items-center gap-2 min-w-0">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={onPrev}
            disabled={index === 0}
            title="Previous branch"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs font-medium text-foreground truncate">
            {currentBranchName}
          </span>
          <span className="text-xs text-muted-foreground shrink-0">
            ({index + 1} of {count})
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={onNext}
            disabled={index === count - 1}
            title="Next branch"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {(onDelete || onRename) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Branch Actions</DropdownMenuLabel>
            {onRename && (
              <DropdownMenuItem
                onClick={() => {
                  const name = prompt("Enter branch name:", currentBranchName);
                  if (name) onRename(index, name);
                }}
              >
                Rename Branch
              </DropdownMenuItem>
            )}
            {onDelete && count > 1 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    if (confirm("Delete this branch?")) {
                      onDelete(index);
                    }
                  }}
                  className="text-destructive"
                >
                  Delete Branch
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

