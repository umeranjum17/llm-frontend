"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { usePWA } from "@/hooks/use-pwa";

export function UpdatePrompt() {
  const { isUpdateAvailable, update } = usePWA();
  const hasShownToast = useRef(false);

  useEffect(() => {
    if (isUpdateAvailable && !hasShownToast.current) {
      hasShownToast.current = true;

      toast("Update Available", {
        description: "A new version of Lumina is ready.",
        duration: Infinity,
        icon: <RefreshCw className="h-4 w-4" />,
        action: {
          label: "Refresh",
          onClick: () => {
            update();
          },
        },
      });
    }
  }, [isUpdateAvailable, update]);

  return null;
}
