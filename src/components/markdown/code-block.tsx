"use client";

import { useState, useEffect, useRef, useContext } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check, Maximize2, ChevronRight, Eye, Code, FolderOpen, Play, WrapText } from "lucide-react";
import { codeToHtml } from "shiki";
import { useUIStore } from "@/stores/ui-store";
import { cn, sanitizeSvgHtml } from "@/lib/utils";
import { CodeBlockContext } from "./markdown-renderer";
import { RUNNABLE_LANGUAGES } from "@/components/artifacts/code-runner";

// Global cache for highlighted code - survives component unmount/remount
const highlightCache = new Map<string, string>();
const MAX_CACHE_SIZE = 200;

function getCacheKey(code: string, language: string): string {
  // Use full code string as key — cache is small (200 entries) so this is fine
  return `${language}:${code}`;
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
  filename?: string | null;
  isStreaming?: boolean;
}

// Map language aliases to shiki-supported languages
function getShikiLanguage(lang: string): string {
  const langMap: Record<string, string> = {
    svg: "xml",
    html: "html",
    htm: "html",
  };
  return langMap[lang.toLowerCase()] || lang || "text";
}

export function CodeBlock({ language, code, filename, isStreaming = false }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  // Collapsed during streaming, expanded when done - NO animation to prevent layout jumps
  const [isExpanded, setIsExpanded] = useState(!isStreaming);
  const [wasStreaming, setWasStreaming] = useState(isStreaming);
  const isSvgLang = language?.toLowerCase() === "svg";
  const isHtmlLang = language?.toLowerCase() === "html" && (code.includes("<!DOCTYPE") || code.includes("<html") || code.includes("<body"));
  const isPreviewable = isSvgLang || isHtmlLang;
  const [showPreview, setShowPreview] = useState(isSvgLang);
  const [wordWrap, setWordWrap] = useState(false);
  const codeContainerRef = useRef<HTMLDivElement>(null);
  const [hasOverflowLeft, setHasOverflowLeft] = useState(false);
  const [hasOverflowRight, setHasOverflowRight] = useState(false);
  const shikiLang = getShikiLanguage(language);
  const [highlightedHtml, setHighlightedHtml] = useState<string | null>(
    () => getCachedHighlight(code, shikiLang)
  );
  const highlightTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastCodeRef = useRef(code);
  const setShowArtifacts = useUIStore((state) => state.setShowArtifacts);
  const setActiveArtifact = useUIStore((state) => state.setActiveArtifact);

  // Register with context for multi-file project detection
  const codeBlockContext = useContext(CodeBlockContext);

  useEffect(() => {
    if (codeBlockContext && code) {
      codeBlockContext.registerCodeBlock({ language, filename: filename || null, code });
    }
  }, [codeBlockContext, language, filename, code]);

  // Detect horizontal scroll overflow for fade indicators
  useEffect(() => {
    const el = codeContainerRef.current;
    if (!el || wordWrap) {
      setHasOverflowLeft(false);
      setHasOverflowRight(false);
      return;
    }
    const check = () => {
      setHasOverflowLeft(el.scrollLeft > 0);
      setHasOverflowRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    };
    check();
    el.addEventListener("scroll", check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", check); ro.disconnect(); };
  }, [isExpanded, highlightedHtml, wordWrap]);

  // Auto-expand when streaming finishes - instant, no animation
  useEffect(() => {
    if (wasStreaming && !isStreaming) {
      setIsExpanded(true);
    }
    setWasStreaming(isStreaming);
  }, [isStreaming, wasStreaming]);

  useEffect(() => {
    // Check cache first - instant if available
    const cached = getCachedHighlight(code, shikiLang);
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
          lang: shikiLang,
          theme: "github-dark",
        });
        setCachedHighlight(code, shikiLang, highlighted);
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
  }, [code, shikiLang]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const setArtifactsFullscreen = useUIStore((state) => state.setArtifactsFullscreen);

  const handleOpenArtifact = () => {
    setActiveArtifact({
      id: crypto.randomUUID(),
      title: filename || (language ? `${language.charAt(0).toUpperCase() + language.slice(1)} Code` : "Code Snippet"),
      code,
      language: language || "text",
      type: 'code',
    });
    setShowArtifacts(true);
    setArtifactsFullscreen(true);
  };

  // Open all code blocks as a multi-file project
  const handleOpenAsProject = () => {
    if (!codeBlockContext) return;

    const codeBlocks = codeBlockContext.getCodeBlocks();
    if (codeBlocks.length < 2) return;

    // First pass: find HTML and extract referenced files
    let htmlBlock = codeBlocks.find(b => b.language === "html" || b.language === "htm");
    const referencedScripts: string[] = [];
    const referencedStyles: string[] = [];

    if (htmlBlock) {
      // Extract script src references
      const scriptMatches = htmlBlock.code.matchAll(/<script[^>]+src=["']([^"']+)["']/gi);
      for (const match of scriptMatches) {
        referencedScripts.push(match[1]);
      }
      // Extract link href references (CSS)
      const linkMatches = htmlBlock.code.matchAll(/<link[^>]+href=["']([^"']+\.css)["']/gi);
      for (const match of linkMatches) {
        referencedStyles.push(match[1]);
      }
    }

    // Build files object for Sandpack
    const files: Record<string, string> = {};
    let entryFile: string | undefined;
    let jsFileIndex = 0;
    let cssFileIndex = 0;

    for (const block of codeBlocks) {
      // Determine file path
      let filePath = block.filename;
      if (!filePath) {
        const ext = getExtensionForLanguage(block.language);
        if (block.language === "html" || block.language === "htm") {
          filePath = "index.html";
        } else if (block.language === "css") {
          // Use referenced CSS filename if available
          filePath = referencedStyles[cssFileIndex] || "styles.css";
          cssFileIndex++;
        } else if (block.language === "javascript" || block.language === "js") {
          // Use referenced JS filename if available
          filePath = referencedScripts[jsFileIndex] || "script.js";
          jsFileIndex++;
        } else {
          filePath = `file.${ext}`;
        }
      }

      // Ensure path starts with /
      if (!filePath.startsWith("/")) {
        filePath = "/" + filePath;
      }

      files[filePath] = block.code;

      // Set entry file (prefer index.html, then first file)
      if (filePath === "/index.html" || filePath.endsWith("index.html")) {
        entryFile = filePath;
      } else if (!entryFile) {
        entryFile = filePath;
      }
    }

    // Determine template based on files
    const hasReact = Object.keys(files).some(f => f.endsWith(".jsx") || f.endsWith(".tsx"));
    const hasTs = Object.keys(files).some(f => f.endsWith(".ts") || f.endsWith(".tsx"));
    const template = hasReact
      ? (hasTs ? "react-ts" : "react")
      : (hasTs ? "vanilla-ts" : "vanilla");

    setActiveArtifact({
      id: crypto.randomUUID(),
      title: "Multi-File Project",
      code: "", // Not used for projects
      language: "project",
      type: "project",
      files,
      template,
      entry: entryFile,
    });
    setShowArtifacts(true);
    setArtifactsFullscreen(true);
  };

  // Get file extension for a language
  function getExtensionForLanguage(lang: string): string {
    const extMap: Record<string, string> = {
      javascript: "js", js: "js", jsx: "jsx",
      typescript: "ts", ts: "ts", tsx: "tsx",
      html: "html", htm: "html",
      css: "css", scss: "scss", less: "less",
      python: "py", py: "py",
      json: "json",
      markdown: "md", md: "md",
      yaml: "yaml", yml: "yml",
    };
    return extMap[lang.toLowerCase()] || lang || "txt";
  }

  // Languages that can be executed
  function isRunnableLanguage(lang: string): boolean {
    return RUNNABLE_LANGUAGES.includes(lang?.toLowerCase());
  }

  // Check if we can open as project (multiple code blocks available)
  const canOpenAsProject = codeBlockContext && codeBlockContext.getCodeBlocks().length >= 2;

  const lineCount = code.split('\n').length;

  return (
    <div className="group relative my-3 sm:my-4 contain-layout">
      <div
        className={cn(
          "flex items-center justify-between bg-primary/5 border-b border-white/5 px-2 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-primary",
          isExpanded ? "rounded-t-lg" : "rounded-lg",
          isStreaming && !isExpanded && "relative overflow-hidden"
        )}
      >
        {/* Streaming progress bar when collapsed */}
        {isStreaming && !isExpanded && (
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary/20">
            <div className="h-full bg-primary/60 animate-pulse" style={{ width: '100%' }} />
          </div>
        )}
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1.5 hover:text-primary/80 min-w-0"
        >
          {/* No transition - instant rotation to prevent layout shift */}
          <span
            className="shrink-0"
            style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
          >
            <ChevronRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </span>
          <span className="truncate">
            {filename ? (
              <>
                <span className="text-muted-foreground">{language}</span>
                <span className="mx-1 text-muted-foreground/50">·</span>
                <span>{filename}</span>
              </>
            ) : (
              language || "text"
            )}
          </span>
          {!isExpanded && (
            <span className="text-muted-foreground text-xs ml-1 shrink-0">
              {isStreaming ? (
                <span className="text-primary/70 animate-pulse">generating...</span>
              ) : (
                <>({lineCount} {lineCount === 1 ? 'line' : 'lines'})</>
              )}
            </span>
          )}
        </button>
        <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
          {isRunnableLanguage(language) && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 sm:h-8 sm:w-8 text-green-500 hover:text-green-600 hover:bg-green-500/10"
              onClick={handleOpenArtifact}
              title="Run code"
            >
              <Play className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Button>
          )}
          {canOpenAsProject && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 sm:h-8 sm:w-8 text-blue-500 hover:text-blue-600"
              onClick={handleOpenAsProject}
              title="Open all files as project"
            >
              <FolderOpen className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </Button>
          )}
          {isPreviewable && (
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-7 w-7 sm:h-8 sm:w-8", showPreview && "bg-primary/10")}
              onClick={() => setShowPreview(!showPreview)}
              title={showPreview ? "Show code" : (isSvgLang ? "Preview SVG" : "Preview HTML")}
            >
              {showPreview ? (
                <Code className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              ) : (
                <Eye className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              )}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-7 w-7 sm:h-8 sm:w-8", wordWrap && "bg-primary/10")}
            onClick={() => setWordWrap(!wordWrap)}
            title={wordWrap ? "Disable word wrap" : "Enable word wrap"}
          >
            <WrapText className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </Button>
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
            className="h-7 w-7 sm:h-8 sm:w-8 hover:scale-110 active:scale-90 transition-transform"
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
      {/* No animation - instant show/hide to prevent layout jumps */}
      {isExpanded && (
        <div className="rounded-b-lg bg-[#24292e]">
          {isSvgLang && showPreview ? (
            <div className="p-6 flex items-center justify-center min-h-[200px] bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
              <div
                className="[&>svg]:w-full [&>svg]:h-auto [&>svg]:max-h-[300px] [&>svg]:min-w-[200px]"
                style={{ width: '100%', maxWidth: '400px' }}
                dangerouslySetInnerHTML={{ __html: sanitizeSvgHtml(code) }}
              />
            </div>
          ) : isHtmlLang && showPreview ? (
            <div className="relative bg-white rounded-b-lg">
              {/* Sandboxed iframe — user-generated HTML runs in isolated context */}
              <iframe
                srcDoc={code}
                sandbox="allow-scripts"
                className="w-full rounded-b-lg border-0"
                style={{ height: '400px' }}
                title="HTML Preview"
              />
            </div>
          ) : (
            <div className="relative">
              {/* Scroll fade indicators */}
              {hasOverflowLeft && (
                <div className="absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-[#24292e] to-transparent z-10 pointer-events-none" />
              )}
              {hasOverflowRight && (
                <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-[#24292e] to-transparent z-10 pointer-events-none" />
              )}
              <div ref={codeContainerRef} className={cn("flex", wordWrap ? "overflow-x-hidden" : "overflow-x-auto")}>
                {/* Line numbers */}
                <div className="select-none text-right text-[11px] sm:text-[13px] leading-relaxed font-mono text-[#6a737d] py-3 sm:py-4 pl-3 sm:pl-4 pr-3 border-r border-white/10 shrink-0" aria-hidden="true">
                  {code.split('\n').map((_, i) => (
                    <div key={i} className="hover:text-[#8b949e] transition-colors">{i + 1}</div>
                  ))}
                </div>
                {highlightedHtml ? (
                  <div
                    className={cn(
                      "flex-1 min-w-0 [&>pre]:m-0 [&>pre]:rounded-none [&>pre]:rounded-br-lg [&>pre]:bg-transparent [&>pre]:p-3 sm:[&>pre]:p-4 [&>pre]:text-[11px] sm:[&>pre]:text-[13px] [&_code]:text-[11px] sm:[&_code]:text-[13px]",
                      "[&_.line]:hover:bg-white/[0.03] [&_.line]:transition-colors [&_.line]:rounded-sm",
                      wordWrap && "[&>pre]:whitespace-pre-wrap [&>pre]:break-words"
                    )}
                    // Shiki-generated HTML is trusted (not user content)
                    dangerouslySetInnerHTML={{ __html: highlightedHtml }}
                  />
                ) : (
                  <pre className={cn(
                    "flex-1 min-w-0 text-[#e1e4e8] p-3 sm:p-4 m-0 font-mono text-[11px] sm:text-[13px] leading-relaxed",
                    wordWrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"
                  )}>
                    <code>{code}</code>
                  </pre>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
