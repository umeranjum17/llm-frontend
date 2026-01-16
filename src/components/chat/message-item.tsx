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

/** Human-friendly tool name mappings */
const TOOL_DISPLAY_NAMES: Record<string, string> = {
  // Web & Search
  webSearch: "Web Search",
  COMPOSIO_SEARCH_TOOLS: "Finding tools",
  COMPOSIO_MULTI_EXECUTE_TOOL: "Executing actions",
  MULTI_EXECUTE_TOOL: "Executing actions",
  COMPOSIO_REMOTE_WORKBENCH: "Processing data",
  COMPOSIO_GET_TOOL_SCHEMAS: "Loading tool details",

  // Reddit
  REDDIT_SEARCH_ACROSS_SUBREDDITS: "Searching Reddit",
  REDDIT_RETRIEVE_REDDIT_POST: "Getting Reddit posts",
  REDDIT_RETRIEVE_POST_COMMENTS: "Reading comments",
  REDDIT_RETRIEVE_SPECIFIC_COMMENT: "Getting comment",
  REDDIT_POST_REDDIT_COMMENT: "Posting comment",
  REDDIT_CREATE_REDDIT_POST: "Creating post",
  REDDIT_GET_USER_FLAIR: "Getting user flair",

  // GitHub
  GITHUB_CREATE_ISSUE: "Creating issue",
  GITHUB_GET_ISSUE: "Getting issue",
  GITHUB_LIST_ISSUES: "Listing issues",
  GITHUB_CREATE_PULL_REQUEST: "Creating PR",
  GITHUB_GET_PULL_REQUEST: "Getting PR",
  GITHUB_MERGE_PULL_REQUEST: "Merging PR",
  GITHUB_LIST_REPOS: "Listing repos",
  GITHUB_GET_REPO: "Getting repo info",
  GITHUB_SEARCH_CODE: "Searching code",

  // Email
  GMAIL_SEND_EMAIL: "Sending email",
  GMAIL_GET_EMAIL: "Reading email",
  GMAIL_LIST_EMAILS: "Listing emails",
  GMAIL_CREATE_DRAFT: "Creating draft",

  // Calendar
  GOOGLE_CALENDAR_CREATE_EVENT: "Creating event",
  GOOGLE_CALENDAR_LIST_EVENTS: "Listing events",
  GOOGLE_CALENDAR_GET_EVENT: "Getting event",

  // Slack
  SLACK_SEND_MESSAGE: "Sending message",
  SLACK_LIST_CHANNELS: "Listing channels",
  SLACK_GET_CHANNEL: "Getting channel",

  // Twitter/X
  TWITTER_POST_TWEET: "Posting tweet",
  TWITTER_SEARCH_TWEETS: "Searching tweets",
  TWITTER_GET_USER: "Getting user profile",
};

/** Extract a friendly tool name from namespaced MCP tool names */
function getToolDisplayName(name: string): string {
  let toolName = name;

  // Strip MCP prefix patterns like "mcp_abc123_" or "mcp_gt2yps_"
  // Format: mcp_{serverId}_{TOOL_NAME}
  const mcpMatch = toolName.match(/^mcp_[a-z0-9]+_(.+)$/i);
  if (mcpMatch) {
    toolName = mcpMatch[1];
  }

  // Handle double-underscore namespaced tools like "server_id__TOOL_NAME"
  if (toolName.includes("__")) {
    toolName = toolName.split("__").pop() || toolName;
  }

  // Check for known friendly names
  if (TOOL_DISPLAY_NAMES[toolName]) {
    return TOOL_DISPLAY_NAMES[toolName];
  }

  // Convert SCREAMING_SNAKE_CASE to Title Case
  if (toolName.includes("_")) {
    return toolName
      .split("_")
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  }

  // camelCase to Title Case
  return toolName
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim();
}

/** Extract nested tool names from MULTI_EXECUTE_TOOL args */
function extractNestedTools(toolName: string, args: unknown): string[] {
  // Strip MCP prefix to get base tool name
  const mcpMatch = toolName.match(/^mcp_[a-z0-9]+_(.+)$/i);
  const baseName = mcpMatch ? mcpMatch[1] : toolName;

  // Check if this is a multi-execute tool
  if (!baseName.includes("MULTI_EXECUTE") && !baseName.includes("EXECUTE_TOOL")) {
    return [];
  }

  // Extract tool_slug from args.tools array
  const argsObj = args as { tools?: Array<{ tool_slug?: string }> };
  if (!argsObj?.tools || !Array.isArray(argsObj.tools)) {
    return [];
  }

  const toolSlugs = argsObj.tools
    .map(t => t.tool_slug)
    .filter((slug): slug is string => !!slug)
    .map(slug => getToolDisplayName(slug));

  // Dedupe and return
  return [...new Set(toolSlugs)];
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

  // Get unique friendly tool names for summary, expanding nested tools
  const toolSummary = [...new Set(toolEvents.flatMap(e => {
    const nested = extractNestedTools(e.name, e.args);
    return nested.length > 0 ? nested : [getToolDisplayName(e.name)];
  }))];
  const summaryText = toolSummary.length <= 3
    ? toolSummary.join(", ")
    : `${toolSummary.slice(0, 2).join(", ")} +${toolSummary.length - 2} more`;

  return (
    <div className="mt-3 border rounded-lg bg-muted/30 overflow-hidden">
      {/* Collapsed header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0" />
        )}
        <Wrench className="h-3.5 w-3.5 shrink-0" />
        <span className="font-medium truncate">
          {summaryText}
        </span>
        <span className="text-xs opacity-70 flex items-center gap-2 shrink-0">
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

            // Extract nested tools from MULTI_EXECUTE_TOOL args
            const nestedTools = extractNestedTools(toolEvent.name, toolEvent.args);

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
                  <div className="flex items-center gap-2 text-sm font-medium flex-wrap">
                    {status === "running" && <Loader2 className="h-3.5 w-3.5 animate-spin text-yellow-500" />}
                    {status === "done" && <Check className="h-3.5 w-3.5 text-green-500" />}
                    {status === "error" && <XIcon className="h-3.5 w-3.5 text-red-500" />}

                    {/* Show nested tools directly if available, otherwise show generic name */}
                    {nestedTools.length > 0 ? nestedTools.join(", ") : displayName}

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

/** Pipeline progress display section (during streaming) */
function PipelineProgressSection({
  pipelineExecution,
}: {
  pipelineExecution: PipelineExecution;
}) {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

  if (!pipelineExecution) return null;

  const toggleStep = (stepId: string) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }
      return next;
    });
  };

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

        <div className="space-y-1">
          {pipelineExecution.steps.map((step, index) => {
            const isExpanded = expandedSteps.has(step.id);
            const hasDetails = step.input || step.output || (step.toolCalls && step.toolCalls.length > 0);
            const canExpand = hasDetails && (step.status === "complete" || step.status === "running");

            return (
              <div key={step.id} className="space-y-0.5">
                <div
                  className={cn(
                    "flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors",
                    step.status === "running" && "bg-blue-500/10",
                    step.status === "complete" && "bg-green-500/5",
                    step.status === "error" && "bg-red-500/10",
                    canExpand && "cursor-pointer hover:bg-blue-500/15"
                  )}
                  onClick={() => canExpand && toggleStep(step.id)}
                >
                  {/* Expand/collapse indicator */}
                  {canExpand ? (
                    isExpanded ? (
                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    )
                  ) : (
                    <div className="w-3" />
                  )}
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
                  {step.status === "complete" && step.toolCalls && step.toolCalls.length > 0 && (
                    <span className="text-xs text-amber-600 dark:text-amber-400">
                      🔧 {step.toolCalls.length} tool{step.toolCalls.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="ml-4 pl-3 border-l-2 border-blue-500/30 space-y-2 py-1">
                    {/* Input */}
                    {step.input && (
                      <div className="space-y-0.5">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                          Input
                        </div>
                        <div className="text-xs bg-muted/50 rounded p-2 font-mono whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                          {step.input}
                        </div>
                      </div>
                    )}

                    {/* Tool calls */}
                    {step.toolCalls && step.toolCalls.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                          Tools Used
                        </div>
                        {step.toolCalls.map((tc, tcIndex) => (
                          <div key={tcIndex} className="text-xs bg-amber-500/10 rounded p-2">
                            <span className="text-amber-600 dark:text-amber-400 font-mono font-medium">
                              {tc.toolName}
                            </span>
                            {tc.args && Object.keys(tc.args).length > 0 && (
                              <div className="mt-1 text-muted-foreground font-mono text-[10px]">
                                Args: {JSON.stringify(tc.args, null, 2)}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Output */}
                    {step.output && (
                      <div className="space-y-0.5">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                          Output
                        </div>
                        <div className="text-xs bg-green-500/10 rounded p-2 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                          {typeof step.output === "string"
                            ? step.output
                            : typeof step.output === "object" && step.output?.type === "image"
                              ? `🖼️ Image generated`
                              : JSON.stringify(step.output, null, 2)
                          }
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
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

/** Pipeline execution details (persisted, after completion) */
function PipelineExecutionDetails({
  pipelineExecution,
}: {
  pipelineExecution: {
    steps: Array<{
      id: string;
      name: string;
      type: "llm" | "image" | "tool" | "subagent";
      input?: string;
      output?: any;
      toolCalls?: Array<{ toolName: string; args: any; result?: any }>;
    }>;
    agentName?: string;
  };
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

  if (!pipelineExecution?.steps?.length) return null;

  const toggleStep = (stepId: string) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) {
        next.delete(stepId);
      } else {
        next.add(stepId);
      }
      return next;
    });
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

  const totalToolCalls = pipelineExecution.steps.reduce(
    (acc, step) => acc + (step.toolCalls?.length || 0),
    0
  );

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
        <Bot className="h-3.5 w-3.5" />
        <span className="font-medium">
          {pipelineExecution.agentName || "Pipeline"} ({pipelineExecution.steps.length} steps)
        </span>
        {totalToolCalls > 0 && (
          <span className="text-xs text-amber-600 dark:text-amber-400">
            🔧 {totalToolCalls} tool{totalToolCalls !== 1 ? "s" : ""}
          </span>
        )}
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-3 pb-3 border-t border-border/50 space-y-1.5 pt-2">
          {pipelineExecution.steps.map((step, index) => {
            const isStepExpanded = expandedSteps.has(step.id);
            const hasDetails = step.input || step.output || (step.toolCalls && step.toolCalls.length > 0);

            return (
              <div key={step.id} className="space-y-0.5">
                <div
                  className={cn(
                    "flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors bg-background/50",
                    hasDetails && "cursor-pointer hover:bg-muted/50"
                  )}
                  onClick={() => hasDetails && toggleStep(step.id)}
                >
                  {/* Expand/collapse indicator */}
                  {hasDetails ? (
                    isStepExpanded ? (
                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    )
                  ) : (
                    <div className="w-3" />
                  )}
                  <Check className="h-3.5 w-3.5 text-green-500" />
                  <span className="text-sm">{getStepTypeIcon(step.type)}</span>
                  <span className="text-sm flex-1">{step.name}</span>
                  {step.toolCalls && step.toolCalls.length > 0 && (
                    <span className="text-xs text-amber-600 dark:text-amber-400">
                      🔧 {step.toolCalls.length}
                    </span>
                  )}
                </div>

                {/* Expanded details */}
                {isStepExpanded && hasDetails && (
                  <div className="ml-4 pl-3 border-l-2 border-muted-foreground/20 space-y-2 py-1">
                    {/* Input */}
                    {step.input && (
                      <div className="space-y-0.5">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                          Input
                        </div>
                        <div className="text-xs bg-muted/50 rounded p-2 font-mono whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                          {step.input}
                        </div>
                      </div>
                    )}

                    {/* Tool calls */}
                    {step.toolCalls && step.toolCalls.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                          Tools Used
                        </div>
                        {step.toolCalls.map((tc, tcIndex) => (
                          <div key={tcIndex} className="text-xs bg-amber-500/10 rounded p-2">
                            <span className="text-amber-600 dark:text-amber-400 font-mono font-medium">
                              {tc.toolName}
                            </span>
                            {tc.args && Object.keys(tc.args).length > 0 && (
                              <div className="mt-1 text-muted-foreground font-mono text-[10px]">
                                Args: {JSON.stringify(tc.args, null, 2)}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Output */}
                    {step.output && (
                      <div className="space-y-0.5">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
                          Output
                        </div>
                        <div className="text-xs bg-green-500/10 rounded p-2 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                          {typeof step.output === "string"
                            ? step.output
                            : typeof step.output === "object" && step.output?.type === "image"
                              ? `🖼️ Image generated`
                              : JSON.stringify(step.output, null, 2)
                          }
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
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
                      <MarkdownRenderer content={textContent} isStreaming={isStreaming} />
                      {isStreaming && (
                        <span className="inline-block w-2 h-4 ml-0.5 bg-primary/70 animate-pulse" />
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

              {/* Pipeline execution details (persisted, after completion) */}
              {!isEditing && isAssistant && !isStreaming && message.pipelineExecution && (
                <PipelineExecutionDetails pipelineExecution={message.pipelineExecution} />
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
