"use client";

import { memo, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check, Download, Maximize2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { MarkdownRenderer } from "./markdown-renderer";

interface DocumentRendererProps {
  code: string;
  className?: string;
}

export const DocumentRenderer = memo(function DocumentRenderer({ code, className }: DocumentRendererProps) {
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Extract title from first # heading
  const titleMatch = code.match(/^#\s+(.+)$/m);
  const title = titleMatch?.[1] || "Document";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([code], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const documentContent = (fullscreen: boolean) => (
    <div className={cn(
      "bg-white dark:bg-zinc-50 text-zinc-900 rounded-b-lg",
      fullscreen ? "rounded-lg max-w-4xl mx-auto w-full" : ""
    )}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-200 bg-zinc-50 dark:bg-zinc-100 rounded-t-lg">
        <span className="text-sm font-medium text-zinc-600 truncate">{title}</span>
        <div className="flex items-center gap-1">
          {!fullscreen && (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200" onClick={() => setIsFullscreen(true)} title="Expand">
              <Maximize2 className="h-4 w-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200" onClick={handleDownload} title="Download .md">
            <Download className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200" onClick={handleCopy} title="Copy markdown">
            {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
          </Button>
          {fullscreen && (
            <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200" onClick={() => setIsFullscreen(false)} title="Close">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Document body */}
      <div
        ref={fullscreen ? undefined : contentRef}
        className={cn(
          "px-6 sm:px-10 py-6 sm:py-8 overflow-y-auto prose-document",
          fullscreen ? "max-h-[80vh]" : "max-h-[600px]"
        )}
        style={{ fontFamily: "'Georgia', 'Times New Roman', serif" }}
      >
        <div className="text-zinc-900 [&_h1]:text-zinc-900 [&_h2]:text-zinc-800 [&_h3]:text-zinc-800 [&_p]:text-zinc-700 [&_li]:text-zinc-700 [&_blockquote]:text-zinc-600 [&_blockquote]:border-zinc-300 [&_a]:text-blue-700 [&_code]:bg-zinc-100 [&_code]:text-zinc-800 [&_hr]:border-zinc-200 [&_th]:text-zinc-700 [&_td]:text-zinc-600 [&_thead]:bg-zinc-100 [&_tr]:border-zinc-200 [&_table]:border-zinc-200 [&_pre]:bg-zinc-100">
          <MarkdownRenderer content={code} />
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className={cn(
        "my-4 rounded-lg shadow-md border border-zinc-200 dark:border-zinc-300 overflow-hidden",
        className
      )}>
        {documentContent(false)}
      </div>

      {/* Fullscreen overlay */}
      {isFullscreen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8">
          <div className="w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-lg shadow-2xl">
            {documentContent(true)}
          </div>
        </div>
      )}
    </>
  );
});
