"use client";

import { useState } from "react";
import { useSettingsStore } from "@/stores/settings-store";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { LuminaTrigger } from "./lumina-sidebar-widget/lumina-trigger";
import { LuminaPopoverContent } from "./lumina-sidebar-widget/lumina-popover-content";
import { LuminaDisabledCTA } from "./lumina-sidebar-widget/lumina-disabled-cta";
import { useMediaQuery } from "@/hooks/use-media-query";

export function LuminaSidebarWidget() {
  const clawEnabled = useSettingsStore((s) => s.clawEnabled);
  const [open, setOpen] = useState(false);
  const isMobile = useMediaQuery("(max-width: 640px)");

  const content = clawEnabled ? <LuminaPopoverContent /> : <LuminaDisabledCTA />;

  // On mobile, use a bottom Sheet instead of Popover (works better inside parent Sheet)
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <LuminaTrigger />
        </SheetTrigger>
        <SheetContent
          side="bottom"
          className="p-0 rounded-t-xl max-h-[85vh] overflow-auto"
          hideCloseButton
        >
          <SheetTitle className="sr-only">Lumina Agent</SheetTitle>
          {content}
        </SheetContent>
      </Sheet>
    );
  }

  // On desktop, use Popover
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <LuminaTrigger />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={8}
        collisionPadding={12}
        className="w-[min(36rem,calc(100vw-1.5rem))] max-w-[36rem] max-h-[85vh] overflow-hidden p-0 shadow-lg"
      >
        {content}
      </PopoverContent>
    </Popover>
  );
}
