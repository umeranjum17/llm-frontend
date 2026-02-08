"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { MessageCircleQuestion, Send, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLuminaStore } from "@/stores/lumina-store";

function formatRelativeTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return formatDistanceToNow(date, { addSuffix: true });
}

export function LuminaQuestionsTab() {
  const isConnected = useLuminaStore((s) => s.isConnected);
  const questions = useLuminaStore((s) => s.questions);
  const refreshQuestions = useLuminaStore((s) => s.refreshQuestions);
  const answerQuestion = useLuminaStore((s) => s.answerQuestion);
  const dismissQuestion = useLuminaStore((s) => s.dismissQuestion);

  const [answers, setAnswers] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isConnected) {
      void refreshQuestions();
    }
  }, [isConnected, refreshQuestions]);

  const handleAnswerChange = (id: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  };

  const handleSubmit = async (id: string) => {
    const answer = answers[id]?.trim();
    if (!answer) return;
    await answerQuestion(id, answer);
    setAnswers((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handleDismiss = async (id: string) => {
    await dismissQuestion(id);
    setAnswers((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  if (questions.length === 0) {
    return (
      <div className="rounded-lg border bg-card py-16 text-center">
        <MessageCircleQuestion className="mx-auto h-8 w-8 text-muted-foreground/50 mb-3" />
        <p className="text-sm text-muted-foreground">No pending questions</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {questions.map((q) => (
        <div
          key={q.id}
          className="rounded-lg border bg-card p-4 space-y-3"
        >
          <div className="space-y-1">
            <p className="font-medium text-sm">{q.question}</p>
            {q.context && (
              <p className="text-xs text-muted-foreground">{q.context}</p>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {q.scheduleId && (
              <Badge variant="outline" className="text-[10px]">
                Schedule: {q.scheduleId}
              </Badge>
            )}
            {q.taskId && (
              <Badge variant="outline" className="text-[10px]">
                Task: {q.taskId}
              </Badge>
            )}
            <span className="text-[10px] text-muted-foreground/70">
              {formatRelativeTime(q.createdAt)}
            </span>
          </div>

          <div className="flex gap-2">
            <Input
              placeholder="Type your answer..."
              value={answers[q.id] ?? ""}
              onChange={(e) => handleAnswerChange(q.id, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSubmit(q.id);
                }
              }}
              className="h-8 text-sm"
            />
            <Button
              type="button"
              size="sm"
              className="h-8 text-xs shrink-0"
              disabled={!answers[q.id]?.trim()}
              onClick={() => void handleSubmit(q.id)}
            >
              <Send className="mr-1 h-3 w-3" />
              Submit
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 text-xs shrink-0"
              onClick={() => void handleDismiss(q.id)}
            >
              <X className="mr-1 h-3 w-3" />
              Dismiss
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
