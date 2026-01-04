"use client";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Brain, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type ReasoningLevel = "low" | "medium" | "high" | "xhigh";

interface ReasoningControlProps {
  level: ReasoningLevel;
  onChange: (level: ReasoningLevel) => void;
}

const REASONING_LEVELS: {
  value: ReasoningLevel;
  label: string;
  description: string;
}[] = [
  {
    value: "low",
    label: "Low",
    description: "Fast responses, minimal reasoning",
  },
  {
    value: "medium",
    label: "Medium",
    description: "Balanced speed and reasoning",
  },
  {
    value: "high",
    label: "High",
    description: "Deep reasoning, slower responses",
  },
  {
    value: "xhigh",
    label: "Extra High",
    description: "Maximum reasoning capability",
  },
];

export function ReasoningControl({ level, onChange }: ReasoningControlProps) {
  const currentLevel = REASONING_LEVELS.find((l) => l.value === level);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Brain className="h-4 w-4" />
          <span className="text-sm">{currentLevel?.label || "Reasoning"}</span>
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {REASONING_LEVELS.map((item) => (
          <DropdownMenuItem
            key={item.value}
            onClick={() => onChange(item.value)}
            className={cn(
              "flex flex-col items-start gap-1 cursor-pointer",
              item.value === level && "bg-accent"
            )}
          >
            <div className="flex items-center justify-between w-full">
              <span className="font-medium">{item.label}</span>
              {item.value === level && (
                <Badge variant="secondary" className="text-xs">
                  Active
                </Badge>
              )}
            </div>
            <span className="text-xs text-muted-foreground">
              {item.description}
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
