"use client";

import { useState } from "react";
import {
  AlertTriangle,
  MessageCircleQuestion,
  XCircle,
  Lightbulb,
  Send,
  X,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLuminaStore } from "@/stores/lumina-store";
import { useSettingsStore } from "@/stores/settings-store";
import { toast } from "sonner";

export function ClawActionRequired() {
  const questions = useLuminaStore((s) => s.questions);
  const tasks = useLuminaStore((s) => s.tasks);
  const initiatives = useLuminaStore((s) => s.initiatives);
  const answerQuestion = useLuminaStore((s) => s.answerQuestion);
  const dismissQuestion = useLuminaStore((s) => s.dismissQuestion);
  const clawUrl = useSettingsStore((s) => s.clawUrl);

  const [answerInputs, setAnswerInputs] = useState<Record<string, string>>({});
  const [answering, setAnswering] = useState<string | null>(null);

  const failedTasks = tasks.filter((t) => t.status === "failed");
  const proposedInitiatives = initiatives.filter(
    (i) => i.status === "proposed"
  );
  const hasAnything =
    questions.length > 0 ||
    failedTasks.length > 0 ||
    proposedInitiatives.length > 0;

  if (!hasAnything) return null;

  const dashboardUrl = clawUrl
    ? `${clawUrl.replace(/\/$/, "")}/dashboard`
    : "http://localhost:8000/dashboard";

  const handleAnswer = async (id: string) => {
    const answer = answerInputs[id]?.trim();
    if (!answer) return;
    setAnswering(id);
    try {
      await answerQuestion(id, answer);
      setAnswerInputs((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      toast.success("Answer sent");
    } catch {
      toast.error("Failed to send answer");
    }
    setAnswering(null);
  };

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-4 py-3 bg-amber-500/5">
        <AlertTriangle className="h-4 w-4 text-amber-500" />
        <h3 className="text-sm font-medium text-amber-700 dark:text-amber-400">
          Action Required
        </h3>
      </div>

      <div className="p-4 space-y-3">
        {/* Questions — expanded with inline answers (max 3) */}
        {questions.length > 0 && (
          <div className="space-y-2">
            {questions.slice(0, 3).map((q) => (
              <div key={q.id} className="flex items-start gap-2">
                <MessageCircleQuestion className="h-4 w-4 text-amber-500 shrink-0 mt-2" />
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="text-sm">{q.question}</p>
                  <div className="flex gap-1.5">
                    <Input
                      value={answerInputs[q.id] || ""}
                      onChange={(e) =>
                        setAnswerInputs((prev) => ({
                          ...prev,
                          [q.id]: e.target.value,
                        }))
                      }
                      onKeyDown={(e) =>
                        e.key === "Enter" && handleAnswer(q.id)
                      }
                      placeholder="Answer..."
                      aria-label="Answer question"
                      className="h-7 text-xs"
                      disabled={answering === q.id}
                    />
                    <Button
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => handleAnswer(q.id)}
                      disabled={
                        answering === q.id || !answerInputs[q.id]?.trim()
                      }
                      aria-label="Send answer"
                    >
                      {answering === q.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Send className="h-3 w-3" />
                      )}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0 text-muted-foreground"
                      onClick={async () => {
                        try {
                          await dismissQuestion(q.id);
                        } catch {
                          toast.error("Failed to dismiss question");
                        }
                      }}
                      aria-label="Dismiss question"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {questions.length > 3 && (
              <p className="text-xs text-muted-foreground pl-6">
                +{questions.length - 3} more question
                {questions.length - 3 !== 1 ? "s" : ""}
              </p>
            )}
          </div>
        )}

        {/* Count-only summary for failed tasks + proposals */}
        {(failedTasks.length > 0 || proposedInitiatives.length > 0) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground pt-1 border-t">
            {failedTasks.length > 0 && (
              <span className="flex items-center gap-1">
                <XCircle className="h-3.5 w-3.5 text-red-500" />
                {failedTasks.length} failed task
                {failedTasks.length !== 1 ? "s" : ""}
              </span>
            )}
            {proposedInitiatives.length > 0 && (
              <span className="flex items-center gap-1">
                <Lightbulb className="h-3.5 w-3.5 text-violet-500" />
                {proposedInitiatives.length} pending proposal
                {proposedInitiatives.length !== 1 ? "s" : ""}
              </span>
            )}
            <a
              href={dashboardUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-xs text-primary hover:underline"
            >
              Review in dashboard
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
