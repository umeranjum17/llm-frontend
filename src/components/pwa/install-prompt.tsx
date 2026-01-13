"use client";

import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePWA } from "@/hooks/use-pwa";
import { cn } from "@/lib/utils";

export function InstallPrompt() {
  const { isInstallable, install, dismissInstall } = usePWA();

  if (!isInstallable) return null;

  return (
    <div
      className={cn(
        "fixed bottom-20 left-4 right-4 z-50 md:bottom-4 md:left-auto md:right-4 md:max-w-sm",
        "animate-in slide-in-from-bottom-4 fade-in duration-300"
      )}
    >
      <div className="flex items-center gap-3 rounded-lg border bg-background/95 p-4 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Download className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 space-y-1">
          <p className="text-sm font-medium">Install Lumina</p>
          <p className="text-xs text-muted-foreground">
            Add to your home screen for quick access
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={install}>
            Install
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={dismissInstall}
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Dismiss</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
