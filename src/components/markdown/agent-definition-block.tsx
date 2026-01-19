"use client";

import { useState, useMemo, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Button } from "@/components/ui/button";
import { Copy, Check, Bot, AlertCircle } from "lucide-react";
import { useUIStore } from "@/stores/ui-store";
import { cn } from "@/lib/utils";
import type { Agent, PipelineStep } from "@/lib/db/schema";
import { getAllAgents } from "@/lib/db/queries";

interface AgentDefinitionData {
  id?: string; // Optional ID for edit flows
  name: string;
  description?: string;
  avatar?: string;
  isActive?: boolean;
  executionType?: "simple" | "pipeline" | "orchestrator";
  pipeline?: {
    steps: PipelineStep[];
  };
}

type ParseResult = {
  success: true;
  data: AgentDefinitionData;
} | {
  success: false;
  error: string;
};

function parseAgentDefinition(code: string): ParseResult {
  try {
    const data = JSON.parse(code);

    // Validate required fields
    const errors: string[] = [];

    if (!data.name || typeof data.name !== "string") {
      errors.push("name is required");
    }

    if (errors.length > 0) {
      return { success: false, error: `Validation errors: ${errors.join("; ")}` };
    }

    return {
      success: true,
      data: {
        id: data.id,
        name: data.name,
        description: data.description,
        avatar: data.avatar,
        isActive: data.isActive !== undefined ? data.isActive : true,
        executionType: data.executionType || "pipeline",
        pipeline: data.pipeline,
      },
    };
  } catch (e) {
    return { success: false, error: `Invalid JSON: ${e instanceof Error ? e.message : "Parse error"}` };
  }
}

interface AgentDefinitionBlockProps {
  code: string;
}

export function AgentDefinitionBlock({ code }: AgentDefinitionBlockProps) {
  const [copied, setCopied] = useState(false);
  const [existingAgentId, setExistingAgentId] = useState<string | null>(null);
  const openAgentEditorWithData = useUIStore((state) => state.openAgentEditorWithData);
  const agents = useLiveQuery(() => getAllAgents(), []);

  const parseResult = useMemo(() => parseAgentDefinition(code), [code]);
  
  // Check if this is an edit flow by matching ID or name
  useEffect(() => {
    if (!parseResult.success || !agents) {
      setExistingAgentId(null);
      return;
    }
    
    const data = parseResult.data;
    if (data.id) {
      const found = agents.find(a => a.id === data.id);
      setExistingAgentId(found?.id || null);
    } else if (data.name) {
      // Try name match (case-insensitive)
      const found = agents.find(a => a.name.toLowerCase() === data.name.toLowerCase());
      setExistingAgentId(found?.id || null);
    } else {
      setExistingAgentId(null);
    }
  }, [parseResult, agents]);
  
  const isEditFlow = !!existingAgentId;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleConvertToAgent = () => {
    if (!parseResult.success) return;

    const { data } = parseResult;

    // Build the agent partial data
    const agentData: Partial<Agent> = {
      name: data.name,
      description: data.description,
      avatar: data.avatar,
      isActive: data.isActive !== undefined ? data.isActive : true,
      executionType: data.executionType || "pipeline",
      pipeline: data.pipeline,
      systemPrompt: "", // System prompts are per-step now
      enabledTools: [], // Tools are configured per-step
      mcpServerIds: [], // MCP servers are configured per-step
      knowledgeBaseIds: [],
    };

    openAgentEditorWithData(agentData, existingAgentId);
  };

  // Error state
  if (!parseResult.success) {
    return (
      <div className="my-3 sm:my-4 rounded-lg border border-destructive/30 bg-destructive/5 overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-destructive/20">
          <AlertCircle className="h-4 w-4 text-destructive" />
          <span className="text-sm font-medium text-destructive">Invalid Agent Definition</span>
        </div>
        <div className="p-3">
          <p className="text-sm text-muted-foreground mb-2">{parseResult.error}</p>
          <pre className="text-xs bg-muted/50 p-2 rounded overflow-x-auto">
            <code>{code}</code>
          </pre>
        </div>
      </div>
    );
  }

  const { data } = parseResult;
  const stepCount = data.pipeline?.steps?.length || 0;

  return (
    <div className="my-3 sm:my-4 rounded-lg border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 border-b bg-muted/30">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-md bg-purple-500/10">
            <Bot className="h-4 w-4 text-purple-500" />
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2">
            <span className="font-medium text-sm">{data.name}</span>
            {stepCount > 0 && (
              <span className="text-[10px] sm:text-xs px-1.5 py-0.5 rounded-full border bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400">
                Pipeline ({stepCount} steps)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Description */}
      {data.description && (
        <div className="px-3 sm:px-4 py-3">
          <p className="text-sm text-muted-foreground line-clamp-2">
            {data.description}
          </p>
        </div>
      )}

      {/* Pipeline Preview */}
      {data.pipeline?.steps && data.pipeline.steps.length > 0 && (
        <div className="px-3 sm:px-4 pb-3">
          <div className="text-xs text-muted-foreground mb-1 font-medium">Pipeline Steps:</div>
          <div className="space-y-1">
            {data.pipeline.steps.map((step, idx) => (
              <div key={idx} className="text-xs bg-muted/50 p-2 rounded">
                <span className="font-medium">{idx + 1}. {step.name || `Step ${idx + 1}`}</span>
                <span className="text-muted-foreground ml-2">({step.type})</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 px-3 sm:px-4 py-2.5 border-t bg-muted/20">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs"
          onClick={handleCopy}
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 mr-1.5 text-green-500" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5 mr-1.5" />
              Copy JSON
            </>
          )}
        </Button>
        <Button
          size="sm"
          className="h-8 text-xs"
          onClick={handleConvertToAgent}
        >
          <Bot className="h-3.5 w-3.5 mr-1.5" />
          {isEditFlow ? "Update Agent" : "Convert to Agent"}
        </Button>
      </div>
    </div>
  );
}
