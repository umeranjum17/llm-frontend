"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Plus, X, Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSkillEditorForm } from "@/hooks/use-skill-editor-form";
import { toast } from "sonner";

export function TriggersStep() {
  const {
    triggerPhrases,
    exclusionQueries,
    autoTrigger,
    requireApproval,
    errors,
    setField,
  } = useSkillEditorForm();

  const [newTriggerPhrase, setNewTriggerPhrase] = useState("");
  const [newExclusionKeyword, setNewExclusionKeyword] = useState("");

  const handleAddTriggerPhrase = () => {
    const phrase = newTriggerPhrase.trim();
    if (!phrase) return;
    if (triggerPhrases.some((t) => t.toLowerCase() === phrase.toLowerCase())) {
      toast.error("Trigger phrase already exists");
      return;
    }
    setField("triggerPhrases", [...triggerPhrases, phrase]);
    setNewTriggerPhrase("");
  };

  const handleRemoveTriggerPhrase = (phrase: string) => {
    setField(
      "triggerPhrases",
      triggerPhrases.filter((p) => p !== phrase)
    );
  };

  const handleAddExclusionKeyword = () => {
    const keyword = newExclusionKeyword.trim();
    if (!keyword) return;
    if (exclusionQueries.includes(keyword)) {
      toast.error("Exclusion already exists");
      return;
    }
    setField("exclusionQueries", [...exclusionQueries, keyword]);
    setNewExclusionKeyword("");
  };

  const handleRemoveExclusionKeyword = (keyword: string) => {
    setField(
      "exclusionQueries",
      exclusionQueries.filter((k) => k !== keyword)
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-2">Triggers</h2>
        <p className="text-sm text-muted-foreground">
          Configure when and how this skill should be activated
        </p>
      </div>

      {/* Auto-trigger toggle */}
      <div className="space-y-3 rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <div>
            <Label>Auto-trigger</Label>
            <p className="text-xs text-muted-foreground mt-1">
              Automatically activate this skill based on message content
            </p>
          </div>
          <Switch
            checked={autoTrigger}
            onCheckedChange={(checked) => setField("autoTrigger", checked)}
          />
        </div>

        <div className="flex items-center justify-between pt-3 border-t">
          <div>
            <Label>Require Approval</Label>
            <p className="text-xs text-muted-foreground mt-1">
              Show draft and ask for confirmation before using tools
            </p>
          </div>
          <Switch
            checked={requireApproval}
            onCheckedChange={(checked) => setField("requireApproval", checked)}
          />
        </div>
      </div>

      {/* Trigger Phrases - only show for auto-trigger skills */}
      {autoTrigger && (
        <div className="space-y-2">
          <Label>
            Trigger Phrases{" "}
            <span className="text-muted-foreground text-xs">
              (queries that activate this skill)
            </span>
          </Label>

          {triggerPhrases.length > 0 && (
            <div className="flex flex-wrap gap-2 p-2 rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30">
              {triggerPhrases.map((phrase, index) => (
                <Badge
                  key={index}
                  variant="secondary"
                  className="gap-1 pr-1 text-sm bg-green-100 dark:bg-green-900/50"
                >
                  {phrase}
                  <button
                    type="button"
                    onClick={() => handleRemoveTriggerPhrase(phrase)}
                    className="ml-1 rounded-full p-0.5 hover:bg-destructive/20 hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <Input
              value={newTriggerPhrase}
              onChange={(e) => setNewTriggerPhrase(e.target.value)}
              placeholder="e.g., Generate an AI image of..."
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddTriggerPhrase();
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleAddTriggerPhrase}
              disabled={!newTriggerPhrase.trim()}
              className="border-green-300 hover:bg-green-50 dark:border-green-700"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Add example queries that should trigger this skill. More examples =
            better matching.
          </p>
          {errors.triggerPhrases && (
            <p className="text-xs text-destructive">{errors.triggerPhrases}</p>
          )}
        </div>
      )}

      {/* Exclusion Queries - only show for auto-trigger skills */}
      {autoTrigger && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Label>
              Exclusion Queries{" "}
              <span className="text-muted-foreground text-xs">
                (negative examples)
              </span>
            </Label>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-xs">
                    Exclusion queries reduce the match score by applying a
                    penalty to prevent false positives. Use these to specify
                    queries that should NOT trigger this skill.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {exclusionQueries.length > 0 && (
            <div className="flex flex-wrap gap-2 p-2 rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30">
              {exclusionQueries.map((keyword, index) => (
                <Badge
                  key={index}
                  variant="secondary"
                  className="gap-1 pr-1 text-sm bg-red-100 dark:bg-red-900/50"
                >
                  {keyword}
                  <button
                    type="button"
                    onClick={() => handleRemoveExclusionKeyword(keyword)}
                    className="ml-1 rounded-full p-0.5 hover:bg-destructive/20 hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <Input
              value={newExclusionKeyword}
              onChange={(e) => setNewExclusionKeyword(e.target.value)}
              placeholder="e.g., Build a website..."
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddExclusionKeyword();
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleAddExclusionKeyword}
              disabled={!newExclusionKeyword.trim()}
              className="border-red-300 hover:bg-red-50 dark:border-red-700"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Queries that should NOT trigger this skill. These penalize the match
            score to prevent false positives.
          </p>
        </div>
      )}
    </div>
  );
}
