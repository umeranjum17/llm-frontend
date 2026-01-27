"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SkillEditorShell } from "@/components/skill-editor/skill-editor-shell";

const SKILL_PREFILL_KEY = "skillEditorPrefill";

export default function NewSkillPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlReturnTo = searchParams.get("returnTo");

  useEffect(() => {
    // Read prefill data from sessionStorage
    const stored = sessionStorage.getItem(SKILL_PREFILL_KEY);
    if (stored) {
      try {
        const { data, returnTo } = JSON.parse(stored);
        // Data will be loaded by SkillEditorShell
        // Clear after reading to prevent stale data
        sessionStorage.removeItem(SKILL_PREFILL_KEY);
      } catch (error) {
        console.error("Failed to parse prefill data:", error);
        sessionStorage.removeItem(SKILL_PREFILL_KEY);
      }
    }
  }, []);

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
