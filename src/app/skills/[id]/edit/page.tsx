"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams, useParams } from "next/navigation";
import { SkillEditorShell } from "@/components/skill-editor/skill-editor-shell";
import { getSkillById } from "@/lib/db/queries";
import type { Skill } from "@/lib/db/schema";

const SKILL_PREFILL_KEY = "skillEditorPrefill";

export default function EditSkillPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const skillId = params.id as string;
  const urlReturnTo = searchParams.get("returnTo");
  const [skill, setSkill] = useState<Skill | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSkill() {
      try {
        const existingSkill = await getSkillById(skillId);
        if (!existingSkill) {
          // Skill not found, redirect to settings
          router.push("/settings?tab=skills");
          return;
        }
        setSkill(existingSkill);
      } catch (error) {
        console.error("Failed to load skill:", error);
        router.push("/settings?tab=skills");
      } finally {
        setLoading(false);
      }
    }

    loadSkill();
  }, [skillId, router]);

  const handleCancel = () => {
    if (urlReturnTo) {
      router.push(urlReturnTo);
    } else {
      router.push("/settings?tab=skills");
    }
  };

  const handleSave = () => {
    if (urlReturnTo) {
      router.push(urlReturnTo);
    } else {
      router.push("/settings?tab=skills");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Loading skill...</p>
        </div>
      </div>
    );
  }

  if (!skill) {
    return null;
  }

  return (
    <SkillEditorShell
      mode="edit"
      existingSkill={skill}
      onCancel={handleCancel}
      onSave={handleSave}
    />
  );
}
