"use client";

import { ReactNode } from "react";
import { Stepper, Step } from "./stepper";
import { cn } from "@/lib/utils";

interface OnboardingLayoutProps {
  steps: Step[];
  currentStep: number;
  onStepClick?: (stepIndex: number) => void;
  children: ReactNode;
  stickyFooter?: ReactNode;
}

export function OnboardingLayout({
  steps,
  currentStep,
  onStepClick,
  children,
  stickyFooter,
}: OnboardingLayoutProps) {
  const progress = ((currentStep + 1) / steps.length) * 100;

  return (
    <>
      {/* Desktop Layout (md+) */}
      <div className="min-h-screen hidden md:flex">
        {/* Left Sidebar - Stepper */}
        <aside className="w-[260px] border-r p-6 bg-muted/20">
          <div className="mb-8">
            <h2 className="text-lg font-semibold mb-1">Getting Started</h2>
            <p className="text-sm text-muted-foreground">
              Complete your setup in {steps.length} steps
            </p>
          </div>
          <Stepper steps={steps} onStepClick={onStepClick} />
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-[640px]">{children}</div>
        </main>
      </div>

      {/* Mobile Layout */}
      <div className="min-h-screen flex flex-col md:hidden">
        {/* Progress Header */}
        <header className="sticky top-0 z-50 bg-background border-b">
          <div className="p-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
              <span>
                Step {currentStep + 1} of {steps.length}
              </span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 p-4 flex items-center justify-center">
          <div className="w-full max-w-lg">{children}</div>
        </main>

        {/* Sticky Footer CTA (if provided) */}
        {stickyFooter}
      </div>
    </>
  );
}
