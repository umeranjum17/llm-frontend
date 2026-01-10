"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { FeatureCard } from "./feature-card";
import {
  Sparkles,
  Zap,
  DollarSign,
  Shield,
  Bot,
  FileText,
  Folder,
  GitBranch,
  Eye,
  Layout,
  Tag,
  Search,
  Keyboard,
  Download,
  Trophy,
  Code,
  Wrench,
  Brain,
  Mic,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface FeatureStep {
  title: string;
  description: string;
  features: Array<{
    icon: typeof Sparkles;
    title: string;
    description: string;
  }>;
}

const FEATURE_STEPS: FeatureStep[] = [
  {
    title: "Core Power",
    description: "Everything you need for powerful AI interactions",
    features: [
      {
        icon: Sparkles,
        title: "100+ Models",
        description: "Access models from OpenAI, Anthropic, Google, and more via OpenRouter",
      },
      {
        icon: Zap,
        title: "Real-time Streaming",
        description: "See responses stream in real-time with smooth, fast performance",
      },
      {
        icon: DollarSign,
        title: "Cost Tracking",
        description: "Track costs per message and per chat with budget controls",
      },
      {
        icon: Shield,
        title: "Local-First Privacy",
        description: "All data stored locally. Your API keys encrypted. Complete privacy",
      },
      {
        icon: Eye,
        title: "Vision Support",
        description: "Upload images and let AI models analyze them with vision capabilities",
      },
    ],
  },
  {
    title: "Advanced Capabilities",
    description: "Take your AI workflow to the next level",
    features: [
      {
        icon: Bot,
        title: "AI Agents",
        description: "6 built-in agents plus create custom agents with specialized prompts",
      },
      {
        icon: FileText,
        title: "Prompt Library",
        description: "Save and reuse prompts with variable substitution for efficiency",
      },
      {
        icon: Folder,
        title: "Projects & Files",
        description: "Organize chats by project with file attachments and context",
      },
      {
        icon: GitBranch,
        title: "Conversation Branching",
        description: "Fork conversations, explore alternatives, and navigate conversation trees",
      },
      {
        icon: Code,
        title: "Interactive Artifacts",
        description: "View and execute code artifacts with syntax highlighting and sandbox",
      },
    ],
  },
  {
    title: "Organization & Productivity",
    description: "Stay organized and work efficiently",
    features: [
      {
        icon: Layout,
        title: "Multi-Tab Chats",
        description: "Work with multiple conversations side-by-side in tabs",
      },
      {
        icon: Tag,
        title: "Tags & Folders",
        description: "Organize chats with tags and folders for easy navigation",
      },
      {
        icon: Search,
        title: "Fast Search",
        description: "Instantly search through all your chats and messages",
      },
      {
        icon: Keyboard,
        title: "Keyboard Shortcuts",
        description: "Power user shortcuts including Cmd+K command palette",
      },
      {
        icon: Download,
        title: "Export & Import",
        description: "Export your data or import from other tools",
      },
    ],
  },
  {
    title: "Power Features",
    description: "Advanced features for power users",
    features: [
      {
        icon: Trophy,
        title: "Arena Mode",
        description: "Compare multiple models side-by-side to find the best response",
      },
      {
        icon: Wrench,
        title: "Web Search Tools",
        description: "Enable AI to search the web with multiple providers (Tavily, Serper, Brave)",
      },
      {
        icon: Brain,
        title: "Memory System",
        description: "AI remembers facts and preferences across conversations",
      },
      {
        icon: Mic,
        title: "Voice Input",
        description: "Speak your messages using browser speech recognition",
      },
      {
        icon: Shield,
        title: "Trust Dashboard",
        description: "See exactly where your data goes with full transparency",
      },
    ],
  },
];

interface FeatureShowcaseProps {
  onComplete: () => void;
  onSkip: () => void;
}

export function FeatureShowcase({ onComplete, onSkip }: FeatureShowcaseProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const handleNext = () => {
    if (currentStep < FEATURE_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const currentStepData = FEATURE_STEPS[currentStep];
  const progress = ((currentStep + 1) / FEATURE_STEPS.length) * 100;

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center p-4">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-muted/20" />

      <div className="relative z-10 w-full max-w-5xl">
        {/* Progress bar */}
        <div className="mb-8">
          <div className="mb-2 flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Step {currentStep + 1} of {FEATURE_STEPS.length}
            </span>
            <div className="flex items-center gap-3">
              <span>{Math.round(progress)}%</span>
              {/* Skip button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={onSkip}
                className="h-7 w-7"
                aria-label="Skip tour"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <motion.div
              className="h-full bg-primary"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </div>

        {/* Step content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="mb-8"
          >
            <div className="mb-6 text-center">
              <h2 className="mb-2 text-3xl font-bold">{currentStepData.title}</h2>
              <p className="text-lg text-muted-foreground">{currentStepData.description}</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {currentStepData.features.map((feature, index) => (
                <FeatureCard
                  key={feature.title}
                  icon={feature.icon}
                  title={feature.title}
                  description={feature.description}
                  delay={index * 0.1}
                />
              ))}
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div className="flex items-center justify-between gap-4">
          <Button
            variant="outline"
            onClick={handlePrevious}
            disabled={currentStep === 0}
            className="gap-2"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>

          <div className="flex gap-2">
            {FEATURE_STEPS.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentStep(index)}
                className={cn(
                  "h-2 w-2 rounded-full transition-all",
                  index === currentStep
                    ? "w-8 bg-primary"
                    : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
                )}
                aria-label={`Go to step ${index + 1}`}
              />
            ))}
          </div>

          <Button onClick={handleNext} className="gap-2" size="lg">
            {currentStep === FEATURE_STEPS.length - 1 ? "Get Started" : "Next"}
            {currentStep < FEATURE_STEPS.length - 1 && <ChevronRight className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
