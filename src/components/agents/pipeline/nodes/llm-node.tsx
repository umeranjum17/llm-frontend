"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { MessageSquare, Plug } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { PipelineStep } from "@/lib/db/schema";

function LLMNodeComponent({ data, selected }: NodeProps<PipelineStep>) {
  const modelName = data.modelId?.split("/").pop() || "No model";
  const providerName = data.providerId || "openrouter";
  const mcpServerCount = data.mcpServerIds?.length || 0;

  return (
    <div
      className={cn(
        "border rounded-lg p-3 min-w-[180px] shadow-md transition-all",
        selected && "ring-2 ring-primary ring-offset-2 ring-offset-background"
      )}
      style={{ background: "hsl(var(--card))", color: "hsl(var(--card-foreground))" }}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-blue-500 !border-2 !border-background"
      />
      <div className="flex items-center gap-2 mb-2">
        <div className="p-1.5 rounded-md bg-blue-500/10">
          <MessageSquare className="h-4 w-4 text-blue-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">{data.name || "LLM Step"}</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        <Badge variant="secondary" className="text-[10px] h-5 font-normal">
          {modelName}
        </Badge>
        <Badge variant="outline" className="text-[10px] h-5 font-normal text-muted-foreground">
          {providerName}
        </Badge>
        {mcpServerCount > 0 && (
          <Badge variant="outline" className="text-[10px] h-5 font-normal text-amber-600 border-amber-300">
            <Plug className="h-2.5 w-2.5 mr-0.5" />
            {mcpServerCount} MCP
          </Badge>
        )}
      </div>
      {data.outputVariable && (
        <div className="mt-2 text-[10px] text-muted-foreground truncate">
          → {data.outputVariable}
        </div>
      )}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-blue-500 !border-2 !border-background"
      />
    </div>
  );
}

export const LLMNode = memo(LLMNodeComponent);
