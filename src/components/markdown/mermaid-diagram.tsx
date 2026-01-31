"use client";

import { useEffect, useRef, useState, useCallback, memo } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check, Download, Maximize2, Minimize2, ZoomIn, ZoomOut, RotateCcw, Image } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
      flowchart: { useMaxWidth: true, htmlLabels: true, padding: 16, curve: "linear" },
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

/** Detect the diagram type from mermaid source */
function detectDiagramType(code: string): string {
  const first = code.trim().split(/[\s\n{]/)[0].toLowerCase();
  const typeMap: Record<string, string> = {
    graph: "flowchart", flowchart: "flowchart", sequencediagram: "sequence",
    classdiagram: "class", "statediagram-v2": "state", statediagram: "state",
    erdiagram: "ER", gantt: "gantt", pie: "pie", journey: "journey",
    mindmap: "mindmap", gitgraph: "git", timeline: "timeline",
    quadrantchart: "quadrant", sankey: "sankey", xychart: "xy-chart", block: "block",
  };
  return typeMap[first] || first;
}

interface MermaidDiagramProps {
  code: string;
  className?: string;
}

export const MermaidDiagram = memo(function MermaidDiagram({ code, className }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgWrapperRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const lastTouchDistRef = useRef<number | null>(null);

  const diagramType = detectDiagramType(code);

  useEffect(() => {
    async function renderDiagram() {
      if (!code.trim()) return;

      try {
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
        document.querySelectorAll('[id^="dmermaid-"], [id^="d"].mermaid, .mermaid-error, #dmermaid').forEach(el => {
          el.remove();
        });
      }
    }

    renderDiagram();
  }, [code]);

  // Reset zoom/pan when toggling fullscreen
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [isFullscreen]);

  // Keyboard shortcuts in fullscreen
  useEffect(() => {
    if (!isFullscreen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsFullscreen(false);
      if (e.key === "+" || e.key === "=") setZoom(z => Math.min(z + 0.25, 5));
      if (e.key === "-") setZoom(z => Math.max(z - 0.25, 0.25));
      if (e.key === "0" || e.key === "r") { setZoom(1); setPan({ x: 0, y: 0 }); }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isFullscreen]);

  const handleZoomIn = useCallback(() => setZoom(z => Math.min(z + 0.25, 5)), []);
  const handleZoomOut = useCallback(() => setZoom(z => Math.max(z - 0.25, 0.25)), []);
  const handleResetZoom = useCallback(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, []);

  // Wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setZoom(z => Math.max(0.25, Math.min(5, z + delta)));
    }
  }, []);

  // Mouse pan
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsPanning(true);
    panStartRef.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return;
    setPan({
      x: panStartRef.current.panX + (e.clientX - panStartRef.current.x),
      y: panStartRef.current.panY + (e.clientY - panStartRef.current.y),
    });
  }, [isPanning]);

  const handleMouseUp = useCallback(() => setIsPanning(false), []);

  // Touch pinch-to-zoom and pan
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      if (lastTouchDistRef.current !== null) {
        const delta = (dist - lastTouchDistRef.current) * 0.005;
        setZoom(z => Math.max(0.25, Math.min(5, z + delta)));
      }
      lastTouchDistRef.current = dist;
    } else if (e.touches.length === 1 && isPanning) {
      setPan({
        x: panStartRef.current.panX + (e.touches[0].clientX - panStartRef.current.x),
        y: panStartRef.current.panY + (e.touches[0].clientY - panStartRef.current.y),
      });
    }
  }, [isPanning]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsPanning(true);
      panStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, panX: pan.x, panY: pan.y };
    }
    lastTouchDistRef.current = null;
  }, [pan]);

  const handleTouchEnd = useCallback(() => {
    setIsPanning(false);
    lastTouchDistRef.current = null;
  }, []);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadSvg = () => {
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

  const handleDownloadPng = async () => {
    if (!svg) return;
    try {
      const parser = new DOMParser();
      const svgDoc = parser.parseFromString(svg, "image/svg+xml");
      const svgEl = svgDoc.querySelector("svg");
      if (!svgEl) return;

      const viewBox = svgEl.getAttribute("viewBox");
      let w = 1200, h = 800;
      if (viewBox) {
        const parts = viewBox.split(/[\s,]+/).map(Number);
        if (parts.length === 4) { w = parts[2]; h = parts[3]; }
      }

      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = w * scale;
      canvas.height = h * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.fillStyle = "#0d1117";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const svgClone = svgEl.cloneNode(true) as SVGSVGElement;
      svgClone.setAttribute("width", String(w * scale));
      svgClone.setAttribute("height", String(h * scale));

      const svgStr = new XMLSerializer().serializeToString(svgClone);
      const img = new window.Image();
      const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);

      await new Promise<void>((resolve, reject) => {
        img.onload = () => {
          ctx.drawImage(img, 0, 0);
          URL.revokeObjectURL(url);
          resolve();
        };
        img.onerror = reject;
        img.src = url;
      });

      canvas.toBlob((pngBlob) => {
        if (!pngBlob) return;
        const pngUrl = URL.createObjectURL(pngBlob);
        const link = document.createElement("a");
        link.href = pngUrl;
        link.download = `diagram-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(pngUrl);
      }, "image/png");
    } catch (err) {
      console.error("PNG export failed:", err);
    }
  };

  const zoomPercent = Math.round(zoom * 100);
  const transformStyle = { transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "center center" };

  const ZoomControls = ({ compact = false }: { compact?: boolean }) => (
    <div className={cn("flex items-center gap-0.5 rounded-md border bg-background/80 backdrop-blur-sm", compact ? "p-0.5" : "p-0.5")}>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleZoomOut} title="Zoom out (-)">
        <ZoomOut className="h-3.5 w-3.5" />
      </Button>
      <span className="text-[10px] tabular-nums text-muted-foreground min-w-[3ch] text-center select-none">{zoomPercent}%</span>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleZoomIn} title="Zoom in (+)">
        <ZoomIn className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleResetZoom} title="Reset (0)">
        <RotateCcw className="h-3 w-3" />
      </Button>
    </div>
  );

  // Mermaid-rendered SVG (trusted library output, not user content)
  const svgContent = (
    <div
      className="w-full flex justify-center [&>svg]:max-w-full [&>svg]:h-auto transition-transform duration-75"
      style={transformStyle}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );

  if (error) {
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
        {/* Header */}
        <div className="flex items-center justify-between rounded-t-lg bg-primary/5 border-b border-white/5 px-2 sm:px-4 py-1.5 sm:py-2 text-sm font-medium text-primary">
          <div className="flex items-center gap-2">
            <span>mermaid</span>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-normal text-muted-foreground border-muted-foreground/30">
              {diagramType}
            </Badge>
          </div>
          <div className="flex items-center gap-0.5 sm:gap-1">
            <div className="hidden sm:flex">
              <ZoomControls compact />
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 sm:h-8 sm:w-8"
              onClick={() => setIsFullscreen(true)}
              title="View fullscreen"
            >
              <Maximize2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 sm:h-8 sm:w-8 hidden sm:inline-flex"
              onClick={handleDownloadPng}
              title="Download PNG"
              disabled={!svg}
            >
              <Image className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 sm:h-8 sm:w-8"
              onClick={handleDownloadSvg}
              title="Download SVG"
              disabled={!svg}
            >
              <Download className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 sm:h-8 sm:w-8"
              onClick={handleCopy}
              title="Copy source"
            >
              {copied ? <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-green-500" /> : <Copy className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
            </Button>
          </div>
        </div>

        {/* Diagram area with zoom/pan */}
        <div
          ref={containerRef}
          className={cn(
            "overflow-hidden rounded-b-lg bg-[#0d1117] p-4 min-h-[200px] max-h-[70vh]",
            isPanning ? "cursor-grabbing" : "cursor-grab"
          )}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {svg ? (
            <div ref={svgWrapperRef}>
              {svgContent}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-[200px] gap-3">
              {/* Shimmer loading skeleton */}
              <div className="w-3/4 space-y-3 animate-pulse">
                <div className="h-4 bg-white/5 rounded w-2/3 mx-auto" />
                <div className="h-20 bg-white/5 rounded" />
                <div className="flex gap-2 justify-center">
                  <div className="h-8 w-20 bg-white/5 rounded" />
                  <div className="h-8 w-24 bg-white/5 rounded" />
                  <div className="h-8 w-16 bg-white/5 rounded" />
                </div>
                <div className="h-12 bg-white/5 rounded w-1/2 mx-auto" />
              </div>
              <span className="text-xs text-muted-foreground">Rendering {diagramType} diagram...</span>
            </div>
          )}
        </div>
      </div>

      {/* Fullscreen modal */}
      {isFullscreen && (
        <div
          className="fixed inset-0 z-50 bg-[#0d1117]/98 backdrop-blur-md flex flex-col"
          onClick={() => setIsFullscreen(false)}
        >
          {/* Fullscreen header */}
          <div
            className="flex items-center justify-between px-4 py-2 border-b border-white/10 bg-[#0d1117]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-primary">mermaid</span>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-normal text-muted-foreground border-muted-foreground/30">
                {diagramType}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <ZoomControls />
              <div className="w-px h-5 bg-white/10" />
              <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={handleDownloadPng}>
                <Image className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">PNG</span>
              </Button>
              <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={handleDownloadSvg}>
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">SVG</span>
              </Button>
              <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={handleCopy}>
                {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">Source</span>
              </Button>
              <div className="w-px h-5 bg-white/10" />
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsFullscreen(false)} title="Close (Esc)">
                <Minimize2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Fullscreen diagram area */}
          <div
            className={cn(
              "flex-1 overflow-hidden flex items-center justify-center",
              isPanning ? "cursor-grabbing" : "cursor-grab"
            )}
            onClick={(e) => e.stopPropagation()}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div className="mermaid-container p-4 [&>div>svg]:max-w-none">
              {svgContent}
            </div>
          </div>

          {/* Bottom hint */}
          <div className="text-center py-1.5 text-[10px] text-muted-foreground/50 select-none">
            Scroll to zoom · Drag to pan · Esc to close
          </div>
        </div>
      )}
    </>
  );
});
