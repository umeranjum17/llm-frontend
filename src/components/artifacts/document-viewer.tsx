"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { List } from "lucide-react";
import { ExportButton } from "@/components/artifacts/export-button";
import { cn } from "@/lib/utils";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";

interface DocumentViewerProps {
  content: string;
}

interface Frontmatter {
  title?: string;
  author?: string;
  date?: string;
}

interface TocEntry {
  id: string;
  text: string;
  level: number;
}

function parseFrontmatter(content: string): { frontmatter: Frontmatter; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content };

  const fm: Frontmatter = {};
  for (const line of match[1].split("\n")) {
    const [key, ...rest] = line.split(":");
    const value = rest.join(":").trim().replace(/^["']|["']$/g, "");
    if (key.trim() === "title") fm.title = value;
    if (key.trim() === "author") fm.author = value;
    if (key.trim() === "date") fm.date = value;
  }
  return { frontmatter: fm, body: match[2] };
}

function extractHeadings(markdown: string): TocEntry[] {
  const entries: TocEntry[] = [];
  for (const line of markdown.split("\n")) {
    const match = line.match(/^(#{1,4})\s+(.+)/);
    if (match) {
      const text = match[2].replace(/[*_`]/g, "");
      const id = text.toLowerCase().replace(/[^\w]+/g, "-").replace(/^-|-$/g, "");
      entries.push({ id, text, level: match[1].length });
    }
  }
  return entries;
}

export function DocumentViewer({ content }: DocumentViewerProps) {
  const { frontmatter, body } = useMemo(() => parseFrontmatter(content), [content]);
  const headings = useMemo(() => extractHeadings(body), [body]);
  const [showToc, setShowToc] = useState(headings.length > 0);
  const [activeId, setActiveId] = useState<string>("");
  const [readProgress, setReadProgress] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);

  // Scroll-linked TOC highlighting + reading progress
  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const progress = scrollHeight <= clientHeight ? 100 : (scrollTop / (scrollHeight - clientHeight)) * 100;
      setReadProgress(Math.min(100, Math.max(0, progress)));
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const container = contentRef.current;
    if (!container || headings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { root: container, rootMargin: "-20% 0px -80% 0px" }
    );

    for (const h of headings) {
      const el = container.querySelector(`#${CSS.escape(h.id)}`);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [headings]);

  const scrollToHeading = useCallback((id: string) => {
    const el = contentRef.current?.querySelector(`#${CSS.escape(id)}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Header with frontmatter + controls */}
      <div className="shrink-0 border-b bg-background/95 backdrop-blur-sm relative">
        {/* Reading progress */}
        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-muted/30">
          <div
            className="h-full bg-primary/50 transition-all duration-150 ease-out"
            style={{ width: `${readProgress}%` }}
          />
        </div>

        <div className="flex items-center justify-between gap-2 px-3 py-2 sm:px-6 sm:py-3">
          <div className="min-w-0 flex-1">
            {frontmatter.title && (
              <h1 className="text-base sm:text-lg font-bold truncate">{frontmatter.title}</h1>
            )}
            {(frontmatter.author || frontmatter.date) && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {frontmatter.author && <span>{frontmatter.author}</span>}
                {frontmatter.author && frontmatter.date && <span className="text-muted-foreground/40">·</span>}
                {frontmatter.date && <span>{frontmatter.date}</span>}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {headings.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className={cn("h-7 w-7", showToc && "bg-muted")}
                onClick={() => setShowToc(!showToc)}
                title="Toggle table of contents"
              >
                <List className="h-3.5 w-3.5" />
              </Button>
            )}
            <ExportButton
              label="PDF"
              onClick={async () => {
                if (contentRef.current) {
                  const { exportToPdf } = await import("@/lib/utils/export-utils");
                  await exportToPdf(contentRef.current, frontmatter.title || "Document");
                }
              }}
            />
            <ExportButton
              label="DOCX"
              onClick={async () => {
                const { exportToDocx } = await import("@/lib/utils/export-utils");
                await exportToDocx(body, frontmatter.title || "Document");
              }}
            />
          </div>
        </div>
      </div>

      {/* Body: TOC + content */}
      <div className="flex flex-1 overflow-hidden">
        {/* TOC sidebar — hidden on mobile */}
        {showToc && headings.length > 0 && (
          <div className="hidden md:flex flex-col w-56 shrink-0 border-r bg-muted/5 overflow-auto">
            <div className="px-3 pt-3 pb-1.5">
              <div className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider">
                Contents
              </div>
            </div>
            <nav className="flex-1 px-2 pb-3 space-y-px">
              {headings.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  onClick={() => scrollToHeading(h.id)}
                  className={cn(
                    "group flex items-center w-full text-left text-xs py-1.5 px-2 rounded-md truncate transition-all",
                    h.level === 1 && "font-medium",
                    h.level === 2 && "pl-5",
                    h.level === 3 && "pl-8",
                    h.level >= 4 && "pl-11",
                    activeId === h.id
                      ? "text-primary bg-primary/8"
                      : "text-muted-foreground/70 hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  {activeId === h.id && (
                    <span className="absolute left-0 w-0.5 h-4 rounded-full bg-primary" />
                  )}
                  {h.text}
                </button>
              ))}
            </nav>
          </div>
        )}

        {/* Document body */}
        <div ref={contentRef} className="flex-1 overflow-auto">
          <div className="p-4 sm:p-6 lg:p-8 prose prose-sm dark:prose-invert max-w-none">
            <MarkdownRenderer content={body} />
          </div>
        </div>
      </div>
    </div>
  );
}
