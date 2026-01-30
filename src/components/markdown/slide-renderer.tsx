"use client";

import { memo, useState, useCallback, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Maximize2, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface SlideData {
  type: "title" | "content" | "quote" | "stats" | "two-column" | "closing";
  title?: string;
  subtitle?: string;
  bullets?: string[];
  quote?: string;
  attribution?: string;
  stats?: { label: string; value: string }[];
  left?: { title?: string; bullets?: string[] };
  right?: { title?: string; bullets?: string[] };
  gradient?: string;
}

interface SlidesData {
  title?: string;
  slides: SlideData[];
}

const DEFAULT_GRADIENTS = [
  "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
  "linear-gradient(135deg, #1e1b4b 0%, #312e81 100%)",
  "linear-gradient(135deg, #0c4a6e 0%, #0369a1 100%)",
  "linear-gradient(135deg, #134e4a 0%, #115e59 100%)",
  "linear-gradient(135deg, #3b0764 0%, #6b21a8 100%)",
  "linear-gradient(135deg, #7c2d12 0%, #c2410c 100%)",
  "linear-gradient(135deg, #1c1917 0%, #44403c 100%)",
  "linear-gradient(135deg, #172554 0%, #1e40af 100%)",
];

function getGradient(slide: SlideData, index: number): string {
  return slide.gradient || DEFAULT_GRADIENTS[index % DEFAULT_GRADIENTS.length];
}

function SlideContent({ slide, index }: { slide: SlideData; index: number }) {
  const bg = getGradient(slide, index);

  return (
    <div
      className="absolute inset-0 flex flex-col justify-center items-center p-8 sm:p-12 md:p-16 text-white overflow-hidden"
      style={{ background: bg }}
    >
      {slide.type === "title" && (
        <div className="text-center max-w-[85%] space-y-4">
          <h1 className="text-2xl sm:text-3xl md:text-5xl font-bold leading-tight tracking-tight">
            {slide.title}
          </h1>
          {slide.subtitle && (
            <p className="text-base sm:text-lg md:text-xl text-white/80 leading-relaxed">
              {slide.subtitle}
            </p>
          )}
        </div>
      )}

      {slide.type === "content" && (
        <div className="w-full max-w-[85%] space-y-6">
          {slide.title && (
            <h2 className="text-xl sm:text-2xl md:text-3xl font-bold">{slide.title}</h2>
          )}
          {slide.subtitle && (
            <p className="text-sm sm:text-base text-white/70">{slide.subtitle}</p>
          )}
          {slide.bullets && (
            <ul className="space-y-3">
              {slide.bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-3 text-sm sm:text-base md:text-lg text-white/90">
                  <span className="text-blue-400 mt-1 shrink-0">→</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {slide.type === "quote" && (
        <div className="text-center max-w-[80%] space-y-6">
          <blockquote className="text-lg sm:text-xl md:text-2xl italic font-light leading-relaxed text-white/90">
            &ldquo;{slide.quote}&rdquo;
          </blockquote>
          {slide.attribution && (
            <p className="text-sm sm:text-base text-white/60">— {slide.attribution}</p>
          )}
        </div>
      )}

      {slide.type === "stats" && (
        <div className="w-full max-w-[85%] space-y-6">
          {slide.title && (
            <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-center mb-8">{slide.title}</h2>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 sm:gap-8">
            {slide.stats?.map((s, i) => (
              <div key={i} className="text-center space-y-1">
                <div className="text-2xl sm:text-3xl md:text-4xl font-bold text-blue-400">{s.value}</div>
                <div className="text-xs sm:text-sm text-white/60">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {slide.type === "two-column" && (
        <div className="w-full max-w-[85%] space-y-6">
          {slide.title && (
            <h2 className="text-xl sm:text-2xl md:text-3xl font-bold">{slide.title}</h2>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
            {[slide.left, slide.right].map((col, ci) => col && (
              <div key={ci} className="space-y-3">
                {col.title && <h3 className="text-base sm:text-lg font-semibold text-blue-300">{col.title}</h3>}
                {col.bullets && (
                  <ul className="space-y-2">
                    {col.bullets.map((b, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm sm:text-base text-white/85">
                        <span className="text-blue-400 mt-0.5 shrink-0">•</span>
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {slide.type === "closing" && (
        <div className="text-center max-w-[85%] space-y-4">
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold">{slide.title || "Thank You"}</h2>
          {slide.subtitle && (
            <p className="text-base sm:text-lg text-white/70">{slide.subtitle}</p>
          )}
        </div>
      )}

      {/* Slide number */}
      <span className="absolute bottom-4 right-6 text-xs text-white/30">{index + 1}</span>
    </div>
  );
}

interface SlideRendererProps {
  code: string;
  className?: string;
}

function parseSlides(code: string): { data: SlidesData | null; error: boolean } {
  try {
    const parsed = JSON.parse(code);
    if (!parsed.slides || !Array.isArray(parsed.slides) || parsed.slides.length === 0) {
      return { data: null, error: true };
    }
    return { data: parsed, error: false };
  } catch {
    return { data: null, error: true };
  }
}

export const SlideRenderer = memo(function SlideRenderer({ code, className }: SlideRendererProps) {
  const [current, setCurrent] = useState(0);
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef(0);

  const { data, error } = useMemo(() => parseSlides(code), [code]);
  const total = data?.slides.length ?? 0;

  const goTo = useCallback((n: number) => {
    setCurrent(Math.max(0, Math.min(n, total - 1)));
  }, [total]);

  // Keyboard navigation
  useEffect(() => {
    if (!isFullscreen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); goTo(current + 1); }
      if (e.key === "ArrowLeft") { e.preventDefault(); goTo(current - 1); }
      if (e.key === "Escape") setIsFullscreen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isFullscreen, current, goTo]);

  if (error || !data) {
    return (
      <div className="my-4 rounded-lg border border-red-500/20 bg-red-500/10 p-4">
        <p className="text-sm text-red-500">Failed to parse slides data</p>
        <pre className="mt-2 text-xs text-muted-foreground overflow-auto max-h-32">{code}</pre>
      </div>
    );
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) goTo(current + (diff > 0 ? 1 : -1));
  };

  const slideView = (fullscreen: boolean) => (
    <div
      className={cn(
        "relative select-none",
        fullscreen ? "w-full h-full" : "aspect-video w-full"
      )}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={current}
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -30 }}
          transition={{ duration: 0.25, ease: "easeInOut" }}
          className="absolute inset-0"
        >
          <SlideContent slide={data.slides[current]} index={current} />
        </motion.div>
      </AnimatePresence>

      {/* Navigation arrows */}
      {current > 0 && (
        <button
          onClick={() => goTo(current - 1)}
          className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/30 text-white/70 hover:bg-black/50 hover:text-white transition-colors backdrop-blur-sm"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}
      {current < total - 1 && (
        <button
          onClick={() => goTo(current + 1)}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/30 text-white/70 hover:bg-black/50 hover:text-white transition-colors backdrop-blur-sm"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )}

      {/* Dots */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
        {data.slides.map((_, i) => (
          <button
            key={i}
            onClick={() => goTo(i)}
            className={cn(
              "w-2 h-2 rounded-full transition-all",
              i === current ? "bg-blue-400 scale-125" : "bg-white/30 hover:bg-white/50"
            )}
          />
        ))}
      </div>
    </div>
  );

  return (
    <>
      <div className={cn("group relative my-4 rounded-lg overflow-hidden border border-border/40 shadow-sm", className)}>
        {/* Toolbar */}
        <div className="flex items-center justify-between bg-primary/5 border-b border-white/5 px-4 py-2 text-sm font-medium text-primary">
          <span>{data.title || "Slides"} — {current + 1}/{total}</span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsFullscreen(true)} title="Fullscreen">
              <Maximize2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleCopy} title="Copy JSON">
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Slide area */}
        <div ref={containerRef} className="bg-[#0d1117]">
          {slideView(false)}
        </div>
      </div>

      {/* Fullscreen modal */}
      {isFullscreen && (
        <div
          className="fixed inset-0 z-50 bg-black flex flex-col"
          onClick={() => setIsFullscreen(false)}
        >
          <div className="absolute top-4 right-4 z-10 flex gap-2" onClick={(e) => e.stopPropagation()}>
            <Button variant="outline" size="sm" onClick={() => setIsFullscreen(false)}>
              Close
            </Button>
          </div>
          <div className="flex-1" onClick={(e) => e.stopPropagation()}>
            {slideView(true)}
          </div>
        </div>
      )}
    </>
  );
});
