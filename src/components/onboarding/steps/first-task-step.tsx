"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createChat, addMessage } from "@/lib/db/queries";
import { useApiKeysStore } from "@/stores/api-keys-store";
import { useSettingsStore } from "@/stores/settings-store";
import { Loader2, Sparkles, Info, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const PROMPTS_BY_USE_CASE: Record<string, string> = {
  chat: "What are 3 tips for writing better code?",
  code: "Write a function that reverses a string in JavaScript",
  research: "Summarize the key differences between React and Vue",
  agents: "Explain how AI agents can automate tasks",
};

interface FirstTaskStepProps {
  useCase: string;
  providerId: string;
  onComplete: (chatId: string) => void;
}

export function FirstTaskStep({
  useCase,
  providerId,
  onComplete,
}: FirstTaskStepProps) {
  const { getKeyForProvider } = useApiKeysStore();
  const { defaultModelId } = useSettingsStore();
  const [prompt, setPrompt] = useState(
    PROMPTS_BY_USE_CASE[useCase] || PROMPTS_BY_USE_CASE.chat
  );
  const [isRunning, setIsRunning] = useState(false);
  const [response, setResponse] = useState("");
  const [chatId, setChatId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apiKey = getKeyForProvider(providerId);

  const runTask = async () => {
    if (!prompt.trim() || !apiKey) return;

    setIsRunning(true);
    setError(null);
    setResponse("");

    try {
      // Determine model to use
      const modelId = defaultModelId || "anthropic/claude-3.5-sonnet";

      // Create a new chat
      const chat = await createChat({
        title: "First Task",
        projectId: "personal",
        modelId,
      });
      setChatId(chat.id);

      // Add user message
      await addMessage({
        chatId: chat.id,
        role: "user",
        content: prompt.trim(),
      });

      // Stream response from chat API
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId,
          modelId,
          messages: [
            {
              role: "user",
              content: prompt.trim(),
            },
          ],
          enabledTools: [], // No tools for onboarding
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to get response from AI");
      }

      // Stream the response
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let accumulatedText = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("0:")) {
              const text = line.slice(2).trim();
              if (text) {
                accumulatedText += text;
                setResponse(accumulatedText);
              }
            }
          }
        }
      }

      // Save assistant message
      await addMessage({
        chatId: chat.id,
        role: "assistant",
        content: accumulatedText,
        modelId,
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again."
      );
    } finally {
      setIsRunning(false);
    }
  };

  const hasResponse = response.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Try your first task</h1>
        <p className="text-muted-foreground">
          Run a quick prompt to see it in action
        </p>
      </div>

      {/* Prompt Input */}
      {!hasResponse && (
        <div className="space-y-3 pt-2">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            className="resize-none"
            placeholder="Enter your prompt..."
            autoFocus
            disabled={isRunning}
          />
          <Button
            onClick={runTask}
            disabled={!prompt.trim() || isRunning}
            className="w-full h-11 gap-2"
            size="lg"
          >
            {isRunning ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Run
              </>
            )}
          </Button>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Response Display */}
      {hasResponse && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {/* User Message */}
          <div className="flex justify-end">
            <div className="max-w-[80%] rounded-lg bg-primary px-4 py-3 text-primary-foreground">
              <p className="text-sm whitespace-pre-wrap">{prompt}</p>
            </div>
          </div>

          {/* Assistant Response */}
          <div className="flex justify-start">
            <div className="max-w-[80%] space-y-3">
              <div className="rounded-lg border bg-card px-4 py-3">
                <p className="text-sm whitespace-pre-wrap leading-relaxed">
                  {response}
                  {isRunning && (
                    <span className="inline-block w-1 h-4 ml-1 bg-foreground animate-pulse" />
                  )}
                </p>
              </div>

              {/* Metadata */}
              {!isRunning && (
                <div className="flex items-center gap-4 text-xs text-muted-foreground px-1">
                  <span>Provider: {providerId}</span>
                  <span>Tools: None</span>
                  <span>Memory: Off</span>
                </div>
              )}
            </div>
          </div>

          {/* Info Bar */}
          {!isRunning && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                This chat was saved and is available in your chat history. You can
                continue the conversation from the main chat interface.
              </AlertDescription>
            </Alert>
          )}

          {/* Continue Button */}
          {!isRunning && chatId && (
            <Button
              onClick={() => onComplete(chatId)}
              className="w-full h-11 gap-2"
              size="lg"
            >
              Continue
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
