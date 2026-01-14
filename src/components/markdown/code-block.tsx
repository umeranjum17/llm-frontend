"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check, Maximize2, ChevronRight, ChevronDown } from "lucide-react";
import { codeToHtml } from "shiki";
import { useUIStore } from "@/stores/ui-store";
import { cn } from "@/lib/utils";

// Global cache for highlighted code - survives component unmount/remount
const highlightCache = new Map<string, string>();
const MAX_CACHE_SIZE = 200;

function getCacheKey(code: string, language: string): string {
  // Use length + hash of first/last chars for faster key generation
  const len = code.length;
  const prefix = code.slice(0, 50);
  const suffix = code.slice(-50);
  return `${language}:${len}:${prefix}:${suffix}`;
}

function getCachedHighlight(code: string, language: string): string | null {
  return highlightCache.get(getCacheKey(code, language)) || null;
}

function setCachedHighlight(code: string, language: string, html: string): void {
  const key = getCacheKey(code, language);
  if (highlightCache.has(key)) {
    highlightCache.delete(key);
  } else if (highlightCache.size >= MAX_CACHE_SIZE) {
    const firstKey = highlightCache.keys().next().value;
    if (firstKey) highlightCache.delete(firstKey);
  }
  highlightCache.set(key, html);
}

interface CodeBlockProps {
  language: string;
  code: string;
  isStreaming?: boolean;
}

export function CodeBlock({ language, code, isStreaming = false }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(
    () => getCachedHighlight(code, language)
  );
  const highlightTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastCodeRef = useRef(code);
  const setShowArtifacts = useUIStore((state) => state.setShowArtifacts);
  const setActiveArtifact = useUIStore((state) => state.setActiveArtifact);

  useEffect(() => {
    // Check cache first - instant if available
    const cached = getCachedHighlight(code, language);
    if (cached) {
      setHighlightedHtml(cached);
      lastCodeRef.current = code;
      return;
    }

    // Clear pending timeout
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
    }

    // Debounce: wait for code to stabilize before highlighting
    highlightTimeoutRef.current = setTimeout(async () => {
      // Double-check code hasn't changed
      if (lastCodeRef.current !== code) {
        lastCodeRef.current = code;
      }

      try {
        const highlighted = await codeToHtml(code, {
          lang: language || "text",
          theme: "github-dark",
        });
        setCachedHighlight(code, language, highlighted);
        setHighlightedHtml(highlighted);
      } catch {
        // Keep showing plain text on error
      }
    }, 300);

    lastCodeRef.current = code;

    return () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, [code, language]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const setArtifactsFullscreen = useUIStore((state) => state.setArtifactsFullscreen);

  const handleOpenArtifact = () => {
    setActiveArtifact({
      id: crypto.randomUUID(),
      title: language ? `${language.charAt(0).toUpperCase() + language.slice(1)} Code` : "Code Snippet",
      code,
      language: language || "text",
      type: 'code',
    });
    setShowArtifacts(true);
    setArtifactsFullscreen(true);
  };

  const lineCount = code.split('\n').length;

  return (
    <div className="group relative my-3 sm:my-4 contain-layout">
      <div
        className={cn(
          "flex items-center justify-between bg-primary/5 border-b border-white/5 px-2 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-primary transition-[border-radius] duration-150",
          isExpanded ? "rounded-t-lg" : "rounded-lg"
        )}
      >
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1.5 hover:text-primary/80 transition-colors"
        >
          <span className="transition-transform duration-150" style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
            <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </span>
          <span>{language || "text"}</span>
          <span className={cn(
            "text-muted-foreground text-xs ml-1 transition-opacity duration-150",
            isExpanded ? "opacity-0 w-0 overflow-hidden" : "opacity-100"
          )}>
            ({lineCount} {lineCount === 1 ? 'line' : 'lines'})
            {isStreaming && <span className="ml-1 animate-pulse">...</span>}
          </span>
        </button>
        <div className="flex items-center gap-0.5 sm:gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 sm:h-8 sm:w-8"
            onClick={handleOpenArtifact}
            title="Open fullscreen"
          >
            <Maximize2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 sm:h-8 sm:w-8"
            onClick={handleCopy}
            title="Copy code"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-green-500" />
            ) : (
              <Copy className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            )}
          </Button>
        </div>
      </div>
      <div
        className={cn(
          "overflow-hidden rounded-b-lg bg-[#24292e] transition-all duration-200 ease-out",
          isExpanded ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
        )}
      >
        <div className="overflow-x-auto">
          {highlightedHtml ? (
            <div
              className="[&>pre]:m-0 [&>pre]:rounded-none [&>pre]:rounded-b-lg [&>pre]:bg-transparent [&>pre]:p-3 sm:[&>pre]:p-4 [&>pre]:text-[11px] sm:[&>pre]:text-[13px] [&_code]:text-[11px] sm:[&_code]:text-[13px]"
              dangerouslySetInnerHTML={{ __html: highlightedHtml }}
            />
          ) : (
            <pre className="text-[#e1e4e8] p-3 sm:p-4 m-0 font-mono text-[11px] sm:text-[13px] leading-relaxed whitespace-pre-wrap break-words">
              <code>{code}</code>
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
