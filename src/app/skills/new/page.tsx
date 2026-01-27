"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { SkillEditorShell } from "@/components/skill-editor/skill-editor-shell";

export default function NewSkillPage() {
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
