"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SkillEditorShell } from "@/components/skill-editor/skill-editor-shell";

function NewSkillContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlReturnTo = searchParams.get("returnTo");

  // Note: sessionStorage prefill data is read and cleared by SkillEditorShell

  const handleCancel = () => {
    // Check if there's a returnTo in URL or sessionStorage
    if (urlReturnTo) {
      router.push(urlReturnTo);
    } else {
      router.push("/settings?tab=skills");
    }
  };

  const handleSave = () => {
    // After save, navigate to returnTo or settings
    if (urlReturnTo) {
      router.push(urlReturnTo);
    } else {
      router.push("/settings?tab=skills");
    }
  };

  return (
    <SkillEditorShell
      mode="create"
      onCancel={handleCancel}
      onSave={handleSave}
    />
  );
}

export default function NewSkillPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen">Loading...</div>}>
      <NewSkillContent />
    </Suspense>
  );
}
