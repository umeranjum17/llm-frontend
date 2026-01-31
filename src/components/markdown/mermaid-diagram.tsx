"use client";

import { useEffect, useRef, useState, memo } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check, Download, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Lazy-load mermaid (~300KB) only when a diagram is actually rendered
let mermaidInstance: typeof import("mermaid").default | null = null;

async function getMermaid() {
  if (!mermaidInstance) {
    const m = await import("mermaid");
    mermaidInstance = m.default;
    mermaidInstance.initialize({
      startOnLoad: false,
      theme: "dark",
      securityLevel: "loose",
      fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
      themeVariables: {
        darkMode: true,
        background: "#0d1117",
        primaryColor: "#1f6feb",
        primaryTextColor: "#e6edf3",
        primaryBorderColor: "#388bfd",
        secondaryColor: "#161b22",
        secondaryTextColor: "#e6edf3",
        secondaryBorderColor: "#30363d",
        tertiaryColor: "#161b22",
        tertiaryTextColor: "#e6edf3",
        tertiaryBorderColor: "#30363d",
        lineColor: "#8b949e",
        textColor: "#e6edf3",
        mainBkg: "#1f6feb",
        nodeBorder: "#388bfd",
        clusterBkg: "#161b22",
        clusterBorder: "#30363d",
        titleColor: "#e6edf3",
        edgeLabelBackground: "#0d1117",
        nodeTextColor: "#e6edf3",
      },
      flowchart: { useMaxWidth: true, htmlLabels: true, padding: 16, curve: "basis" },
      sequence: { useMaxWidth: true, wrap: true },
      gantt: { useMaxWidth: true },
      class: { useMaxWidth: true },
      state: { useMaxWidth: true },
      er: { useMaxWidth: true },
      pie: { useMaxWidth: true },
      journey: { useMaxWidth: true },
      mindmap: { useMaxWidth: true },
    });
  }
  return mermaidInstance;
}

interface MermaidDiagramProps {
  code: string;
  className?: string;
}

export const MermaidDiagram = memo(function MermaidDiagram({ code, className }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    async function renderDiagram() {
      if (!code.trim()) return;

      try {
        // Generate unique ID for this diagram
        const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`;
        const mermaid = await getMermaid();
        const { svg: renderedSvg } = await mermaid.render(id, code);
        setSvg(renderedSvg);
        setError(null);
      } catch (err) {
        console.error("Mermaid rendering error:", err);
        setError(err instanceof Error ? err.message : "Failed to render diagram");
        setSvg("");
      } finally {
        // Clean up any orphaned Mermaid error elements injected into the DOM
        document.querySelectorAll('[id^="dmermaid-"], [id^="d"].mermaid, .mermaid-error, #dmermaid').forEach(el => {
          el.remove();
        });
      }
    }

    renderDiagram();
  }, [code]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!svg) return;

    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `diagram-${Date.now()}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (error) {
    // Extract a clean, short error message
    const shortError = error.split('\n')[0].slice(0, 200);

    return (
      <div className="my-4 rounded-lg border border-red-500/20 bg-red-500/10 p-4 max-w-full overflow-hidden">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-red-500">Mermaid Diagram Error</span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleCopy}>
            {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
        <p className="text-xs text-red-400 truncate">{shortError}</p>
        <details className="mt-2">
          <summary className="text-xs text-muted-foreground cursor-pointer">Show details</summary>
          <pre className="mt-2 text-xs text-red-400/70 max-h-24 overflow-auto whitespace-pre-wrap break-all">{error}</pre>
          <p className="mt-2 text-xs text-muted-foreground font-medium">Source:</p>
          <pre className="mt-1 text-xs text-muted-foreground max-h-32 overflow-auto whitespace-pre-wrap break-all">{code}</pre>
        </details>
      </div>
    );
  }

  return (
    <>
      <div className={cn("group relative my-4 mermaid-container", className)}>
        <div className="flex items-center justify-between rounded-t-lg bg-primary/5 border-b border-white/5 px-4 py-2 text-sm font-medium text-primary">
          <span>mermaid</span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setIsFullscreen(true)}
              title="View fullscreen"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleDownload}
              title="Download SVG"
              disabled={!svg}
            >
              <Download className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleCopy}
              title="Copy source"
            >
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        <div
          ref={containerRef}
          className="overflow-auto rounded-b-lg bg-[#0d1117] p-4 min-h-[200px] max-h-[70vh] touch-pan-x touch-pan-y"
        >
          {svg ? (
            <div
              className="w-full flex justify-center [&>svg]:max-w-full [&>svg]:h-auto"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Rendering diagram...</div>
          )}
        </div>
      </div>

      {/* Fullscreen modal */}
      {isFullscreen && (
        <div
          className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-8"
          onClick={() => setIsFullscreen(false)}
        >
          <div className="absolute top-4 right-4 flex gap-2">
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="h-4 w-4 mr-2" />
              Download SVG
            </Button>
            <Button variant="outline" size="sm" onClick={() => setIsFullscreen(false)}>
              Close
            </Button>
          </div>
          <div
            className="mermaid-container w-full max-w-[90vw] max-h-[85vh] overflow-auto flex items-center justify-center p-4 [&>svg]:max-w-full [&>svg]:h-auto"
            dangerouslySetInnerHTML={{ __html: svg }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
});
