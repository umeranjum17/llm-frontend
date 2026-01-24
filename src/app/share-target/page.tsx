"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { SkeletonLoader } from "@/components/ui/skeleton";

function ShareTargetContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const title = searchParams?.get("title") || "";
    const text = searchParams?.get("text") || "";
    const url = searchParams?.get("url") || "";

    // Combine shared content into a message
    const sharedContent = [title, text, url].filter(Boolean).join("\n\n");

    if (sharedContent) {
      // Store in sessionStorage for the main page to pick up
      sessionStorage.setItem("shared-content", sharedContent);
    }

    // Redirect to home with new chat flag
    router.replace("/?new=true");
  }, [router, searchParams]);

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Processing shared content...</p>
      </div>
    </div>
  );
}

export default function ShareTargetPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center">
        <SkeletonLoader variant="page" />
      </div>
    }>
      <ShareTargetContent />
    </Suspense>
  );
}
