"use client";

import { useState, memo, useMemo, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Copy, Check, User, Bot, CornerDownRight, Pencil, X as XIcon, Send, GitBranch, RotateCcw, Download, ThumbsUp, ThumbsDown, Volume2, VolumeX, ChevronDown, ChevronRight, Wrench, Loader2, Brain, RefreshCw, Pin, PinOff, AlertTriangle, FileText } from "lucide-react";
import { usePrefersReducedMotion } from "@/hooks/use-motion-config";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { SkeletonText } from "@/components/ui/skeleton";
import type { Message } from "@/lib/db/schema";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { getImagesFromMessageContent, getTextFromMessageContent, isMessageContentParts } from "@/lib/utils/message-content";
import { updateMessage } from "@/lib/db/queries";
import { useVoiceOutput } from "@/hooks/use-voice-output";
import { parseArtifactFences } from "@/lib/utils/artifact-fence-parser";
import { useUIStore } from "@/stores/ui-store";
import { useStreamingStore, type PipelineExecution, type ImageGenerationProgress, type ImageGenerationStage } from "@/stores/streaming-store";
import { nanoid } from "nanoid";
import { Code2 } from "lucide-react";
import { ActiveSkillIndicator, SkillBadge } from "@/components/chat/active-skill-indicator";
import { InlineApprovalCard, type InlineApprovalData } from "@/components/chat/inline-approval-card";
import { MentionRenderer } from "@/components/chat/mention-renderer";
import { useLiveQuery } from "dexie-react-hooks";
import { getSkillById } from "@/lib/db/queries";
import { toggleMessagePin } from "@/lib/utils/context-compaction";
import { SelectionCopyToolbar } from "@/components/chat/selection-copy-toolbar";
import { useLuminaStore } from "@/stores/lumina-store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type ToolCallLike = {
  id?: string;
  toolCallId?: string;
  taskId?: string;
  name?: string;
  toolName?: string;
  toolLabel?: string;
  args?: unknown;
  startTime?: number;
  endTime?: number;
};

type ToolResultLike = {
  id?: string;
  toolCallId?: string;
  taskId?: string;
  name?: string;
  toolName?: string;
  toolLabel?: string;
  args?: unknown;
  result?: unknown;
  startTime?: number;
  endTime?: number;
};


/** Human-friendly tool name mappings */
const TOOL_DISPLAY_NAMES: Record<string, string> = {
  // Composio Tools
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

  // Strip COMPOSIO_ prefix
  if (toolName.startsWith("COMPOSIO_")) {
    toolName = toolName.replace("COMPOSIO_", "");
  }

  // Check for known friendly names
  if (TOOL_DISPLAY_NAMES[toolName]) {
    return TOOL_DISPLAY_NAMES[toolName];
  }

  // Convert SCREAMING_SNAKE_CASE to Title Case
  if (toolName.includes("_")) {
    return toolName
      .split("_")
      .filter(word => word.toLowerCase() !== "composio") // Filter composio from parts
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  }

  // camelCase to Title Case
  return toolName
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .replace(/composio/gi, '') // Remove composio
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

/** Image generation progress indicator */
function ImageGenerationProgressIndicator({
  progress,
}: {
  progress: ImageGenerationProgress;
}) {
  const stages: { key: ImageGenerationStage; label: string; description: string }[] = [
    { key: "validating", label: "Validating", description: "Checking model compatibility..." },
    { key: "optimizing", label: "Optimizing", description: "Crafting enhanced prompt..." },
    { key: "generating", label: "Generating", description: "Creating your image..." },
    { key: "processing", label: "Processing", description: "Finalizing image..." },
  ];

  const currentIndex = stages.findIndex(s => s.key === progress.stage);

  return (
    <div className="flex flex-col gap-3 py-4">
      <div className="flex items-center gap-2 text-sm font-medium text-primary">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>🎨 Generating Image</span>
      </div>

      <div className="flex items-center gap-2">
        {stages.map((stage, index) => {
          const isComplete = index < currentIndex;
          const isCurrent = index === currentIndex;
          const isPending = index > currentIndex;

          return (
            <div key={stage.key} className="flex items-center gap-2">
              {/* Stage indicator */}
              <div
                className={cn(
                  "h-8 w-8 rounded-full flex items-center justify-center text-xs font-medium transition-all",
                  isComplete && "bg-green-500/20 text-green-600 border border-green-500/30",
                  isCurrent && "bg-primary/20 text-primary border border-primary/30 animate-pulse",
                  isPending && "bg-muted text-muted-foreground border border-border"
                )}
              >
                {isComplete ? (
                  <Check className="h-4 w-4" />
                ) : isCurrent ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  index + 1
                )}
              </div>

              {/* Connector line (not after last item) */}
              {index < stages.length - 1 && (
                <div
                  className={cn(
                    "h-0.5 w-8 transition-colors",
                    index < currentIndex ? "bg-green-500/50" : "bg-border"
                  )}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Current stage description */}
      <div className="text-sm text-muted-foreground">
        {stages[currentIndex]?.description || "Processing..."}
      </div>
    </div>
  );
}

/** Collapsible section for tool calls */
function ToolCallsSection({
  toolEvents,
  pendingApprovals,
  onApprovalResolved,
}: {
  toolEvents: Array<{
    key: string;
    id?: string;
    taskId?: string;
    name: string;
    toolLabel?: string;
    args?: unknown;
    result?: unknown;
    startTime?: number;
    endTime?: number;
  }>;
  pendingApprovals: InlineApprovalData[];
  onApprovalResolved?: (approvalId: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    if (pendingApprovals.length > 0) {
      setIsExpanded(true);
    }
  }, [pendingApprovals.length]);

  // Calculate overall status
  // A tool is considered "running" if we haven't received a tool result yet.
  // Do not use truthiness of `result` because some tools can legitimately return falsy values.
  const runningCount = toolEvents.filter(e => e.endTime === undefined).length;

  // Get unique friendly tool names for summary, expanding nested tools
  const toolSummary = [...new Set(toolEvents.flatMap(e => {
    const nested = extractNestedTools(e.name, e.args);
    return nested.length > 0 ? nested : [e.toolLabel || getToolDisplayName(e.name)];
  }))];
  const summaryText = toolSummary.length === 0 && pendingApprovals.length > 0
    ? `${pendingApprovals.length} approval${pendingApprovals.length > 1 ? "s" : ""} pending`
    : toolSummary.length <= 3
    ? toolSummary.join(", ")
    : `${toolSummary.slice(0, 2).join(", ")} +${toolSummary.length - 2} more`;

  const { approvalsByToolKey, unassignedApprovals } = useMemo(() => {
    const byKey: Record<string, InlineApprovalData[]> = {};
    const unassigned: InlineApprovalData[] = [];

    for (const approval of pendingApprovals) {
      let matchedKey: string | null = null;
      for (let i = toolEvents.length - 1; i >= 0; i--) {
        const toolEvent = toolEvents[i];
        if (toolEvent.endTime !== undefined) continue;
        if (!toolEvent.taskId) continue;
        if (toolEvent.taskId !== approval.taskId) continue;
        if (toolEvent.name !== approval.toolName) continue;
        matchedKey = toolEvent.key;
        break;
      }

      if (!matchedKey) {
        unassigned.push(approval);
        continue;
      }

      if (!byKey[matchedKey]) {
        byKey[matchedKey] = [];
      }
      byKey[matchedKey].push(approval);
    }

    return { approvalsByToolKey: byKey, unassignedApprovals: unassigned };
  }, [pendingApprovals, toolEvents]);

  return (
    <div className="mt-3 border rounded-lg bg-muted/30 overflow-hidden contain-layout">
      {/* Collapsed header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 transition-colors"
      >
        <span
          className="shrink-0 transition-transform duration-200"
          style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
        >
          <ChevronRight className="h-4 w-4" />
        </span>
        <Wrench className="h-3.5 w-3.5 shrink-0" />
        <span className="font-medium truncate">
          {summaryText}
        </span>
        <span className="text-xs opacity-70 flex items-center gap-2 shrink-0">
          {runningCount > 0 && (
            <motion.span
              className="text-yellow-600 flex items-center gap-0.5"
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
            >
              <Loader2 className="h-3 w-3 animate-spin" /> {runningCount} running
            </motion.span>
          )}
        </span>
      </button>

      {/* Expanded content - CSS Grid transition for smooth, layout-stable animation */}
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: isExpanded ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
        <div className="px-3 pb-3 space-y-2 border-t border-border/50">
          {toolEvents.map((toolEvent) => {
            const displayName = toolEvent.toolLabel || getToolDisplayName(toolEvent.name);

            // Extract nested tools from MULTI_EXECUTE_TOOL args
            const nestedTools = extractNestedTools(toolEvent.name, toolEvent.args);
            const matchingApprovals = approvalsByToolKey[toolEvent.key] || [];

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
                    <AnimatePresence mode="wait">
                      {status === "running" && (
                        <motion.span
                          key="running"
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          exit={{ scale: 0 }}
                        >
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-yellow-500" />
                        </motion.span>
                      )}
                      {status === "done" && (
                        <motion.span
                          key="done"
                          initial={{ scale: 0 }}
                          animate={{ scale: [0, 1.2, 1] }}
                          transition={{ duration: 0.3 }}
                        >
                          <Check className="h-3.5 w-3.5 text-green-500" />
                        </motion.span>
                      )}
                      {status === "error" && (
                        <motion.span
                          key="error"
                          initial={{ x: 0 }}
                          animate={{ x: [-4, 4, -4, 4, 0] }}
                          transition={{ duration: 0.3 }}
                        >
                          <XIcon className="h-3.5 w-3.5 text-red-500" />
                        </motion.span>
                      )}
                    </AnimatePresence>

                    {/* Show nested tools directly if available, otherwise show generic name */}
                    {nestedTools.length > 0 ? nestedTools.join(", ") : displayName}

                    {duration && (
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-normal ml-2">
                        {duration}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="px-3 py-2 text-sm">
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
                </div>

                {matchingApprovals.length > 0 && (
                  <div className="px-3 pb-3">
                    {matchingApprovals.map((approval) => (
                      <InlineApprovalCard
                        key={approval.id}
                        approval={{
                          ...approval,
                          toolLabel: approval.toolLabel || toolEvent.toolLabel || displayName,
                        }}
                        onResolved={onApprovalResolved}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {unassignedApprovals.length > 0 && (
            <div className="mt-2 rounded-lg border border-amber-300/50 bg-amber-50/30 p-2 dark:border-amber-900/40 dark:bg-amber-950/10">
              <p className="px-1 text-xs font-medium text-muted-foreground">Pending approvals</p>
              {unassignedApprovals.map((approval) => (
                <InlineApprovalCard
                  key={approval.id}
                  approval={approval}
                  onResolved={onApprovalResolved}
                />
              ))}
            </div>
          )}
        </div>
        </div>
      </div>
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
  const prefersReducedMotion = usePrefersReducedMotion();

  if (!reasoning) return null;

  return (
    <div className="mb-3 border rounded-lg bg-muted/20 border-border overflow-hidden contain-layout">
      {/* Collapsed header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-muted/30 transition-colors"
      >
        <span
          className="transition-transform duration-200"
          style={{
            transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
            transitionDuration: prefersReducedMotion ? '0ms' : '200ms'
          }}
        >
          <ChevronRight className="h-4 w-4" />
        </span>
        <Brain className="h-3.5 w-3.5" />
        <span className="font-medium">Thinking</span>
        {isStreaming && (
          <Loader2 className="h-3 w-3 animate-spin ml-1" />
        )}
      </button>

      {/* Expanded content - CSS Grid transition for smooth, layout-stable animation */}
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out"
        style={{ gridTemplateRows: isExpanded ? '1fr' : '0fr' }}
      >
        <div className="overflow-hidden">
          <div className="px-3 pb-3 border-t border-border">
            <div className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap font-mono text-xs leading-relaxed max-h-96 overflow-y-auto">
              {reasoning}
              {isStreaming && (
                <span className="inline-block w-1.5 h-3 ml-0.5 bg-foreground/50 cursor-breathing" />
              )}
            </div>
          </div>
        </div>
      </div>
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
      case "retrying":
        return <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />;
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
                    step.status === "retrying" && "bg-amber-500/10",
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
                    (step.status === "running" || step.status === "retrying") && "font-medium"
                  )}>
                    {step.name}
                  </span>
                  {step.status === "running" && (
                    <span className="text-xs text-muted-foreground animate-pulse">
                      in progress...
                    </span>
                  )}
                  {step.status === "retrying" && (
                    <span className="text-xs text-amber-600 dark:text-amber-400 animate-pulse">
                      retrying {step.retryCount}/{step.maxRetries}...
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
  // Pin functionality for context compaction
  onTogglePin?: (messageId: string, newPinnedState: boolean) => void;
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
  onTogglePin,
}: MessageItemProps) {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(getTextFromMessageContent(message.content));
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [loadedImages, setLoadedImages] = useState<Record<string, boolean>>({});
  const [showMobileActions, setShowMobileActions] = useState(false);
  const proseRef = useRef<HTMLDivElement>(null);
  const { speak, stop, isPlaying } = useVoiceOutput();
  const { setActiveArtifact, setShowArtifacts } = useUIStore();
  const removeStreamingApproval = useStreamingStore((state) => state.removeStreamingApproval);
  const globalApprovals = useLuminaStore((state) => state.approvals);

  // Get streaming state for THIS chat for real-time updates
  // Include streamingVersion to ensure re-renders on each content update
  const chatStreamingState = useStreamingStore((state) => state.getChatStream(message.chatId));
  const { streamingMessageId, streamingContent, streamingReasoning, streamingToolCalls, streamingToolResults, streamingApprovals, streamingVersion, pipelineExecution, activeSkill, imageGenerationProgress } = chatStreamingState;
  const isStreaming = message.id === streamingMessageId;
  const isImageGenerating = imageGenerationProgress?.messageId === message.id && imageGenerationProgress?.isActive;

  const isUser = message.role === "user";
  const isAssistant = message.role === "assistant";
  const images = getImagesFromMessageContent(message.content);

  // Load skill info if message has a skillId (for completed messages)
  const persistedSkill = useLiveQuery(
    () => (message.skillId ? getSkillById(message.skillId) : Promise.resolve(undefined)),
    [message.skillId]
  );

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

  // Track if we're actively streaming reasoning
  const isStreamingReasoning = isStreaming && !!streamingReasoning;

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
    taskId?: string;
    name: string;
    toolLabel?: string;
    args?: unknown;
    result?: unknown;
    startTime?: number;
    endTime?: number;
  }> = [];

  for (let i = 0; i < toolCalls.length; i++) {
    const toolCall = toolCalls[i];
    const id = toolCall.id || toolCall.toolCallId;
    const name = toolCall.name || toolCall.toolName || "Tool";
    const resultObj = id ? toolResultsById.get(id) : undefined;
    const result = resultObj?.result;
    const endTime = resultObj?.endTime;
    const key = id || `tool-call-${i}`;

    toolEvents.push({
      key,
      id,
      taskId: toolCall.taskId || resultObj?.taskId,
      name,
      toolLabel: toolCall.toolLabel || resultObj?.toolLabel,
      args: toolCall.args,
      result,
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
      taskId: toolResult.taskId,
      name,
      toolLabel: toolResult.toolLabel,
      args: toolResult.args,
      result: toolResult.result,
      endTime: toolResult.endTime
    });
  }

  const pendingApprovals = (() => {
    const taskIds = new Set(toolEvents.map((event) => event.taskId).filter((taskId): taskId is string => !!taskId));
    if (taskIds.size === 0) {
      if (!isStreaming) return [] as InlineApprovalData[];
      if (streamingApprovals.length > 0) {
        return streamingApprovals.map((approval) => ({
          id: approval.id,
          toolName: approval.toolName,
          args: approval.args,
          source: approval.source,
          taskId: approval.taskId,
          reason: approval.reason,
          createdAt: approval.createdAt,
          timeoutMs: approval.timeoutMs,
        }));
      }

      // Fallback for stream reconnect/race: show newly created global approvals
      // that likely belong to this in-flight assistant message.
      const streamStartCutoff = message.createdAt - 15_000;
      const fallbackApprovals = globalApprovals.filter((approval) =>
        approval.source === "api" && approval.createdAt >= streamStartCutoff
      );
      return fallbackApprovals.map((approval) => ({
        id: approval.id,
        toolName: approval.toolName,
        args: approval.args,
        source: approval.source,
        taskId: approval.taskId,
        reason: approval.reason,
        createdAt: approval.createdAt,
        timeoutMs: 5 * 60 * 1000,
      }));
    }

    const mergedById = new Map<string, InlineApprovalData>();

    for (const approval of globalApprovals) {
      if (!taskIds.has(approval.taskId)) continue;
      mergedById.set(approval.id, {
        id: approval.id,
        toolName: approval.toolName,
        args: approval.args,
        source: approval.source,
        taskId: approval.taskId,
        reason: approval.reason,
        createdAt: approval.createdAt,
      });
    }

    for (const approval of streamingApprovals) {
      if (!taskIds.has(approval.taskId)) continue;
      mergedById.set(approval.id, {
        ...mergedById.get(approval.id),
        ...approval,
      });
    }

    return Array.from(mergedById.values());
  })();

  const handleApprovalResolved = useCallback((approvalId: string) => {
    removeStreamingApproval(message.chatId, approvalId);
  }, [message.chatId, removeStreamingApproval]);

  const handleCopy = useCallback(async () => {
    const payload = images.length > 0 ? `${textContent}\n\n${images.join("\n")}` : textContent;
    await navigator.clipboard.writeText(payload);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [textContent, images]);

  const handleCopyMarkdown = useCallback(async () => {
    await navigator.clipboard.writeText(textContent);
    toast.success("Copied as Markdown");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [textContent]);

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

  const handleRate = useCallback(async (rating: "up" | "down") => {
    if (message.rating === rating) {
      await updateMessage(message.id, { rating: undefined as any });
    } else {
      await updateMessage(message.id, { rating });
    }
  }, [message.id, message.rating]);

  const handleTogglePin = useCallback(async () => {
    const newPinnedState = await toggleMessagePin(message.id);
    onTogglePin?.(message.id, newPinnedState);
  }, [message.id, onTogglePin]);

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
        "group relative px-2 sm:px-4 py-3 sm:py-6",
        // Streaming messages should not be scroll anchor points
        // This allows the browser to anchor to content the user is reading instead
        isStreaming && "scroll-anchor-none"
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
          <div className="relative shrink-0 hidden sm:flex">
            <Avatar className="h-8 w-8 ring-1 ring-border">
              <AvatarFallback>
                {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
              </AvatarFallback>
            </Avatar>
            {/* Pinned indicator */}
            {message.isPinned && (
              <div className="absolute -top-1 -right-1 h-4 w-4 bg-amber-500 rounded-full flex items-center justify-center" title="Pinned - won't be summarized">
                <Pin className="h-2.5 w-2.5 text-white" />
              </div>
            )}
            {/* Summarized indicator */}
            {message.isSummarized && !message.isPinned && (
              <div className="absolute -top-1 -right-1 h-4 w-4 bg-blue-500 rounded-full flex items-center justify-center" title="This message was summarized">
                <span className="text-[8px] text-white font-bold">S</span>
              </div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 overflow-hidden">
            <div
              className={cn(
                "rounded-xl sm:rounded-2xl border p-2.5 sm:p-4 overflow-hidden",
                isUser
                  ? "bg-primary/10 border-primary/20"
                  : "bg-card border-border"
              )}
            >
              <div className="mb-1.5 sm:mb-2 flex items-center gap-1.5 sm:gap-2 flex-wrap">
                {/* Mobile-only role icon since avatar is hidden on small screens */}
                <span className={cn(
                  "sm:hidden flex items-center justify-center h-5 w-5 rounded-full shrink-0",
                  isUser ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                )}>
                  {isUser ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
                </span>
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
                {/* Active skill indicator during streaming */}
                {isAssistant && isStreaming && activeSkill && (
                  <ActiveSkillIndicator
                    icon={activeSkill.icon}
                    color={activeSkill.color}
                    activeLabel={activeSkill.activeLabel}
                    isAnimated={true}
                  />
                )}
                {/* Static skill badge for completed messages */}
                {isAssistant && !isStreaming && persistedSkill && (
                  <SkillBadge
                    name={persistedSkill.name}
                    icon={persistedSkill.ui.icon}
                    color={persistedSkill.ui.color}
                  />
                )}
              </div>

              {/* Pipeline Progress Section (for pipeline agents) */}
              {!isEditing && isAssistant && isStreaming && pipelineExecution?.isActive && (
                <PipelineProgressSection pipelineExecution={pipelineExecution} />
              )}

              {/* Image Generation Progress Section */}
              {!isEditing && isAssistant && isImageGenerating && imageGenerationProgress && (
                <ImageGenerationProgressIndicator progress={imageGenerationProgress} />
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
              ) : isImageGenerating ? (
                /* Image generation in progress - don't show empty content */
                null
              ) : (
                /* Message content */
                <div
                  className="relative"
                >
                  <div
                    ref={proseRef}
                    className="prose prose-sm dark:prose-invert max-w-none break-words"
                    style={{ overflowWrap: 'anywhere' }}
                  >
                    {isAssistant ? (
                      <>
                        {isStreaming && !textContent ? (
                          <SkeletonText lines={3} />
                        ) : (
                          <>
                            <MarkdownRenderer content={textContent} isStreaming={isStreaming} />
                            {isStreaming && (
                              <span className="inline-block w-2 h-4 ml-0.5 bg-primary/70 cursor-breathing" />
                            )}
                          </>
                        )}
                      </>
                    ) : (
                      <MentionRenderer text={textContent} />
                    )}
                  </div>
                  {/* Multi-stop gradient fade on last few lines during streaming
                      Creates a natural reading experience by progressively fading content
                      as new text appears, drawing focus to the cursor position
                      Extended height (h-72) covers ~9 lines giving markdown time to render
                      Only show when there's actual content to fade */}
                  {isAssistant && isStreaming && textContent.length > 0 && (
                    <div
                      className="absolute bottom-0 left-0 right-0 h-72 pointer-events-none"
                      style={{
                        background: 'linear-gradient(to bottom, transparent 0%, hsl(var(--card) / 0.05) 20%, hsl(var(--card) / 0.15) 35%, hsl(var(--card) / 0.35) 50%, hsl(var(--card) / 0.55) 65%, hsl(var(--card) / 0.75) 78%, hsl(var(--card) / 0.9) 90%, hsl(var(--card) / 0.98) 100%)',
                      } as React.CSSProperties}
                    />
                  )}
                  {isAssistant && !isStreaming && (
                    <SelectionCopyToolbar containerRef={proseRef} markdownSource={textContent} />
                  )}
                </div>
              )}

              {/* Message Metadata (Tokens/Cost) - Reserve space to prevent layout shift */}
              {!isEditing && isAssistant && (
                <div className="mt-3" style={{ minHeight: '24px' }}>
                  {(message.inputTokens || message.outputTokens) ? (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground/60 font-medium border-t border-border/30 pt-2">
                      <div className="flex items-center gap-3">
                        {/* Input tokens - green and clickable when cached */}
                        {message.cachedTokens && message.cachedTokens > 0 ? (
                          <Popover>
                            <PopoverTrigger asChild>
                              <button className="flex items-center gap-0.5 text-green-600 dark:text-green-400 hover:text-green-500 dark:hover:text-green-300 transition-colors cursor-pointer">
                                In: <span className="font-semibold">{message.inputTokens?.toLocaleString() || 0}</span>
                              </button>
                            </PopoverTrigger>
                            <PopoverContent side="top" align="start" className="w-auto p-3 text-xs">
                              <div className="space-y-2">
                                <div className="flex items-center gap-2 font-semibold text-green-600 dark:text-green-400">
                                  <span>Prompt Cache Hit</span>
                                </div>
                                <div className="space-y-1.5 bg-muted/50 rounded-lg p-2 border border-border/50">
                                  <div className="flex justify-between gap-4">
                                    <span className="text-muted-foreground">Cached:</span>
                                    <span className="font-medium">{message.cachedTokens.toLocaleString()} tokens</span>
                                  </div>
                                  <div className="flex justify-between gap-4">
                                    <span className="text-muted-foreground">Total input:</span>
                                    <span className="font-medium">{(message.inputTokens || 0).toLocaleString()} tokens</span>
                                  </div>
                                  <div className="flex justify-between gap-4 pt-1.5 border-t border-border/50">
                                    <span className="text-muted-foreground">Cache rate:</span>
                                    <span className="font-bold text-green-600 dark:text-green-400">
                                      {((message.cachedTokens / (message.inputTokens || 1)) * 100).toFixed(0)}%
                                    </span>
                                  </div>
                                  {message.cacheSavings && message.cacheSavings > 0 && (
                                    <div className="flex justify-between gap-4 pt-1.5 border-t border-border/50">
                                      <span className="text-muted-foreground">Cost saved:</span>
                                      <span className="font-bold text-green-600 dark:text-green-400">
                                        ${message.cacheSavings < 0.001 ? '<0.001' : message.cacheSavings.toFixed(4)}
                                      </span>
                                    </div>
                                  )}
                                </div>
                                <p className="text-[10px] text-muted-foreground/70 leading-tight">
                                  Cached tokens are read from prompt cache at 90% discount.
                                </p>
                              </div>
                            </PopoverContent>
                          </Popover>
                        ) : (
                          <span className="flex items-center gap-0.5">
                            In: <span className="text-muted-foreground">{message.inputTokens?.toLocaleString() || 0}</span>
                          </span>
                        )}
                        <span className="text-border">•</span>
                        <span>Out: <span className="text-muted-foreground">{message.outputTokens?.toLocaleString() || 0}</span></span>
                        {message.thinkingTokens && message.thinkingTokens > 0 && (
                          <>
                            <span className="text-border">•</span>
                            <span className="flex items-center gap-0.5">
                              Think: <span className="text-muted-foreground">{message.thinkingTokens.toLocaleString()}</span>
                              <span className="text-purple-500 dark:text-purple-400">💭</span>
                            </span>
                          </>
                        )}
                      </div>
                      {typeof message.cost === "number" && (
                        <div className="flex items-center gap-1.5 bg-primary/5 px-1.5 py-0.5 rounded border border-primary/10 text-primary/70">
                          <span>${message.cost.toFixed(4)}</span>
                          {message.cacheSavings && message.cacheSavings > 0 && (
                            <span
                              className="text-green-600 dark:text-green-400 text-[9px] cursor-help"
                              title={`Saved $${message.cacheSavings < 0.001 ? '<0.001' : message.cacheSavings.toFixed(4)} from cache`}
                            >
                              ↓
                            </span>
                          )}
                          {message.costIsEstimated && (
                            <span className="text-[9px] uppercase tracking-wide text-muted-foreground/70">
                              est
                            </span>
                          )}
                        </div>
                      )}
                      </div>
                    </motion.div>
                  ) : null}
                </div>
              )}

              {/* Images - Fade in smoothly */}
              <AnimatePresence>
                {!isEditing && images.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                  >
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
                  </motion.div>
                )}
              </AnimatePresence>

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

              {/* Error state with retry */}
              {!isEditing && isAssistant && !isStreaming && message.error && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-3 py-2.5 text-sm">
                  <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-red-700 dark:text-red-300 break-words">{message.error}</p>
                  </div>
                  {onRegenerate && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 gap-1.5 border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/50"
                      onClick={() => onRegenerate(message.id)}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Retry
                    </Button>
                  )}
                </div>
              )}

              {/* Incomplete indicator */}
              {isAssistant && message.isIncomplete && !message.canContinue && (
                <div className="mt-2 text-xs text-muted-foreground italic">
                  (Response was continued below)
                </div>
              )}

              {/* Tool calls/results - collapsible with fade-in */}
              {!isEditing && isAssistant && (toolEvents.length > 0 || pendingApprovals.length > 0) && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                >
                  <ToolCallsSection
                    toolEvents={toolEvents}
                    pendingApprovals={pendingApprovals}
                    onApprovalResolved={handleApprovalResolved}
                  />
                </motion.div>
              )}

              {/* Pipeline execution details (persisted, after completion) with fade-in */}
              {!isEditing && isAssistant && !isStreaming && message.pipelineExecution && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                >
                  <PipelineExecutionDetails pipelineExecution={message.pipelineExecution} />
                </motion.div>
              )}

              {/* Mobile Actions - Inside bubble with larger touch targets */}
              {!isEditing && showMobileActions && (
                <div className="sm:hidden flex items-center gap-0.5 mt-2 pt-2 border-t border-border/30 flex-wrap">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 touch-manipulation"
                    onClick={(e) => { e.stopPropagation(); handleCopy(); }}
                    aria-label="Copy message"
                  >
                    {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </Button>
                  {isAssistant && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn("h-10 w-10 touch-manipulation", isPlaying && "text-primary")}
                      onClick={(e) => { e.stopPropagation(); isPlaying ? stop() : speak(textContent); }}
                      aria-label={isPlaying ? "Stop reading" : "Read aloud"}
                    >
                      {isPlaying ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                    </Button>
                  )}
                  {canRegenerate && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 touch-manipulation"
                      onClick={(e) => { e.stopPropagation(); onRegenerate?.(message.id); }}
                      aria-label="Regenerate response"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  )}
                  {canResend && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 touch-manipulation"
                      onClick={(e) => { e.stopPropagation(); onResend?.(message.id); }}
                      aria-label="Resend message"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  )}
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 touch-manipulation"
                      onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
                      aria-label="Edit message"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                  {isAssistant && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 touch-manipulation"
                        onClick={(e) => { e.stopPropagation(); handleRate("up"); }}
                        aria-label="Rate as good response"
                      >
                        <ThumbsUp className={cn("h-4 w-4", message.rating === "up" && "fill-current text-green-500")} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 touch-manipulation"
                        onClick={(e) => { e.stopPropagation(); handleRate("down"); }}
                        aria-label="Rate as bad response"
                      >
                        <ThumbsDown className={cn("h-4 w-4", message.rating === "down" && "fill-current text-red-500")} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 touch-manipulation"
                        onClick={(e) => { e.stopPropagation(); handleTogglePin(); }}
                        title={message.isPinned ? "Unpin" : "Pin"}
                        aria-label={message.isPinned ? "Unpin message" : "Pin message"}
                      >
                        {message.isPinned ? (
                          <PinOff className={cn("h-4 w-4 text-amber-500")} />
                        ) : (
                          <Pin className="h-4 w-4" />
                        )}
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
              <div className="flex items-center">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-r-none"
                  onClick={handleCopy}
                  title="Copy message"
                  aria-label="Copy message"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-4 rounded-l-none px-0"
                      aria-label="Copy options"
                    >
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" side="bottom">
                    <DropdownMenuItem onClick={handleCopy}>
                      <Copy className="h-4 w-4 mr-2" />
                      Copy as Plain Text
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleCopyMarkdown}>
                      <FileText className="h-4 w-4 mr-2" />
                      Copy as Markdown
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {isAssistant && (
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn("h-8 w-8 text-muted-foreground", isPlaying && "text-primary")}
                  onClick={() => isPlaying ? stop() : speak(textContent)}
                  title={isPlaying ? "Stop" : "Read aloud"}
                  aria-label={isPlaying ? "Stop reading" : "Read aloud"}
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
                  aria-label="Fork from here"
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
                  aria-label="Regenerate response"
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
                  aria-label="Resend message"
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
                  aria-label="Edit message"
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
                    aria-label="Rate as good response"
                  >
                    <ThumbsUp className={cn("h-4 w-4", message.rating === "up" && "fill-current text-green-500")} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleRate("down")}
                    title="Bad response"
                    aria-label="Rate as bad response"
                  >
                    <ThumbsDown className={cn("h-4 w-4", message.rating === "down" && "fill-current text-red-500")} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={handleTogglePin}
                    title={message.isPinned ? "Unpin message (will be summarized)" : "Pin message (prevent summarization)"}
                    aria-label={message.isPinned ? "Unpin message" : "Pin message"}
                  >
                    {message.isPinned ? (
                      <PinOff className="h-4 w-4 text-amber-500" />
                    ) : (
                      <Pin className="h-4 w-4" />
                    )}
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
