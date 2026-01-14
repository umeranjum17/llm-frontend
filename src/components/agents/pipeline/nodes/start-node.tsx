"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";

interface StartNodeData {
  label?: string;
}

function StartNodeComponent({ selected }: NodeProps<StartNodeData>) {
  return (
    <div
      className={cn(
        "rounded-lg p-3 min-w-[120px] shadow-md transition-all border-2 border-green-500/50",
        selected && "ring-2 ring-primary ring-offset-2 ring-offset-background"
      )}
      style={{ background: "hsl(var(--card))", color: "hsl(var(--card-foreground))" }}
    >
      <div className="flex items-center gap-2">
        <div className="p-1.5 rounded-md bg-green-500/10">
          <Play className="h-4 w-4 text-green-500" />
        </div>
        <div>
          <div className="font-medium text-sm">Start</div>
          <div className="text-xs text-muted-foreground">User Input</div>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-green-500 !border-2 !border-background"
      />
    </div>
  );
}

export const StartNode = memo(StartNodeComponent);
