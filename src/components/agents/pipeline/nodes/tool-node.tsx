"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { Wrench, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { PipelineStep } from "@/lib/db/schema";

function ToolNodeComponent({ data, selected }: NodeProps<PipelineStep>) {
  const toolName = data.toolName;
  const hasMissingConfig = !toolName || toolName.trim() === "";

  return (
    <div
      className={cn(
        "border rounded-lg p-3 min-w-[180px] shadow-md transition-all",
        selected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
        hasMissingConfig && "border-destructive/50"
      )}
      style={{ background: "hsl(var(--card))", color: "hsl(var(--card-foreground))" }}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-amber-500 !border-2 !border-background"
      />
      <div className="flex items-center gap-2 mb-2">
        <div className="p-1.5 rounded-md bg-amber-500/10">
          <Wrench className="h-4 w-4 text-amber-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">{data.name || "Tool (deprecated)"}</div>
        </div>
        {hasMissingConfig && (
          <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {hasMissingConfig ? (
          <Badge variant="outline" className="text-[10px] h-5 font-normal text-destructive border-destructive/50">
            No tool configured
          </Badge>
        ) : (
          <Badge variant="secondary" className="text-[10px] h-5 font-normal truncate max-w-[150px]">
            {toolName}
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
        className="!w-3 !h-3 !bg-amber-500 !border-2 !border-background"
      />
    </div>
  );
}

export const ToolNode = memo(ToolNodeComponent);
