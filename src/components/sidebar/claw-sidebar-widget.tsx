"use client";

import { useSettingsStore } from "@/stores/settings-store";
import { useClawStore } from "@/stores/claw-store";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ClawTrigger } from "./claw-sidebar-widget/claw-trigger";
import { ClawPopoverContent } from "./claw-sidebar-widget/claw-popover-content";
import { ClawDisabledCTA } from "./claw-sidebar-widget/claw-disabled-cta";

export function ClawSidebarWidget() {
  const clawEnabled = useSettingsStore((s) => s.clawEnabled);
  const isConnected = useClawStore((s) => s.isConnected);
  const isConnecting = useClawStore((s) => s.isConnecting);
  const error = useClawStore((s) => s.error);

  // Show inviting CTA when Claw is not enabled
  if (!clawEnabled) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <ClawTrigger disabled />
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={8}
          className="w-[min(18rem,90vw)] p-0 shadow-lg"
        >
          <ClawDisabledCTA />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <ClawTrigger
          isConnected={isConnected}
          isConnecting={isConnecting}
          hasError={!!error}
        />
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[min(20rem,90vw)] p-0 shadow-lg"
      >
        <ClawPopoverContent />
      </PopoverContent>
    </Popover>
  );
}
