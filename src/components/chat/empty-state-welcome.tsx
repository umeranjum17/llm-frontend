"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Code, Lightbulb, BookOpen, Zap, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface SuggestionChip {
  icon: typeof Code;
  label: string;
  prompt: string;
  description: string;
}

const SUGGESTIONS: SuggestionChip[] = [
  {
    icon: Code,
    label: "Code",
    prompt: "Help me write a function that ",
    description: "Write or debug code",
  },
  {
    icon: Lightbulb,
    label: "Create",
    prompt: "Help me create ",
    description: "Generate content",
  },
  {
    icon: BookOpen,
    label: "Learn",
    prompt: "Teach me about ",
    description: "Explore topics",
  },
  {
    icon: Zap,
    label: "Quick chat",
    prompt: "",
    description: "Start fresh",
  },
];

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

interface EmptyStateWelcomeProps {
  onSuggestionClick: (prompt: string) => void;
  modelName?: string;
  className?: string;
}

export function EmptyStateWelcome({
  onSuggestionClick,
  modelName,
  className,
}: EmptyStateWelcomeProps) {
  const [hoveredChip, setHoveredChip] = useState<string | null>(null);
  const greeting = getGreeting();

  return (
    <div
      className={cn(
        "flex h-full flex-col items-center justify-center px-4",
        className
      )}
    >
      <motion.div
        className="flex flex-col items-center text-center max-w-lg"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0, 0, 0.2, 1] }}
      >
        {/* Greeting */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1, duration: 0.3 }}
        >
          <h1 className="text-xl sm:text-3xl font-semibold text-foreground mb-1 sm:mb-2">
            {greeting}
          </h1>
          <p className="text-sm text-muted-foreground mb-6 sm:mb-8">
            How can I help you today?
          </p>
        </motion.div>

        {/* Suggestion Chips - stacked on mobile, grid on desktop */}
        <motion.div
          className="flex flex-col sm:grid sm:grid-cols-2 gap-2 sm:gap-3 w-full max-w-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.3 }}
        >
          {SUGGESTIONS.map((suggestion, index) => {
            const Icon = suggestion.icon;
            const isHovered = hoveredChip === suggestion.label;

            return (
              <motion.button
                key={suggestion.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 + index * 0.05, duration: 0.2 }}
                className={cn(
                  "group relative flex items-center gap-3 p-3 sm:p-4 rounded-xl",
                  "border border-border/50 bg-card/50",
                  "hover:border-border hover:bg-card/80 active:bg-card/90",
                  "transition-all duration-150 ease-out",
                  "text-left cursor-pointer",
                  "min-h-[52px] sm:min-h-0 sm:flex-col sm:items-start sm:gap-1.5"
                )}
                onClick={() => onSuggestionClick(suggestion.prompt)}
                onMouseEnter={() => setHoveredChip(suggestion.label)}
                onMouseLeave={() => setHoveredChip(null)}
              >
                <div className="flex items-center gap-2 sm:gap-2">
                  <div
                    className={cn(
                      "flex h-9 w-9 sm:h-8 sm:w-8 items-center justify-center rounded-lg",
                      "bg-muted/50 group-hover:bg-muted",
                      "transition-colors duration-150 shrink-0"
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-4 w-4 text-muted-foreground",
                        "group-hover:text-foreground transition-colors duration-150"
                      )}
                    />
                  </div>
                  <span className="sm:hidden text-sm font-medium text-foreground">
                    {suggestion.label}
                  </span>
                </div>
                <div className="flex flex-col min-w-0 flex-1 sm:pl-0">
                  <span className="hidden sm:block text-sm sm:text-base font-medium text-foreground">
                    {suggestion.label}
                  </span>
                  <span className="text-xs sm:text-sm text-muted-foreground truncate">
                    {suggestion.description}
                  </span>
                </div>

                {/* Subtle hover effect */}
                <motion.div
                  className="absolute inset-0 rounded-xl bg-primary/5 pointer-events-none"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: isHovered ? 1 : 0 }}
                  transition={{ duration: 0.15 }}
                />
              </motion.button>
            );
          })}
        </motion.div>

        {/* Model indicator - hidden on mobile for cleaner look */}
        {modelName && (
          <motion.div
            className="hidden sm:flex mt-8 items-center gap-1.5 text-xs text-muted-foreground/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.3 }}
          >
            <Sparkles className="h-3 w-3" />
            <span>{modelName}</span>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
