"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { RefreshCw, X } from "lucide-react";
import { usePWA } from "@/hooks/use-pwa";
import { UpdateOverlay } from "./update-overlay";
import { useLoadingStore } from "@/stores/loading-store";

export function UpdatePrompt() {
  const { isUpdateAvailable, update } = usePWA();
  const hasShownToast = useRef(false);
  const toastIdRef = useRef<string | number | undefined>(undefined);
  
  const { isPwaUpdating, pwaUpdateStatus, pwaUpdateMessage } = useLoadingStore();

  useEffect(() => {
    if (isUpdateAvailable && !hasShownToast.current) {
      hasShownToast.current = true;

      toastIdRef.current = toast("Update Available", {
        description: "A new version of Lumina is ready. The app will briefly reload after updating.",
        duration: Infinity,
        icon: <RefreshCw className="h-4 w-4" />,
        action: {
          label: "Update Now",
          onClick: () => {
            toast.dismiss(toastIdRef.current);
            update();
          },
        },
        cancel: {
          label: "Later",
          onClick: () => {
            toast.dismiss(toastIdRef.current);
            hasShownToast.current = false; // Allow showing again on next update check
          },
        },
      });
    }
  }, [isUpdateAvailable, update]);

  // Dismiss toast when update starts
  useEffect(() => {
    if (isPwaUpdating && toastIdRef.current) {
      toast.dismiss(toastIdRef.current);
    }
  }, [isPwaUpdating]);

  return (
    <UpdateOverlay
      isVisible={isPwaUpdating}
      status={pwaUpdateStatus}
      message={pwaUpdateMessage}
      onRetry={() => {
        window.location.reload();
      }}
      onCancel={() => {
        useLoadingStore.getState().setPwaUpdating(false);
      }}
    />
  );
}
