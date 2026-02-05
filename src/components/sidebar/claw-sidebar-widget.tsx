"use client";

import { useSettingsStore } from "@/stores/settings-store";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ClawTrigger } from "./claw-sidebar-widget/claw-trigger";
import { ClawPopoverContent } from "./claw-sidebar-widget/claw-popover-content";
import { ClawDisabledCTA } from "./claw-sidebar-widget/claw-disabled-cta";

export function ClawSidebarWidget() {
  const clawEnabled = useSettingsStore((s) => s.clawEnabled);

  // Show inviting CTA when Claw is not enabled
  if (!clawEnabled) {
    return (
      <Popover modal>
        <PopoverTrigger asChild>
          <ClawTrigger />
        </PopoverTrigger>
        <PopoverContent
          align="end"
          side="bottom"
          sideOffset={8}
          className="w-[min(18rem,90vw)] p-0 shadow-lg z-[60]"
        >
          <ClawDisabledCTA />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Popover modal>
      <PopoverTrigger asChild>
        <ClawTrigger />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={8}
        className="w-[min(20rem,90vw)] p-0 shadow-lg z-[60]"
      >
        <ClawPopoverContent />
      </PopoverContent>
    </Popover>
  );
}
