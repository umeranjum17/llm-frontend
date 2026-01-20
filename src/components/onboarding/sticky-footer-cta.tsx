"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface StickyFooterCtaProps {
  primaryLabel: string;
  primaryIcon?: ReactNode;
  onPrimaryClick: () => void;
  primaryDisabled?: boolean;
  primaryLoading?: boolean;
  secondaryLabel?: string;
  secondaryIcon?: ReactNode;
  onSecondaryClick?: () => void;
  secondaryDisabled?: boolean;
  className?: string;
}

export function StickyFooterCta({
  primaryLabel,
  primaryIcon,
  onPrimaryClick,
  primaryDisabled,
  primaryLoading,
  secondaryLabel,
  secondaryIcon,
  onSecondaryClick,
  secondaryDisabled,
  className,
}: StickyFooterCtaProps) {
  return (
    <div
      className={cn(
        "sticky bottom-0 left-0 right-0 z-50 border-t bg-background/80 backdrop-blur-lg",
        "md:hidden", // Only visible on mobile
        className
      )}
    >
      <div className="container max-w-2xl mx-auto p-4 flex gap-3">
        {secondaryLabel && onSecondaryClick && (
          <Button
            variant="outline"
            onClick={onSecondaryClick}
            disabled={secondaryDisabled}
            className="flex-1 h-11 gap-2"
          >
            {secondaryIcon}
            {secondaryLabel}
          </Button>
        )}
        <Button
          onClick={onPrimaryClick}
          disabled={primaryDisabled || primaryLoading}
          className="flex-1 h-11 gap-2"
        >
          {primaryIcon}
          {primaryLabel}
        </Button>
      </div>
    </div>
  );
}
