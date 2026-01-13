"use client";

import { useState } from "react";
import { Wrench, ChevronDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Tool {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
}

const AVAILABLE_TOOLS: Tool[] = [
  // Built-in tools can be added here
];

interface ToolSelectorProps {
  enabledTools: string[];
  onToolsChange: (tools: string[]) => void;
}

export function ToolSelector({ enabledTools, onToolsChange }: ToolSelectorProps) {
  const toggleTool = (toolId: string) => {
    if (enabledTools.includes(toolId)) {
      onToolsChange(enabledTools.filter((id) => id !== toolId));
    } else {
      onToolsChange([...enabledTools, toolId]);
    }
  };

  const enabledCount = enabledTools.length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Wrench className="h-4 w-4" />
          <span className="text-sm">Tools</span>
          {enabledCount > 0 && (
            <Badge variant="secondary" className="text-xs px-1.5">
              {enabledCount}
            </Badge>
          )}
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Available Tools</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {AVAILABLE_TOOLS.map((tool) => {
          const isEnabled = enabledTools.includes(tool.id);
          return (
            <DropdownMenuItem
              key={tool.id}
              onClick={() => toggleTool(tool.id)}
              className="flex flex-col items-start cursor-pointer"
            >
              <div className="flex items-center justify-between w-full">
                <span className="font-medium">{tool.name}</span>
                {isEnabled && <Check className="h-4 w-4 text-primary" />}
              </div>
              <span className="text-xs text-muted-foreground">
                {tool.description}
              </span>
            </DropdownMenuItem>
          );
        })}
        {AVAILABLE_TOOLS.length === 0 && (
          <div className="px-2 py-4 text-center text-sm text-muted-foreground">
            No tools available yet
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
