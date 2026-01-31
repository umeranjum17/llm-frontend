"use client";

import { useState, useMemo, useRef, useEffect } from "react";
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
  const contentRef = useRef<HTMLDivElement>(null);

  // Scroll-linked TOC highlighting
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

  return (
    <div className="flex h-full">
      {/* TOC sidebar — hidden on mobile */}
      {showToc && headings.length > 0 && (
        <div className="hidden md:block w-56 shrink-0 border-r bg-muted/10 overflow-auto p-3">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Contents
          </div>
          <nav className="space-y-0.5">
            {headings.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => {
                  const el = contentRef.current?.querySelector(`#${CSS.escape(h.id)}`);
                  el?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className={cn(
                  "block w-full text-left text-xs py-1 px-2 rounded hover:bg-muted/50 truncate transition-colors",
                  h.level === 1 && "font-medium",
                  h.level === 2 && "pl-4",
                  h.level === 3 && "pl-6",
                  h.level >= 4 && "pl-8",
                  activeId === h.id
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground"
                )}
              >
                {h.text}
              </button>
            ))}
          </nav>
        </div>
      )}

      {/* Document body */}
      <div ref={contentRef} className="flex-1 overflow-auto">
        {/* Header with frontmatter */}
        {(frontmatter.title || frontmatter.author || frontmatter.date) && (
          <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b px-3 py-2 sm:px-6 sm:py-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                {frontmatter.title && (
                  <h1 className="text-base sm:text-lg font-bold truncate">{frontmatter.title}</h1>
                )}
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {frontmatter.author && <span>{frontmatter.author}</span>}
                  {frontmatter.author && frontmatter.date && <span>·</span>}
                  {frontmatter.date && <span>{frontmatter.date}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                {headings.length > 0 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
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
        )}

        {/* Markdown content */}
        <div className="p-4 sm:p-6 prose prose-sm dark:prose-invert max-w-none">
          <MarkdownRenderer content={body} />
        </div>
      </div>
    </div>
  );
}
