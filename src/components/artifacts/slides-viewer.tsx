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
  :root {
    --accent-primary: #6366f1;
    --accent-secondary: #8b5cf6;
    --accent-tertiary: #a855f7;
    --glass-bg: rgba(255, 255, 255, 0.03);
    --glass-border: rgba(255, 255, 255, 0.08);
    --text-primary: rgba(255, 255, 255, 0.95);
    --text-secondary: rgba(255, 255, 255, 0.7);
    --text-muted: rgba(255, 255, 255, 0.5);
  }
  html, body { margin: 0; padding: 0; overflow: hidden; width: 100%; height: 100%; }
  .reveal { width: 100%; height: 100%; }
  .reveal .slides { text-align: left; }

  /* Slide container with subtle gradient overlay */
  .reveal .slides section {
    text-align: left;
    padding: 56px 72px;
    height: 100%;
    box-sizing: border-box;
    position: relative;
  }

  /* Add subtle gradient mesh to each slide */
  .reveal .slides section::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background:
      radial-gradient(ellipse at 20% 20%, rgba(99, 102, 241, 0.08) 0%, transparent 50%),
      radial-gradient(ellipse at 80% 80%, rgba(139, 92, 246, 0.06) 0%, transparent 50%),
      radial-gradient(ellipse at 50% 50%, rgba(168, 85, 247, 0.04) 0%, transparent 70%);
    pointer-events: none;
    z-index: 0;
  }

  .reveal .slides section > * {
    position: relative;
    z-index: 1;
  }

  /* Typography - Headers with gradient text */
  .reveal .slides section h1,
  .reveal .slides section h2,
  .reveal .slides section h3 {
    text-transform: none;
    text-align: left;
    font-weight: 700;
    letter-spacing: -0.03em;
    line-height: 1.2;
  }

  .reveal .slides section h1 {
    font-size: 2.5em;
    margin-bottom: 0.5em;
    background: linear-gradient(135deg, var(--text-primary) 0%, var(--accent-primary) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .reveal .slides section h2 {
    font-size: 1.75em;
    margin-bottom: 0.6em;
    color: var(--text-primary);
  }

  .reveal .slides section h3 {
    font-size: 1.3em;
    margin-bottom: 0.5em;
    color: var(--accent-primary);
  }

  /* Body text */
  .reveal .slides section p {
    font-size: 1em;
    line-height: 1.8;
    color: var(--text-secondary);
    max-width: 90%;
  }

  /* Lists with custom markers */
  .reveal .slides section ul,
  .reveal .slides section ol {
    display: block;
    margin-left: 0;
    padding-left: 0;
  }

  .reveal .slides section ul {
    list-style: none;
  }

  .reveal .slides section ul li {
    position: relative;
    padding-left: 1.5em;
    margin-bottom: 0.7em;
    font-size: 1em;
    line-height: 1.7;
    color: var(--text-secondary);
  }

  .reveal .slides section ul li::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0.6em;
    width: 6px;
    height: 6px;
    background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
    border-radius: 50%;
  }

  .reveal .slides section ol li {
    margin-bottom: 0.7em;
    font-size: 1em;
    line-height: 1.7;
    color: var(--text-secondary);
    padding-left: 0.5em;
  }

  /* Strong/bold text with accent */
  .reveal .slides section strong {
    color: var(--text-primary);
    font-weight: 600;
  }

  /* Code blocks with glass effect */
  .reveal .slides section code {
    font-size: 0.85em;
    padding: 4px 10px;
    border-radius: 6px;
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    color: var(--accent-primary);
    font-family: 'SF Mono', 'Fira Code', monospace;
  }

  .reveal .slides section pre {
    font-size: 0.65em;
    width: 100%;
    background: rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(10px);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05);
    border-radius: 12px;
    border: 1px solid var(--glass-border);
    padding: 20px;
    margin: 1em 0;
  }

  .reveal .slides section pre code {
    background: transparent;
    border: none;
    padding: 0;
    color: inherit;
  }

  /* Blockquotes with modern styling */
  .reveal .slides section blockquote {
    width: 90%;
    font-size: 1.1em;
    padding: 24px 32px;
    margin: 1.5em 0;
    border-left: none;
    border-radius: 12px;
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(139, 92, 246, 0.05));
    border: 1px solid var(--glass-border);
    font-style: normal;
    color: var(--text-primary);
    position: relative;
  }

  .reveal .slides section blockquote::before {
    content: '"';
    position: absolute;
    top: -10px;
    left: 20px;
    font-size: 4em;
    color: var(--accent-primary);
    opacity: 0.3;
    font-family: Georgia, serif;
    line-height: 1;
  }

  .reveal .slides section blockquote p {
    color: var(--text-primary);
    font-size: 1em;
    margin: 0;
  }

  /* Tables with glass morphism */
  .reveal .slides section table {
    font-size: 0.85em;
    border-collapse: separate;
    border-spacing: 0;
    width: 100%;
    border-radius: 12px;
    overflow: hidden;
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
  }

  .reveal .slides section table th,
  .reveal .slides section table td {
    padding: 14px 18px;
    border: none;
    border-bottom: 1px solid var(--glass-border);
    text-align: left;
  }

  .reveal .slides section table th {
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(139, 92, 246, 0.1));
    color: var(--text-primary);
    font-weight: 600;
    text-transform: uppercase;
    font-size: 0.75em;
    letter-spacing: 0.05em;
  }

  .reveal .slides section table td {
    color: var(--text-secondary);
  }

  .reveal .slides section table tr:last-child td {
    border-bottom: none;
  }

  .reveal .slides section table tr:hover td {
    background: rgba(255, 255, 255, 0.02);
  }

  /* Images */
  .reveal .slides section img {
    max-height: 50vh;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    border: 1px solid var(--glass-border);
  }

  /* Mermaid diagrams */
  .reveal .slides section .mermaid {
    background: var(--glass-bg);
    border-radius: 12px;
    border: 1px solid var(--glass-border);
    text-align: center;
    padding: 24px;
    margin: 1em 0;
  }

  .reveal .slides section .mermaid svg {
    max-height: 50vh;
    max-width: 100%;
  }

  /* Horizontal rules as gradient dividers */
  .reveal .slides section hr {
    border: none;
    height: 2px;
    background: linear-gradient(90deg, transparent, var(--accent-primary), var(--accent-secondary), transparent);
    margin: 2em 0;
  }

  /* Hide controls, show minimal progress */
  .reveal .controls { display: none !important; }
  .reveal .progress {
    height: 3px;
    background: rgba(255, 255, 255, 0.1);
  }
  .reveal .progress span {
    background: linear-gradient(90deg, var(--accent-primary), var(--accent-secondary));
  }

  /* Slide number styling */
  .reveal .slide-number {
    background: var(--glass-bg);
    border: 1px solid var(--glass-border);
    border-radius: 8px;
    padding: 8px 12px;
    color: var(--text-muted);
    font-size: 0.8em;
  }
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
      primaryColor: '#4a5568',
      primaryTextColor: '#e2e8f0',
      primaryBorderColor: '#718096',
      secondaryColor: '#2d3748',
      secondaryTextColor: '#e2e8f0',
      secondaryBorderColor: '#4a5568',
      lineColor: '#718096',
      textColor: '#e2e8f0',
      mainBkg: '#4a5568',
      nodeBorder: '#718096',
      clusterBkg: '#2d3748',
      clusterBorder: '#4a5568',
      titleColor: '#e2e8f0',
      edgeLabelBackground: 'transparent',
      nodeTextColor: '#e2e8f0',
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
