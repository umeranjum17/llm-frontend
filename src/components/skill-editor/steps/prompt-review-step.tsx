"use client";

import { useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSkillEditorForm } from "@/hooks/use-skill-editor-form";
import { buildVariablesFromTemplate } from "@/lib/utils/prompt-variables";

export function PromptReviewStep() {
  const { systemPrompt, userTemplate, errors, setField, touchField, originalSkill } =
    useSkillEditorForm();

  const variables = useMemo(
    () => buildVariablesFromTemplate(userTemplate, originalSkill?.variables),
    [userTemplate, originalSkill?.variables]
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-2">Prompts & Review</h2>
        <p className="text-sm text-muted-foreground">
          Define the AI behavior and review your skill
        </p>
      </div>

      {/* System Prompt */}
      <div className="space-y-2">
        <Label htmlFor="systemPrompt">
          System Prompt <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="systemPrompt"
          value={systemPrompt}
          onChange={(e) => setField("systemPrompt", e.target.value)}
          onBlur={() => touchField("systemPrompt")}
          className={`min-h-[180px] font-mono text-sm ${
            errors.systemPrompt ? "border-destructive" : ""
          }`}
          placeholder="Instructions for the AI when this skill is active..."
        />
        {errors.systemPrompt && (
          <p className="text-xs text-destructive">{errors.systemPrompt}</p>
        )}
      </div>

      {/* User Template (Optional) */}
      <div className="space-y-2">
        <Label htmlFor="userTemplate">
          User Template{" "}
          <span className="text-muted-foreground text-xs">(optional)</span>
        </Label>
        <Textarea
          id="userTemplate"
          value={userTemplate}
          onChange={(e) => setField("userTemplate", e.target.value)}
          className="min-h-[100px] font-mono text-sm"
          placeholder="Optional template with {{variables}}"
        />
        {variables.length > 0 && (
          <div className="rounded-lg border p-3 text-sm">
            <div className="font-medium mb-2">Detected variables</div>
            <div className="flex flex-wrap gap-2">
              {variables.map((v) => (
                <span
                  key={v.name}
                  className="rounded bg-muted px-2 py-0.5 text-xs"
                >
                  {`{{${v.name}}}`}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
