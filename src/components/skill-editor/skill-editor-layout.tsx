"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SkillEditorLayoutProps {
  header: ReactNode;
  footer: ReactNode;
  children: ReactNode;
  preview?: ReactNode;
  showPreview?: boolean;
}

export function SkillEditorLayout({
  header,
  footer,
  children,
  preview,
  showPreview = false,
}: SkillEditorLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col">
      {header}

      {/* Desktop Layout (md+) */}
      <div className="hidden md:flex flex-1 overflow-hidden">
        {/* Main Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="container max-w-5xl mx-auto px-6 py-4">
            {children}
          </div>
        </main>

        {/* Preview Sidebar (desktop only) */}
        {showPreview && preview && (
          <aside className="w-[400px] border-l bg-muted/20 overflow-y-auto">
            <div className="p-6 space-y-6">
              {preview}
            </div>
          </aside>
        )}
      </div>

      {/* Mobile Layout */}
      <div className="md:hidden flex-1 overflow-y-auto">
        <main className="container max-w-2xl mx-auto p-4 pb-40">
          {children}
        </main>
      </div>

      {footer}
    </div>
  );
}
