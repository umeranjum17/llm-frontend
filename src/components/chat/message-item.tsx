"use client";

import { useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";  // Need to import or use a basic textarea
import { Copy, Check, User, Bot, CornerDownRight, Pencil, X as XIcon, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import type { Message } from "@/lib/db/schema";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import type { SearchResult, WebSearchResponse } from "@/lib/tools/web-search";

type ToolCallLike = {
  id?: string;
  toolCallId?: string;
  name?: string;
  toolName?: string;
  args?: unknown;
};

type ToolResultLike = {
  id?: string;
  toolCallId?: string;
  name?: string;
  toolName?: string;
  args?: unknown;
  result?: unknown;
};

function isWebSearchResponse(value: unknown): value is WebSearchResponse {
  if (!value || typeof value !== "object") return false;
  const v = value as { provider?: unknown; query?: unknown; results?: unknown };
  return (
    typeof v.provider === "string" &&
    typeof v.query === "string" &&
    Array.isArray(v.results)
  );
}

interface MessageItemProps {
  message: Message;
  onContinue?: (messageId: string) => void;
  onEdit?: (messageId: string, newContent: string) => void;
  isContinuing?: boolean;
}

export function MessageItem({
  message,
  onContinue,
  onEdit,
  isContinuing,
}: MessageItemProps) {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);

  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";

  const toolCalls = (Array.isArray(message.toolCalls) ? message.toolCalls : []) as ToolCallLike[];
  const toolResults = (Array.isArray(message.toolResults) ? message.toolResults : []) as ToolResultLike[];

  const toolResultsById = new Map<string, ToolResultLike>();
  for (const toolResult of toolResults) {
    const id = toolResult.id || toolResult.toolCallId;
    if (id) toolResultsById.set(id, toolResult);
  }

  const toolEventIds = new Set<string>();
  const toolEvents: Array<{
    key: string;
    id?: string;
    name: string;
    args?: unknown;
    result?: unknown;
  }> = [];

  for (let i = 0; i < toolCalls.length; i++) {
    const toolCall = toolCalls[i];
    const id = toolCall.id || toolCall.toolCallId;
    const name = toolCall.name || toolCall.toolName || "Tool";
    const result = id ? toolResultsById.get(id)?.result : undefined;
    const key = id || `tool-call-${i}`;

    toolEvents.push({ key, id, name, args: toolCall.args, result });
    if (id) toolEventIds.add(id);
  }

  for (let i = 0; i < toolResults.length; i++) {
    const toolResult = toolResults[i];
    const id = toolResult.id || toolResult.toolCallId;
    if (id && toolEventIds.has(id)) continue;
    const name = toolResult.name || toolResult.toolName || "Tool";
    const key = id || `tool-result-${i}`;
    toolEvents.push({ key, id, name, args: toolResult.args, result: toolResult.result });
  }

  const handleCopySources = async (results: SearchResult[]) => {
    const markdown = results
      .map((r, idx) => `${idx + 1}. [${r.title}](${r.url})`)
      .join("\n");
    await navigator.clipboard.writeText(markdown);
    toast.success("Sources copied");
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveEdit = async () => {
    if (editContent.trim() === message.content) {
      setIsEditing(false);
      return;
    }
    if (onEdit) {
      onEdit(message.id, editContent);
      setIsEditing(false);
    }
  };

  // Don't render system messages in the UI
  if (message.role === "system") {
    return null;
  }

  return (
    <div
      className={cn(
        "group relative px-4 py-6 hover:bg-accent/50 transition-colors",
        isUser && "bg-muted/30"
      )}
    >
      <div className="mx-auto max-w-3xl">
        <div className="flex gap-4">
          {/* Avatar */}
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback>
              {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
            </AvatarFallback>
          </Avatar>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-semibold">
                {isUser ? "You" : "Assistant"}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(message.createdAt), {
                  addSuffix: true,
                })}
              </span>
            </div>

            {/* Editing Mode */}
            {isEditing ? (
              <div className="space-y-2">
                <Textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="min-h-[100px]"
                />
                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)}>
                    <XIcon className="h-4 w-4 mr-2" /> Cancel
                  </Button>
                  <Button size="sm" onClick={handleSaveEdit}>
                    <Send className="h-4 w-4 mr-2" /> Save & Regenerate
                  </Button>
                </div>
              </div>
            ) : (
              /* Message content */
              <div className="prose prose-sm dark:prose-invert max-w-none">
                {isAssistant ? (
                  <MarkdownRenderer content={message.content} />
                ) : (
                  <p className="whitespace-pre-wrap">{message.content}</p>
                )}
              </div>
            )}

            {/* Continue button for incomplete responses */}
            {!isEditing && isAssistant && message.canContinue && onContinue && (
              <div className="mt-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onContinue(message.id)}
                  disabled={isContinuing}
                  className="gap-2"
                >
                  <CornerDownRight className="h-4 w-4" />
                  {isContinuing ? "Continuing..." : "Continue Response"}
                </Button>
              </div>
            )}

            {/* Incomplete indicator */}
            {isAssistant && message.isIncomplete && !message.canContinue && (
              <div className="mt-2 text-xs text-muted-foreground italic">
                (Response was continued below)
              </div>
            )}

            {/* Tool calls/results */}
            {!isEditing && isAssistant && toolEvents.length > 0 && (
              <div className="mt-4 space-y-2">
                {toolEvents.map((toolEvent) => {
                  const isWebSearch =
                    toolEvent.name === "webSearch" && isWebSearchResponse(toolEvent.result);
                  const webSearch = isWebSearch ? (toolEvent.result as WebSearchResponse) : null;

                  return (
                  <div
                    key={toolEvent.key}
                    className="rounded-lg border bg-muted/50"
                  >
                    <div className="flex items-center justify-between px-3 py-2">
                      <div className="text-sm font-medium">
                        {toolEvent.name === "webSearch" ? "Web Search" : toolEvent.name}
                        {webSearch?.query ? (
                          <span className="ml-2 text-xs text-muted-foreground">
                            “{webSearch.query}”
                          </span>
                        ) : null}
                      </div>
                      {webSearch && webSearch.results.length > 0 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs gap-2"
                          onClick={() => handleCopySources(webSearch.results)}
                          title="Copy sources"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          Copy
                        </Button>
                      ) : null}
                    </div>

                    <div className="px-3 pb-3 text-sm">
                      {webSearch ? (
                        <div className="space-y-2">
                          <div className="text-xs text-muted-foreground">
                            Provider: {webSearch.provider}
                            {webSearch.error ? ` • ${webSearch.error}` : ""}
                          </div>
                          <ol className="space-y-2">
                            {webSearch.results.map((r, idx) => (
                              <li key={`${r.url}-${idx}`} className="space-y-1">
                                <a
                                  href={r.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-medium hover:underline break-words"
                                >
                                  {idx + 1}. {r.title}
                                </a>
                                {r.publishedDate ? (
                                  <div className="text-xs text-muted-foreground">
                                    {r.publishedDate}
                                  </div>
                                ) : null}
                                {r.snippet ? (
                                  <div className="text-xs text-muted-foreground">
                                    {r.snippet}
                                  </div>
                                ) : null}
                              </li>
                            ))}
                          </ol>
                        </div>
                      ) : (
                        <pre className="text-xs text-muted-foreground overflow-x-auto">
                          {JSON.stringify(
                            {
                              args: toolEvent.args,
                              result: toolEvent.result,
                            },
                            null,
                            2
                          )}
                        </pre>
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Actions */}
          {!isEditing && (
            <div className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleCopy}
                title="Copy message"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
              {isUser && onEdit && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setIsEditing(true)}
                  title="Edit message"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
