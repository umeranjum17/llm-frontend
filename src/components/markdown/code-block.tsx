"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check, Maximize2 } from "lucide-react";
import { codeToHtml } from "shiki";
import { useUIStore } from "@/stores/ui-store";

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
}

export function CodeBlock({ language, code }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
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

  return (
    <div className="group relative my-4">
      <div className="flex items-center justify-between rounded-t-lg bg-primary/5 border-b border-white/5 px-4 py-2 text-sm font-medium text-primary">
        <span>{language || "text"}</span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleOpenArtifact}
            title="Open in Artifacts"
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleCopy}
            title="Copy code"
          >
            {copied ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-b-lg bg-[#24292e]">
        {highlightedHtml ? (
          <div
            className="[&>pre]:m-0 [&>pre]:rounded-none [&>pre]:rounded-b-lg [&>pre]:bg-transparent"
            dangerouslySetInnerHTML={{ __html: highlightedHtml }}
          />
        ) : (
          <pre className="text-[#e1e4e8] p-4 m-0 font-mono text-sm leading-relaxed whitespace-pre-wrap break-words">
            <code>{code}</code>
          </pre>
        )}
      </div>
    </div>
  );
}
