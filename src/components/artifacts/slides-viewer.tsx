"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Palette, Keyboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { ExportButton } from "@/components/artifacts/export-button";

interface SlidesViewerProps {
  content: string;
}

const REVEAL_THEMES = [
  { id: "black", label: "Black", swatch: "#191919", text: "#fff" },
  { id: "white", label: "White", swatch: "#fff", text: "#222" },
  { id: "moon", label: "Moon", swatch: "#002b36", text: "#93a1a1" },
  { id: "night", label: "Night", swatch: "#111", text: "#eee" },
  { id: "league", label: "League", swatch: "#2b2b2b", text: "#eee" },
  { id: "solarized", label: "Solarized", swatch: "#fdf6e3", text: "#657b83" },
  { id: "dracula", label: "Dracula", swatch: "#282a36", text: "#f8f8f2" },
  { id: "beige", label: "Beige", swatch: "#f7f3de", text: "#333" },
  { id: "sky", label: "Sky", swatch: "#add9e4", text: "#333" },
  { id: "serif", label: "Serif", swatch: "#f0edde", text: "#000" },
  { id: "simple", label: "Simple", swatch: "#fff", text: "#000" },
  { id: "blood", label: "Blood", swatch: "#222", text: "#a23" },
] as const;

function countSlides(content: string): number {
  return content
    .split(/\n---\n/)
    .map((s) => s.trim())
    .filter(Boolean).length;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildRevealHtml(content: string, theme: string): string {
  const escaped = escapeHtml(content);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/reveal.min.css">
<link id="reveal-theme" rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/theme/${theme}.min.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/plugin/highlight/monokai.min.css">
<style>
  html, body { margin: 0; padding: 0; overflow: hidden; width: 100%; height: 100%; }
  .reveal { width: 100%; height: 100%; }
  .reveal .slides { text-align: left; }
  .reveal .slides section {
    text-align: left;
    padding: 40px 60px;
    height: 100%;
    box-sizing: border-box;
  }
  .reveal .slides section h1,
  .reveal .slides section h2,
  .reveal .slides section h3 {
    text-transform: none;
    text-align: left;
  }
  .reveal .slides section h1 { font-size: 1.8em; margin-bottom: 0.5em; }
  .reveal .slides section h2 { font-size: 1.4em; margin-bottom: 0.4em; }
  .reveal .slides section h3 { font-size: 1.1em; margin-bottom: 0.3em; }
  .reveal .slides section ul,
  .reveal .slides section ol {
    display: block;
    margin-left: 1em;
  }
  .reveal .slides section li {
    margin-bottom: 0.4em;
    font-size: 0.85em;
    line-height: 1.6;
  }
  .reveal .slides section p {
    font-size: 0.85em;
    line-height: 1.6;
  }
  .reveal .slides section code {
    font-size: 0.8em;
    padding: 2px 6px;
    border-radius: 4px;
  }
  .reveal .slides section pre {
    font-size: 0.55em;
    width: 100%;
    box-shadow: none;
    border-radius: 8px;
  }
  .reveal .slides section blockquote {
    width: 90%;
    font-size: 0.85em;
    padding: 10px 20px;
  }
  .reveal .slides section table {
    font-size: 0.75em;
  }
  .reveal .slides section img {
    max-height: 50vh;
    border-radius: 8px;
  }
  .reveal .slides section .mermaid {
    background: transparent;
    text-align: center;
  }
  .reveal .slides section .mermaid svg {
    max-height: 55vh;
    max-width: 100%;
  }
  .reveal .controls { display: none !important; }
  .reveal .progress { height: 2px; opacity: 0.7; }
</style>
</head>
<body>
<div class="reveal">
  <div class="slides">
    <section data-markdown data-separator="^\\n---\\n" data-separator-vertical="^\\n--\\n">
      <textarea data-template>
${escaped}
      </textarea>
    </section>
  </div>
</div>
<script src="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/reveal.min.js"><\/script>
<script src="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/plugin/markdown/markdown.min.js"><\/script>
<script src="https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/plugin/highlight/highlight.min.js"><\/script>
<script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"><\/script>
<script>
  mermaid.initialize({
    startOnLoad: false,
    theme: 'dark',
    securityLevel: 'loose',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    themeVariables: {
      darkMode: true,
      background: 'transparent',
      primaryColor: '#4fc3f7',
      primaryTextColor: '#e0e0e0',
      lineColor: '#8b949e',
      textColor: '#e0e0e0',
    }
  });

  Reveal.initialize({
    hash: false,
    controls: false,
    progress: true,
    center: true,
    transition: 'slide',
    transitionSpeed: 'default',
    backgroundTransition: 'fade',
    embedded: true,
    keyboardCondition: 'focused',
    width: 960,
    height: 700,
    margin: 0.04,
    minScale: 0.2,
    maxScale: 2.0,
    autoAnimate: true,
    autoAnimateDuration: 0.7,
    plugins: [RevealMarkdown, RevealHighlight],
  }).then(function() {
    // Render mermaid diagrams after reveal.js processes markdown
    document.querySelectorAll('pre code.language-mermaid, pre code.mermaid').forEach(function(block) {
      var pre = block.parentElement;
      var div = document.createElement('div');
      div.className = 'mermaid';
      div.textContent = block.textContent;
      if (pre && pre.parentElement) pre.parentElement.replaceChild(div, pre);
    });
    document.querySelectorAll('code.language-mermaid').forEach(function(block) {
      var p = block.parentElement;
      if (p && p.tagName === 'PRE' && p.parentElement) {
        var div = document.createElement('div');
        div.className = 'mermaid';
        div.textContent = block.textContent;
        p.parentElement.replaceChild(div, p);
      }
    });
    mermaid.run();

    var total = Reveal.getTotalSlides();
    parent.postMessage({ event: 'ready', indexh: 0, total: total }, '*');

    Reveal.on('slidechanged', function(ev) {
      parent.postMessage({
        event: 'slidechanged',
        indexh: ev.indexh,
        total: Reveal.getTotalSlides()
      }, '*');
    });
  });

  window.addEventListener('message', function(e) {
    if (!e.data || !e.data.method) return;
    if (e.data.method === 'prev') Reveal.prev();
    if (e.data.method === 'next') Reveal.next();
    if (e.data.method === 'slide') Reveal.slide(e.data.index);
    if (e.data.method === 'setTheme') {
      var link = document.getElementById('reveal-theme');
      if (link) link.setAttribute('href', 'https://cdn.jsdelivr.net/npm/reveal.js@5.1.0/dist/theme/' + e.data.theme + '.min.css');
    }
  });
<\/script>
</body>
</html>`;
}

export function SlidesViewer({ content }: SlidesViewerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const total = useMemo(() => countSlides(content), [content]);
  const [current, setCurrent] = useState(0);
  const [ready, setReady] = useState(false);
  const [theme, setTheme] = useState("black");
  const [showThemes, setShowThemes] = useState(false);
  const [showKeys, setShowKeys] = useState(false);

  const html = useMemo(() => buildRevealHtml(content, theme), [content, theme]);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (!e.data || !e.data.event) return;
      if (e.data.event === "ready") {
        setReady(true);
        setCurrent(0);
      }
      if (e.data.event === "slidechanged") {
        setCurrent(e.data.indexh);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const postMessage = useCallback((msg: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage(msg, "*");
  }, []);

  const prev = useCallback(() => postMessage({ method: "prev" }), [postMessage]);
  const next = useCallback(() => postMessage({ method: "next" }), [postMessage]);
  const goTo = useCallback((i: number) => postMessage({ method: "slide", index: i }), [postMessage]);

  const changeTheme = useCallback((newTheme: string) => {
    setTheme(newTheme);
    postMessage({ method: "setTheme", theme: newTheme });
    setShowThemes(false);
  }, [postMessage]);

  // Progress percentage
  const progress = total > 1 ? (current / (total - 1)) * 100 : 100;

  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        No slides found
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" style={{ background: "#0c0c0c" }}>
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-3 py-1.5 border-b border-white/[0.06]" style={{ background: "#111" }}>
        <div className="flex items-center gap-2">
          {/* Theme picker */}
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs text-white/50 hover:text-white hover:bg-white/[0.06] rounded-md"
              onClick={() => { setShowThemes(!showThemes); setShowKeys(false); }}
            >
              <Palette className="h-3 w-3" />
              <span className="hidden sm:inline capitalize">{theme}</span>
            </Button>
            {showThemes && (
              <div
                className="absolute left-0 top-full mt-1.5 z-50 rounded-xl shadow-2xl p-2 grid grid-cols-3 gap-1 min-w-[240px]"
                style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                {REVEAL_THEMES.map((t) => (
                  <button
                    key={t.id}
                    className={cn(
                      "flex items-center gap-2 text-xs px-2.5 py-2 rounded-lg transition-all",
                      t.id === theme
                        ? "ring-1 ring-primary/60 bg-white/[0.06]"
                        : "hover:bg-white/[0.06]"
                    )}
                    onClick={() => changeTheme(t.id)}
                  >
                    <span
                      className="w-4 h-4 rounded-full shrink-0 ring-1 ring-inset ring-black/10"
                      style={{ background: t.swatch }}
                    />
                    <span className={t.id === theme ? "text-white font-medium" : "text-white/60"}>
                      {t.label}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Keyboard hints */}
          <div className="relative hidden sm:block">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-white/30 hover:text-white/60 hover:bg-white/[0.06]"
              onClick={() => { setShowKeys(!showKeys); setShowThemes(false); }}
            >
              <Keyboard className="h-3 w-3" />
            </Button>
            {showKeys && (
              <div
                className="absolute left-0 top-full mt-1.5 z-50 rounded-xl shadow-2xl p-3 min-w-[180px] space-y-1.5"
                style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <div className="text-[10px] text-white/30 uppercase tracking-wider font-medium mb-2">Keyboard shortcuts</div>
                {[
                  ["← →", "Navigate slides"],
                  ["Space", "Next slide"],
                  ["Esc", "Overview mode"],
                  ["F", "Fullscreen"],
                  ["S", "Speaker notes"],
                ].map(([key, desc]) => (
                  <div key={key} className="flex items-center justify-between gap-3">
                    <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.08] text-white/60 font-mono">{key}</kbd>
                    <span className="text-[10px] text-white/40">{desc}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
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
              if (containerRef.current) {
                const { exportToPdf } = await import("@/lib/utils/export-utils");
                await exportToPdf(containerRef.current, "Presentation");
              }
            }}
          />
        </div>
      </div>

      {/* Slide area */}
      <div ref={containerRef} className="flex-1 overflow-hidden relative">
        <iframe
          ref={iframeRef}
          srcDoc={html}
          className="absolute inset-0 w-full h-full border-0"
          sandbox="allow-scripts allow-same-origin"
          title="Presentation"
        />
      </div>

      {/* Controls */}
      <div className="shrink-0 flex items-center justify-center gap-3 sm:gap-4 py-2 px-4 border-t border-white/[0.06] relative" style={{ background: "#111" }}>
        {/* Progress bar */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-white/[0.04]">
          <div
            className="h-full bg-primary/60 transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-white/40 hover:text-white hover:bg-white/[0.06] disabled:opacity-20"
          onClick={prev}
          disabled={!ready || current === 0}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div className="flex items-center gap-1">
          {Array.from({ length: total }, (_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i)}
              className={cn(
                "rounded-full transition-all duration-200",
                i === current
                  ? "w-5 h-2 bg-primary/80"
                  : "w-2 h-2 bg-white/15 hover:bg-white/30"
              )}
            />
          ))}
        </div>

        <span className="text-[11px] text-white/30 tabular-nums min-w-[3rem] text-center font-mono">
          {current + 1}<span className="text-white/15"> / </span>{total}
        </span>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-white/40 hover:text-white hover:bg-white/[0.06] disabled:opacity-20"
          onClick={next}
          disabled={!ready || current === total - 1}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Backdrop for dropdowns */}
      {(showThemes || showKeys) && (
        <div className="fixed inset-0 z-40" onClick={() => { setShowThemes(false); setShowKeys(false); }} />
      )}
    </div>
  );
}
