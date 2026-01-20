"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Step {
  id: string;
  label: string;
  status: "pending" | "current" | "completed";
}

interface StepperProps {
  steps: Step[];
  onStepClick?: (stepIndex: number) => void;
}

export function Stepper({ steps, onStepClick }: StepperProps) {
  return (
    <nav aria-label="Progress">
      <ol className="space-y-6">
        {steps.map((step, index) => (
          <li key={step.id}>
            <button
              onClick={() => {
                if (step.status === "completed" && onStepClick) {
                  onStepClick(index);
                }
              }}
              disabled={step.status !== "completed"}
              className={cn(
                "flex items-center gap-3 text-left w-full group",
                step.status === "completed" && "cursor-pointer hover:opacity-80",
                step.status !== "completed" && "cursor-default"
              )}
            >
              {/* Step Indicator */}
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-200",
                  step.status === "completed" &&
                    "border-primary bg-primary text-primary-foreground",
                  step.status === "current" &&
                    "border-primary bg-primary text-primary-foreground",
                  step.status === "pending" &&
                    "border-muted-foreground/30 bg-background text-muted-foreground"
                )}
              >
                {step.status === "completed" ? (
                  <Check className="h-4 w-4" />
                ) : step.status === "current" ? (
                  <span className="text-sm font-semibold">{index + 1}</span>
                ) : (
                  <span className="text-sm">{index + 1}</span>
                )}
              </div>

              {/* Step Label */}
              <span
                className={cn(
                  "text-sm transition-all duration-200",
                  step.status === "current" && "font-semibold text-foreground",
                  step.status === "completed" &&
                    "text-muted-foreground group-hover:text-foreground",
                  step.status === "pending" && "text-muted-foreground"
                )}
              >
                {step.label}
              </span>
            </button>

            {/* Connector Line */}
            {index < steps.length - 1 && (
              <div className="ml-4 mt-2 mb-2 h-6 w-0.5 bg-muted-foreground/20" />
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
