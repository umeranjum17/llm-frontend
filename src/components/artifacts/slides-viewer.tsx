"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { ExportButton } from "@/components/artifacts/export-button";
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
      <div className="flex items-center justify-center h-full" style={{ color: "#8b8fa3" }}>
        No slides found
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ background: "#0f0f1a" }}>
      {/* Slide area — 16:9 aspect ratio */}
      <div
        className="flex-1 flex items-center justify-center p-4 sm:p-8 overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div ref={slideRef} className="relative w-full max-w-4xl" style={{ aspectRatio: "16/9" }}>
          <div
            className="absolute inset-0 rounded-xl overflow-hidden"
            style={{
              background: "linear-gradient(135deg, #1a1a2e 0%, #16162a 50%, #1a1a2e 100%)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.06)",
            }}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={current}
                initial={{ x: direction * 100, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: direction * -100, opacity: 0 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className="absolute inset-0 overflow-auto p-6 sm:p-10 slide-content"
                style={{
                  color: "#e0e0e8",
                  fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
                }}
              >
                <MarkdownRenderer content={slides[current]} insideSlides />
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
                  ? "w-6"
                  : "w-2 hover:opacity-70"
              )}
              style={{
                background: i === current ? "#a78bfa" : "rgba(255,255,255,0.2)",
              }}
            />
          ))}
        </div>

        <span className="text-xs tabular-nums min-w-[3rem] text-center" style={{ color: "#8b8fa3" }}>
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

      {/* Scoped slide typography styles */}
      <style jsx global>{`
        .slide-content h1 {
          font-size: 2rem;
          font-weight: 700;
          color: #a78bfa;
          margin: 0 0 1rem 0;
          letter-spacing: -0.02em;
          line-height: 1.2;
        }
        .slide-content h2 {
          font-size: 1.5rem;
          font-weight: 600;
          color: #a78bfa;
          margin: 0 0 0.75rem 0;
          line-height: 1.3;
        }
        .slide-content h3 {
          font-size: 1.25rem;
          font-weight: 600;
          color: #c4b5fd;
          margin: 0 0 0.5rem 0;
        }
        .slide-content p {
          font-size: 0.95rem;
          line-height: 1.7;
          margin: 0.5rem 0;
          color: #e0e0e8;
        }
        .slide-content ul, .slide-content ol {
          margin: 0.5rem 0 0.5rem 1.5rem;
          padding: 0;
        }
        .slide-content li {
          font-size: 0.95rem;
          line-height: 1.7;
          margin: 0.25rem 0;
          color: #e0e0e8;
        }
        .slide-content strong {
          color: #c4b5fd;
          font-weight: 600;
        }
        .slide-content em {
          color: #d1d5db;
        }
        .slide-content code {
          font-size: 0.85rem;
          background: rgba(255,255,255,0.08);
          padding: 0.15rem 0.4rem;
          border-radius: 0.25rem;
          color: #e0e0e8;
        }
        .slide-content blockquote {
          border-left: 3px solid #a78bfa;
          background: rgba(167,139,250,0.08);
          padding: 0.5rem 1rem;
          border-radius: 0 0.5rem 0.5rem 0;
          margin: 0.75rem 0;
        }
        .slide-content img {
          border-radius: 0.5rem;
          max-width: 100%;
        }
        .slide-content a {
          color: #93c5fd;
          text-decoration: underline;
        }
        .slide-content table {
          width: 100%;
          border-collapse: collapse;
          margin: 0.75rem 0;
        }
        .slide-content th {
          background: rgba(255,255,255,0.06);
          padding: 0.5rem 0.75rem;
          text-align: left;
          font-size: 0.85rem;
          font-weight: 600;
          color: #c4b5fd;
          border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        .slide-content td {
          padding: 0.4rem 0.75rem;
          font-size: 0.85rem;
          border-bottom: 1px solid rgba(255,255,255,0.05);
          color: #e0e0e8;
        }
        .slide-content hr {
          border: none;
          border-top: 1px solid rgba(255,255,255,0.1);
          margin: 1rem 0;
        }
        /* Title slide: center single h1 */
        .slide-content > div > h1:first-child:last-child {
          text-align: center;
          margin-top: 20%;
          font-size: 2.5rem;
        }
        .slide-content > div > h1:first-child + p:last-child {
          text-align: center;
        }
        @media (min-width: 640px) {
          .slide-content h1 { font-size: 2.5rem; }
          .slide-content h2 { font-size: 1.75rem; }
          .slide-content p, .slide-content li { font-size: 1.05rem; }
          .slide-content > div > h1:first-child:last-child { font-size: 3rem; }
        }
      `}</style>
    </div>
  );
}
