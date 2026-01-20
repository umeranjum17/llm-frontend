"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Brain, Check } from "lucide-react";
import { updateSettings } from "@/lib/db/queries";

const BENEFITS = [
  "Remembers your preferences",
  "Learns your project context",
  "Gets smarter over time",
];

interface EnhancementStepProps {
  onComplete: () => void;
}

export function EnhancementStep({ onComplete }: EnhancementStepProps) {
  const handleEnableMemory = async () => {
    await updateSettings({ memoryEnabled: true });
    onComplete();
  };

  const handleSkip = () => {
    onComplete();
  };

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
          Improve your results
        </h1>
        <p className="text-muted-foreground">
          Enable optional features to enhance your experience
        </p>
      </div>

      {/* Memory Recommendation Card */}
      <Card className="border-2 mt-6">
        <CardContent className="p-6 space-y-4">
          {/* Icon */}
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
            <Brain className="h-6 w-6 text-primary" />
          </div>

          {/* Title */}
          <div className="space-y-1">
            <h3 className="text-xl font-semibold">Enable Memory</h3>
            <p className="text-sm text-muted-foreground">
              Let AI remember details across conversations
            </p>
          </div>

          {/* Benefits */}
          <ul className="space-y-2.5">
            {BENEFITS.map((benefit) => (
              <li key={benefit} className="flex items-start gap-2 text-sm">
                <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <span>{benefit}</span>
              </li>
            ))}
          </ul>

          {/* Actions */}
          <div className="flex flex-col gap-3 pt-2">
            <Button
              onClick={handleEnableMemory}
              className="w-full h-11"
              size="lg"
            >
              Enable Memory
            </Button>
            <Button
              onClick={handleSkip}
              variant="outline"
              className="w-full h-11"
              size="lg"
            >
              Not now
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
