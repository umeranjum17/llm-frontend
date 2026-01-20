"use client";

import { useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Shield, ChevronDown, Lock, Server, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function TrustPanel() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="rounded-lg border bg-muted/30 overflow-hidden">
        <CollapsibleTrigger className="flex items-center gap-2 w-full p-3 text-left hover:bg-muted/50 transition-colors">
          <Shield className="h-4 w-4 text-green-600 shrink-0" />
          <span className="text-xs font-medium flex-1">How we use your key</span>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              isOpen && "transform rotate-180"
            )}
          />
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-3 pb-3 pt-1 space-y-2.5 text-xs text-muted-foreground">
            <div className="flex items-start gap-2">
              <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <p>Encrypted locally on your device</p>
            </div>
            <div className="flex items-start gap-2">
              <Server className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <p>Never sent to our servers</p>
            </div>
            <div className="flex items-start gap-2">
              <Trash2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <p>Delete anytime in Settings</p>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
