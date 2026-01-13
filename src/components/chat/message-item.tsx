"use client";

import { useState, memo, useMemo } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Copy, Check, User, Bot, CornerDownRight, Pencil, X as XIcon, Send, GitBranch, RotateCcw, Download, ThumbsUp, ThumbsDown, Volume2, VolumeX, ChevronDown, ChevronRight, Wrench, Loader2, Brain, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import type { Message } from "@/lib/db/schema";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import type { SearchResult, WebSearchResponse } from "@/lib/tools/web-search";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { getImagesFromMessageContent, getTextFromMessageContent, isMessageContentParts } from "@/lib/utils/message-content";
import { updateMessage } from "@/lib/db/queries";
import { useVoiceOutput } from "@/hooks/use-voice-output";
import { parseArtifactFences } from "@/lib/utils/artifact-fence-parser";
import { useUIStore } from "@/stores/ui-store";
import { useStreamingStore, type PipelineExecution } from "@/stores/streaming-store";
import { nanoid } from "nanoid";
import { Code2 } from "lucide-react";

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

/** Extract a friendly tool name from namespaced MCP tool names */
function getToolDisplayName(name: string): string {
  // Handle namespaced MCP tools like "server_id__TOOL_NAME"
  if (name.includes("__")) {
    const toolPart = name.split("__").pop() || name;
    // Convert SCREAMING_SNAKE_CASE to Title Case
    return toolPart
      .split("_")
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  }
  return name === "webSearch" ? "Web Search" : name;
}

/** Collapsible section for tool calls */
function ToolCallsSection({
  toolEvents,
  onCopySources,
}: {
  toolEvents: Array<{
    key: string;
    id?: string;
    name: string;
    args?: unknown;
    result?: unknown;
    startTime?: number;
    endTime?: number;
  }>;
  onCopySources: (results: SearchResult[]) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Calculate overall status
  // A tool is considered "running" if we haven't received a tool result yet.
  // Do not use truthiness of `result` because some tools can legitimately return falsy values.
  const runningCount = toolEvents.filter(e => e.endTime === undefined).length;
  const errorCount = toolEvents.filter(e => e.result && (e.result as any).isError).length;
  const doneCount = toolEvents.length - runningCount - errorCount;

  return (
    <div className="mt-3 border rounded-lg bg-muted/30 overflow-hidden">
      {/* Collapsed header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
        <Wrench className="h-3.5 w-3.5" />
        <span className="font-medium">
          {toolEvents.length} tool{toolEvents.length !== 1 ? "s" : ""} used
        </span>
        <span className="text-xs opacity-70 flex items-center gap-2">
          {runningCount > 0 && <span className="text-yellow-600 flex items-center gap-0.5"><Loader2 className="h-3 w-3 animate-spin" /> {runningCount} running</span>}
        </span>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-border/50">
          {toolEvents.map((toolEvent) => {
            const isWebSearch =
              toolEvent.name === "webSearch" && isWebSearchResponse(toolEvent.result);
            const webSearch = isWebSearch ? (toolEvent.result as WebSearchResponse) : null;
            const displayName = getToolDisplayName(toolEvent.name);

            // Determine status
            let status: "running" | "done" | "error" = "running";
            if (toolEvent.endTime !== undefined) status = "done";
            if ((toolEvent.result as any)?.isError) status = "error";

            // Calculate duration
            let duration: string | null = null;
            if (toolEvent.startTime && toolEvent.endTime) {
              const ms = toolEvent.endTime - toolEvent.startTime;
              duration = ms > 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
            }

            return (
              <div
                key={toolEvent.key}
                className={cn(
                  "mt-2 rounded-lg border overflow-hidden",
                  status === "error" ? "bg-red-50/50 border-red-200 dark:bg-red-900/10 dark:border-red-900/30" : "bg-background/50"
                )}
              >
                <div className="flex items-center justify-between px-3 py-2 bg-muted/30">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {status === "running" && <Loader2 className="h-3.5 w-3.5 animate-spin text-yellow-500" />}
                    {status === "done" && <Check className="h-3.5 w-3.5 text-green-500" />}
                    {status === "error" && <XIcon className="h-3.5 w-3.5 text-red-500" />}

                    {displayName}
                    {webSearch?.query ? (
                      <span className="text-xs text-muted-foreground font-normal">
                        &quot;{webSearch.query}&quot;
                      </span>
                    ) : null}

                    {duration && (
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-normal ml-2">
                        {duration}
                      </Badge>
                    )}
                  </div>
                  {webSearch && webSearch.results.length > 0 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs gap-2"
                      onClick={() => onCopySources(webSearch.results)}
                      title="Copy sources"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Copy
                    </Button>
                  ) : null}
                </div>

                <div className="px-3 py-2 text-sm">
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
                    <details className="group">
                      <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                        View details
                      </summary>
                      <pre className="mt-2 text-xs text-muted-foreground overflow-x-auto max-h-60 overflow-y-auto">
                        {JSON.stringify(
                          {
                            args: toolEvent.args,
                            result: toolEvent.result,
                          },
                          null,
                          2
                        )}
                      </pre>
                    </details>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Collapsible section for thinking/reasoning */
function ThinkingSection({
  reasoning,
  isStreaming,
}: {
  reasoning: string;
  isStreaming?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!reasoning) return null;

  return (
    <div className="mb-3 border rounded-lg bg-purple-500/5 border-purple-500/20 overflow-hidden">
      {/* Collapsed header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-purple-600 dark:text-purple-400 hover:bg-purple-500/10 transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
        <Brain className="h-3.5 w-3.5" />
        <span className="font-medium">Thinking</span>
        {isStreaming && (
          <span className="flex items-center gap-1 text-xs opacity-70">
            <Loader2 className="h-3 w-3 animate-spin" />
            thinking...
          </span>
        )}
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-3 pb-3 border-t border-purple-500/20">
          <div className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap font-mono text-xs leading-relaxed max-h-96 overflow-y-auto">
            {reasoning}
            {isStreaming && (
              <span className="inline-block w-1.5 h-3 ml-0.5 bg-purple-500/70 animate-pulse" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Pipeline progress display section */
function PipelineProgressSection({
  pipelineExecution,
}: {
  pipelineExecution: PipelineExecution;
}) {
  if (!pipelineExecution) return null;

  const getStepIcon = (status: string) => {
    switch (status) {
      case "running":
        return <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />;
      case "complete":
        return <Check className="h-3.5 w-3.5 text-green-500" />;
      case "error":
        return <XIcon className="h-3.5 w-3.5 text-red-500" />;
      default:
        return <div className="h-3.5 w-3.5 rounded-full border-2 border-muted-foreground/30" />;
    }
  };

  const getStepTypeIcon = (type: string) => {
    switch (type) {
      case "llm":
        return "💬";
      case "image":
        return "🎨";
      case "tool":
        return "🔧";
      case "subagent":
        return "🤖";
      default:
        return "📝";
    }
  };

  return (
    <div className="mb-3 border rounded-lg bg-blue-500/5 border-blue-500/20 overflow-hidden">
      <div className="px-3 py-2 text-sm text-blue-600 dark:text-blue-400">
        <div className="flex items-center gap-2 mb-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="font-medium">Pipeline Progress</span>
          <span className="text-xs text-muted-foreground">
            {pipelineExecution.steps.filter(s => s.status === "complete").length}/{pipelineExecution.totalSteps} steps
          </span>
        </div>

        <div className="space-y-1.5">
          {pipelineExecution.steps.map((step, index) => (
            <div
              key={step.id}
              className={cn(
                "flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors",
                step.status === "running" && "bg-blue-500/10",
                step.status === "complete" && "opacity-60",
                step.status === "error" && "bg-red-500/10"
              )}
            >
              {getStepIcon(step.status)}
              <span className="text-sm">{getStepTypeIcon(step.type)}</span>
              <span className={cn(
                "text-sm flex-1",
                step.status === "running" && "font-medium"
              )}>
                {step.name}
              </span>
              {step.status === "running" && (
                <span className="text-xs text-muted-foreground animate-pulse">
                  in progress...
                </span>
              )}
              {step.status === "error" && step.error && (
                <span className="text-xs text-red-500 truncate max-w-32">
                  {step.error}
                </span>
              )}
            </div>
          ))}
        </div>

        {pipelineExecution.error && (
          <div className="mt-2 text-xs text-red-500 bg-red-500/10 px-2 py-1 rounded">
            Pipeline failed: {pipelineExecution.error}
          </div>
        )}
      </div>
    </div>
  );
}

interface MessageItemProps {
  message: Message;
  onContinue?: (messageId: string) => void;
  onEdit?: (messageId: string, newContent: string) => void;
  onFork?: (messageId: string) => void;
  onRegenerate?: (assistantMessageId: string) => void;
  onResend?: (userMessageId: string) => void;
  isContinuing?: boolean;
  // Props passed from parent to bypass memo issues
  streamingContentProp?: string;
  streamingVersionProp?: number;
}

export const MessageItem = memo(function MessageItem({
  message,
  onContinue,
  onEdit,
  onFork,
  onRegenerate,
  onResend,
  isContinuing,
  streamingContentProp,
  streamingVersionProp,
}: MessageItemProps) {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(getTextFromMessageContent(message.content));
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [loadedImages, setLoadedImages] = useState<Record<string, boolean>>({});
  const [showMobileActions, setShowMobileActions] = useState(false);
  const { speak, stop, isPlaying } = useVoiceOutput();
  const { setActiveArtifact, setShowArtifacts } = useUIStore();

  // Get streaming state for real-time updates
  // Include streamingVersion to ensure re-renders on each content update
  const { streamingMessageId, streamingContent, streamingReasoning, streamingToolCalls, streamingToolResults, streamingVersion, pipelineExecution } = useStreamingStore();
  const isStreaming = message.id === streamingMessageId;

  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const images = getImagesFromMessageContent(message.content);

  // Use streaming content if this message is currently being streamed
  // Prefer prop over store to ensure memo sees the change
  const effectiveStreamingContent = streamingContentProp ?? streamingContent;
  const textContent = isStreaming && effectiveStreamingContent
    ? effectiveStreamingContent
    : getTextFromMessageContent(message.content);

  // Use streaming reasoning if available, otherwise fall back to persisted reasoning
  const reasoningContent = isStreaming && streamingReasoning
    ? streamingReasoning
    : message.reasoning || "";

  // Track if we're actively streaming reasoning (reasoning is appearing but response hasn't started)
  const isStreamingReasoning = isStreaming && !!streamingReasoning && !streamingContent;

  const artifactFiles = useMemo(() => isAssistant ? parseArtifactFences(textContent) : [], [isAssistant, textContent]);
  const hasMultipleFiles = artifactFiles.length > 0;

  const canEdit = isUser && onEdit && !isMessageContentParts(message.content);
  const canFork = isUser && !!onFork;
  const canRegenerate = isAssistant && !!onRegenerate;
  const canResend = isUser && !!onResend;

  // Use streaming tool data if available, otherwise fall back to message data
  const toolCalls = (isStreaming && streamingToolCalls.length > 0
    ? streamingToolCalls
    : (Array.isArray(message.toolCalls) ? message.toolCalls : [])) as ToolCallLike[];
  const toolResults = (isStreaming && streamingToolResults.length > 0
    ? streamingToolResults
    : (Array.isArray(message.toolResults) ? message.toolResults : [])) as ToolResultLike[];

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
    startTime?: number;
    endTime?: number;
  }> = [];

  for (let i = 0; i < toolCalls.length; i++) {
    const toolCall = toolCalls[i];
    const id = toolCall.id || toolCall.toolCallId;
    const name = toolCall.name || toolCall.toolName || "Tool";
    // @ts-ignore
    const resultObj = id ? toolResultsById.get(id) : undefined;
    const result = resultObj?.result;
    // @ts-ignore
    const endTime = resultObj?.endTime;
    const key = id || `tool-call-${i}`;

    toolEvents.push({
      key,
      id,
      name,
      args: toolCall.args,
      result,
      // @ts-ignore
      startTime: toolCall.startTime,
      endTime
    });
    if (id) toolEventIds.add(id);
  }

  for (let i = 0; i < toolResults.length; i++) {
    const toolResult = toolResults[i];
    const id = toolResult.id || toolResult.toolCallId;
    if (id && toolEventIds.has(id)) continue;
    const name = toolResult.name || toolResult.toolName || "Tool";
    const key = id || `tool-result-${i}`;
    toolEvents.push({
      key,
      id,
      name,
      args: toolResult.args,
      result: toolResult.result,
      // @ts-ignore
      endTime: toolResult.endTime
    });
  }

  const handleCopySources = async (results: SearchResult[]) => {
    const markdown = results
      .map((r, idx) => `${idx + 1}. [${r.title}](${r.url})`)
      .join("\n");
    await navigator.clipboard.writeText(markdown);
    toast.success("Sources copied");
  };

  const handleCopy = async () => {
    const payload = images.length > 0 ? `${textContent}\n\n${images.join("\n")}` : textContent;
    await navigator.clipboard.writeText(payload);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveEdit = async () => {
    if (editContent.trim() === textContent) {
      setIsEditing(false);
      return;
    }
    if (onEdit) {
      onEdit(message.id, editContent);
      setIsEditing(false);
    }
  };

  const handleRate = async (rating: "up" | "down") => {
    if (message.rating === rating) {
      // Toggle off if clicking same rating
      // @ts-ignore - dexie update allows undefined but typescript might complain if strict
      await updateMessage(message.id, { rating: undefined });
    } else {
      await updateMessage(message.id, { rating });
    }
  };

  const handleOpenProject = () => {
    if (artifactFiles.length === 0) return;

    // Convert array to map
    const filesRecord: Record<string, string> = {};
    artifactFiles.forEach(f => {
      filesRecord[f.path] = f.code;
    });

    setActiveArtifact({
      id: nanoid(),
      title: "Generated Project",
      code: "", // Multi-file projects don't have single code
      language: "project",
      type: "project",
      files: filesRecord,
      template: "react" // Default to react, or logic to infer
    });
    setShowArtifacts(true);
  };

  // Don't render system messages in the UI
  if (message.role === "system") {
    return null;
  }

  return (
    <div
      className={cn(
        "group relative px-2 sm:px-4 py-3 sm:py-6"
      )}
      onClick={() => {
        // Toggle mobile actions on tap (only on touch devices)
        if (window.matchMedia("(hover: none)").matches) {
          setShowMobileActions(!showMobileActions);
        }
      }}
    >
      <div className="mx-auto max-w-3xl">
        <div className="flex gap-2 sm:gap-4">
          {/* Avatar - hidden on mobile for more space */}
          <Avatar className="h-8 w-8 shrink-0 ring-1 ring-border hidden sm:flex">
            <AvatarFallback>
              {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
            </AvatarFallback>
          </Avatar>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div
              className={cn(
                "rounded-xl sm:rounded-2xl border p-2.5 sm:p-4",
                isUser
                  ? "bg-primary/10 border-primary/20"
                  : "bg-card/40 backdrop-blur-sm border-border/50"
              )}
            >
              <div className="mb-1.5 sm:mb-2 flex items-center gap-1.5 sm:gap-2">
                <span className={cn(
                  "text-xs sm:text-sm font-semibold",
                  isUser ? "text-primary" : "text-foreground"
                )}>
                  {isUser ? "You" : "Assistant"}
                </span>
                <span className="text-[10px] sm:text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(message.createdAt), {
                    addSuffix: true,
                  })}
                </span>
              </div>

              {/* Pipeline Progress Section (for pipeline agents) */}
              {!isEditing && isAssistant && isStreaming && pipelineExecution?.isActive && (
                <PipelineProgressSection pipelineExecution={pipelineExecution} />
              )}

              {/* Thinking/Reasoning Section (for assistant messages with extended thinking) */}
              {!isEditing && isAssistant && reasoningContent && (
                <ThinkingSection
                  reasoning={reasoningContent}
                  isStreaming={isStreamingReasoning}
                />
              )}

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
                    <>
                      {isStreaming ? (
                        // During streaming: show plain text for performance (no markdown parsing)
                        <p className="whitespace-pre-wrap">{textContent}<span className="inline-block w-2 h-4 ml-0.5 bg-primary/70 animate-pulse" /></p>
                      ) : (
                        // After streaming: render full markdown
                        <MarkdownRenderer content={textContent} />
                      )}
                    </>
                  ) : (
                    <p className="whitespace-pre-wrap">{textContent}</p>
                  )}
                </div>
              )}

              {/* Message Metadata (Tokens/Cost) */}
              {!isEditing && isAssistant && (message.inputTokens || message.outputTokens) && (
                <div className="mt-3 flex items-center gap-3 text-[10px] text-muted-foreground/60 font-medium border-t border-border/30 pt-2">
                  <div className="flex gap-1.5">
                    <span>In: <span className="text-muted-foreground">{message.inputTokens?.toLocaleString() || 0}</span></span>
                    <span>Out: <span className="text-muted-foreground">{message.outputTokens?.toLocaleString() || 0}</span></span>
                    <span className="font-bold opacity-80">Total: <span className="text-muted-foreground">{((message.inputTokens || 0) + (message.outputTokens || 0)).toLocaleString()}</span></span>
                  </div>
                  {typeof message.cost === "number" && (
                    <div className="ml-auto flex items-center gap-1.5 bg-primary/5 px-1.5 py-0.5 rounded border border-primary/10 text-primary/70">
                      <span>${message.cost.toFixed(4)}</span>
                      {message.costIsEstimated && (
                        <span className="text-[9px] uppercase tracking-wide text-muted-foreground/70">
                          est
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Images */}
              {!isEditing && images.length > 0 && (
                <>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {images.map((url) => (
                      <button
                        key={url}
                        type="button"
                        onClick={() => setLightboxUrl(url)}
                        className="relative overflow-hidden rounded-lg border bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
                        title="Open image"
                      >
                        <div
                          className={cn(
                            "absolute inset-0 bg-muted",
                            loadedImages[url] ? "opacity-0" : "animate-pulse"
                          )}
                        />
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt="Attachment"
                          loading="lazy"
                          className={cn(
                            "h-40 w-full object-cover",
                            loadedImages[url] ? "opacity-100" : "opacity-0"
                          )}
                          onLoad={() =>
                            setLoadedImages((prev) => ({ ...prev, [url]: true }))
                          }
                        />
                      </button>
                    ))}
                  </div>

                  <Dialog open={!!lightboxUrl} onOpenChange={(open) => !open && setLightboxUrl(null)}>
                    <DialogContent className="max-w-4xl p-2">
                      {lightboxUrl ? (
                        <div className="relative">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={lightboxUrl}
                            alt="Image"
                            className="max-h-[80vh] w-full object-contain"
                          />
                          <Button
                            variant="secondary"
                            size="sm"
                            className="absolute bottom-4 right-4 gap-2"
                            onClick={() => {
                              const link = document.createElement("a");
                              link.href = lightboxUrl;
                              link.download = `image-${Date.now()}.png`;
                              link.target = "_blank";
                              document.body.appendChild(link);
                              link.click();
                              document.body.removeChild(link);
                            }}
                          >
                            <Download className="h-4 w-4" />
                            Download
                          </Button>
                        </div>
                      ) : null}
                    </DialogContent>
                  </Dialog>
                </>
              )}

              {/* Multi-file project button */}
              {!isEditing && isAssistant && hasMultipleFiles && (
                <div className="mt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleOpenProject}
                    className="gap-2"
                  >
                    <Code2 className="h-4 w-4" />
                    Open Project ({artifactFiles.length} files)
                  </Button>
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

              {/* Tool calls/results - collapsible */}
              {!isEditing && isAssistant && toolEvents.length > 0 && (
                <ToolCallsSection toolEvents={toolEvents} onCopySources={handleCopySources} />
              )}

              {/* Mobile Actions - Inside bubble */}
              {!isEditing && showMobileActions && (
                <div className="sm:hidden flex items-center gap-1 mt-2 pt-2 border-t border-border/30 flex-wrap">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    onClick={(e) => { e.stopPropagation(); handleCopy(); }}
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                  {isAssistant && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn("h-7 px-2", isPlaying && "text-primary")}
                      onClick={(e) => { e.stopPropagation(); isPlaying ? stop() : speak(textContent); }}
                    >
                      {isPlaying ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                    </Button>
                  )}
                  {canRegenerate && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={(e) => { e.stopPropagation(); onRegenerate?.(message.id); }}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {canResend && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={(e) => { e.stopPropagation(); onResend?.(message.id); }}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  {isAssistant && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        onClick={(e) => { e.stopPropagation(); handleRate("up"); }}
                      >
                        <ThumbsUp className={cn("h-3.5 w-3.5", message.rating === "up" && "fill-current text-green-500")} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        onClick={(e) => { e.stopPropagation(); handleRate("down"); }}
                      >
                        <ThumbsDown className={cn("h-3.5 w-3.5", message.rating === "down" && "fill-current text-red-500")} />
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Desktop Actions - Outside bubble */}
          {!isEditing && (
            <div className="hidden sm:flex shrink-0 opacity-0 group-hover:opacity-100 transition-opacity flex-col gap-1">
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
              {isAssistant && (
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn("h-8 w-8 text-muted-foreground", isPlaying && "text-primary")}
                  onClick={() => isPlaying ? stop() : speak(textContent)}
                  title={isPlaying ? "Stop" : "Read aloud"}
                >
                  {isPlaying ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </Button>
              )}
              {canFork && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => onFork?.(message.id)}
                  title="Fork from here"
                >
                  <GitBranch className="h-4 w-4" />
                </Button>
              )}
              {canRegenerate && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => onRegenerate?.(message.id)}
                  title="Regenerate (new branch)"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              )}
              {canResend && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => onResend?.(message.id)}
                  title="Resend message"
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              )}
              {canEdit && (
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
              {isAssistant && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleRate("up")}
                    title="Good response"
                  >
                    <ThumbsUp className={cn("h-4 w-4", message.rating === "up" && "fill-current text-green-500")} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleRate("down")}
                    title="Bad response"
                  >
                    <ThumbsDown className={cn("h-4 w-4", message.rating === "down" && "fill-current text-red-500")} />
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div >
  );
});
