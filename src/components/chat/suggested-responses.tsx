"use client";

import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface SuggestedResponsesProps {
    suggestions: string[];
    onSelect: (suggestion: string) => void;
    isLoading?: boolean;
    className?: string;
}

export function SuggestedResponses({
    suggestions,
    onSelect,
    isLoading,
    className,
}: SuggestedResponsesProps) {
    if (!suggestions || suggestions.length === 0) return null;

    return (
        <div className={cn("flex flex-wrap gap-2 py-4", className)}>
            <div className="flex items-center gap-1.5 w-full mb-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                <Sparkles className="h-3 w-3 text-primary animate-pulse" />
                Suggested Follow-ups
            </div>
            {suggestions.map((suggestion, i) => (
                <Button
                    key={`${suggestion}-${i}`}
                    variant="outline"
                    size="sm"
                    onClick={() => onSelect(suggestion)}
                    disabled={isLoading}
                    className="h-auto py-1.5 px-3 text-xs text-left justify-start bg-background/50 border-border/40 hover:bg-background hover:border-primary/30 transition-all rounded-xl"
                >
                    {suggestion}
                </Button>
            ))}
        </div>
    );
}
