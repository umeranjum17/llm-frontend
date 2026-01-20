"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { SelectableCard } from "../selectable-card";
import { MessageSquare, Code, Search, Bot } from "lucide-react";

const USE_CASES = [
  {
    id: "chat",
    icon: <MessageSquare className="h-5 w-5" />,
    title: "Chat with AI about projects",
    description: "Get help, brainstorm ideas, and discuss your work",
  },
  {
    id: "code",
    icon: <Code className="h-5 w-5" />,
    title: "Write & review code",
    description: "Build features, fix bugs, and improve code quality",
  },
  {
    id: "research",
    icon: <Search className="h-5 w-5" />,
    title: "Research & analyze information",
    description: "Gather insights, summarize docs, and learn new topics",
  },
  {
    id: "agents",
    icon: <Bot className="h-5 w-5" />,
    title: "Build AI agents",
    description: "Create autonomous tools that automate tasks",
  },
];

interface UseCaseStepProps {
  onComplete: (useCase: string) => void;
}

export function UseCaseStep({ onComplete }: UseCaseStepProps) {
  const [selectedUseCase, setSelectedUseCase] = useState<string | null>(null);

  useEffect(() => {
    if (selectedUseCase) {
      const timer = setTimeout(() => {
        onComplete(selectedUseCase);
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [selectedUseCase, onComplete]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">
          What do you want to do?
        </h1>
        <p className="text-muted-foreground">
          Pick your main use case. You can always do more later.
        </p>
      </div>

      {/* Use Case Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
        {USE_CASES.map((useCase) => (
          <motion.div
            key={useCase.id}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2 }}
          >
            <SelectableCard
              icon={useCase.icon}
              title={useCase.title}
              description={useCase.description}
              selected={selectedUseCase === useCase.id}
              onClick={() => setSelectedUseCase(useCase.id)}
            />
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
