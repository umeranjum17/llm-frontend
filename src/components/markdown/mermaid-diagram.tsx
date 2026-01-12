"use client";

import { useEffect, useRef, useState, memo } from "react";
import mermaid from "mermaid";
import { Button } from "@/components/ui/button";
import { Copy, Check, Download, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Initialize mermaid with dark theme support
mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  securityLevel: "loose",
  fontFamily: "inherit",
});

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
        const { svg: renderedSvg } = await mermaid.render(id, code);
        setSvg(renderedSvg);
        setError(null);
      } catch (err) {
        console.error("Mermaid rendering error:", err);
        setError(err instanceof Error ? err.message : "Failed to render diagram");
        setSvg("");
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
    return (
      <div className="my-4 rounded-lg border border-red-500/20 bg-red-500/10 p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-red-500">Mermaid Diagram Error</span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleCopy}>
            {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
        <pre className="text-xs text-red-400 whitespace-pre-wrap">{error}</pre>
        <details className="mt-2">
          <summary className="text-xs text-muted-foreground cursor-pointer">Show source</summary>
          <pre className="mt-2 text-xs text-muted-foreground overflow-x-auto">{code}</pre>
        </details>
      </div>
    );
  }

  return (
    <>
      <div className={cn("group relative my-4", className)}>
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
          className="overflow-x-auto rounded-b-lg bg-[#0d1117] p-4 flex items-center justify-center min-h-[200px]"
        >
          {svg ? (
            <div
              className="[&>svg]:max-w-full [&>svg]:h-auto"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          ) : (
            <div className="text-muted-foreground text-sm">Rendering diagram...</div>
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
            className="max-w-full max-h-full overflow-auto [&>svg]:max-w-full [&>svg]:h-auto"
            dangerouslySetInnerHTML={{ __html: svg }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
});
