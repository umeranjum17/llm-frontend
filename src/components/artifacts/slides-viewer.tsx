"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Maximize2, Minimize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { ExportButton } from "@/components/artifacts/export-button";
import { useUIStore } from "@/stores/ui-store";
import { motion, AnimatePresence } from "framer-motion";

interface SlidesViewerProps {
  content: string;
}

function parseSlideContent(content: string): string[] {
  return content
    .split(/\n---\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function SlidesViewer({ content }: SlidesViewerProps) {
  const slides = parseSlideContent(content);
  const [current, setCurrent] = useState(0);
  const slideRef = useRef<HTMLDivElement>(null);
  const [direction, setDirection] = useState(0);
  const artifactsFullscreen = useUIStore((s) => s.artifactsFullscreen);
  const setArtifactsFullscreen = useUIStore((s) => s.setArtifactsFullscreen);

  const total = slides.length;

  const goTo = useCallback(
    (index: number) => {
      if (index < 0 || index >= total) return;
      setDirection(index > current ? 1 : -1);
      setCurrent(index);
    },
    [current, total]
  );

  const prev = useCallback(() => goTo(current - 1), [goTo, current]);
  const next = useCallback(() => goTo(current + 1), [goTo, current]);

  // Touch swipe support
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
    touchStartRef.current = null;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      if (dx < 0) next();
      else prev();
    }
  }, [next, prev]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [prev, next]);

  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        No slides found
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Slide area — 16:9 aspect ratio */}
      <div
        className="flex-1 flex items-center justify-center p-4 sm:p-8 overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div ref={slideRef} className="relative w-full max-w-4xl" style={{ aspectRatio: "16/9" }}>
          <div className="absolute inset-0 rounded-xl border bg-card shadow-lg overflow-hidden">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={current}
                initial={{ x: direction * 100, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: direction * -100, opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className="absolute inset-0 overflow-auto p-6 sm:p-10 prose prose-sm dark:prose-invert max-w-none"
              >
                <MarkdownRenderer content={slides[current]} />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="shrink-0 flex flex-wrap items-center justify-center gap-3 sm:gap-4 pb-4 px-4">
        <Button
          variant="outline"
          size="icon"
          className="h-10 w-10 sm:h-8 sm:w-8"
          onClick={prev}
          disabled={current === 0}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div className="flex items-center gap-1.5">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i)}
              className={cn(
                "h-2 rounded-full transition-all",
                i === current
                  ? "w-6 bg-primary"
                  : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50"
              )}
            />
          ))}
        </div>

        <span className="text-xs text-muted-foreground tabular-nums min-w-[3rem] text-center">
          {current + 1} / {total}
        </span>

        <Button
          variant="outline"
          size="icon"
          className="h-10 w-10 sm:h-8 sm:w-8"
          onClick={next}
          disabled={current === total - 1}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>

        <Button
          variant="outline"
          size="icon"
          className="h-10 w-10 sm:h-8 sm:w-8"
          onClick={() => setArtifactsFullscreen(!artifactsFullscreen)}
          title={artifactsFullscreen ? "Exit fullscreen" : "Fullscreen"}
        >
          {artifactsFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </Button>

        <div className="flex items-center gap-1.5 basis-full sm:basis-auto justify-center sm:ml-4">
          <ExportButton
            label="PPTX"
            onClick={async () => {
              const { exportSlidesToPptx } = await import("@/lib/utils/export-utils");
              await exportSlidesToPptx(content, "Presentation");
            }}
          />
          <ExportButton
            label="PDF"
            onClick={async () => {
              if (slideRef.current) {
                const { exportToPdf } = await import("@/lib/utils/export-utils");
                await exportToPdf(slideRef.current, "Presentation");
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}
