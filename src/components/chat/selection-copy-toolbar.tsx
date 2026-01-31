"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { Copy, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface SelectionCopyToolbarProps {
  /** The container element to monitor for text selection */
  containerRef: React.RefObject<HTMLElement | null>;
  /** The raw markdown source for the message */
  markdownSource: string;
}

export function SelectionCopyToolbar({ containerRef, markdownSource }: SelectionCopyToolbarProps) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [selectedText, setSelectedText] = useState("");
  const toolbarRef = useRef<HTMLDivElement>(null);

  const handleSelectionChange = useCallback(() => {
    const selection = document.getSelection();
    if (!selection || selection.isCollapsed || !containerRef.current) {
      setPosition(null);
      setSelectedText("");
      return;
    }

    // Check that the selection is within our container
    const range = selection.getRangeAt(0);
    if (!containerRef.current.contains(range.commonAncestorContainer)) {
      setPosition(null);
      setSelectedText("");
      return;
    }

    const text = selection.toString().trim();
    if (!text) {
      setPosition(null);
      setSelectedText("");
      return;
    }

    setSelectedText(text);

    const rect = range.getBoundingClientRect();
    const toolbarHeight = 40;
    const gap = 8;

    setPosition({
      top: rect.top + window.scrollY - toolbarHeight - gap,
      left: rect.left + window.scrollX + rect.width / 2,
    });
  }, [containerRef]);

  useEffect(() => {
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, [handleSelectionChange]);

  // Dismiss on Escape
  useEffect(() => {
    if (!position) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        document.getSelection()?.removeAllRanges();
        setPosition(null);
        setSelectedText("");
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [position]);

  const handleCopyPlain = useCallback(() => {
    navigator.clipboard.writeText(selectedText);
    toast.success("Copied to clipboard");
    document.getSelection()?.removeAllRanges();
    setPosition(null);
  }, [selectedText]);

  const handleCopyMarkdown = useCallback(() => {
    // Try to find the selected text within the markdown source
    // Use a simple heuristic: find longest matching substring
    // For most cases the plain text maps closely to the markdown
    navigator.clipboard.writeText(findMarkdownForSelection(selectedText, markdownSource));
    toast.success("Copied as Markdown");
    document.getSelection()?.removeAllRanges();
    setPosition(null);
  }, [selectedText, markdownSource]);

  if (!position || !selectedText) return null;

  return createPortal(
    <div
      ref={toolbarRef}
      className="fixed z-[9999] flex items-center gap-0.5 rounded-lg border bg-popover p-1 shadow-lg animate-in fade-in-0 zoom-in-95"
      style={{
        top: position.top,
        left: position.left,
        transform: "translateX(-50%)",
      }}
      onMouseDown={(e) => e.preventDefault()} // Prevent losing selection
    >
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs gap-1.5"
        onClick={handleCopyPlain}
      >
        <Copy className="h-3 w-3" />
        Copy
      </Button>
      <div className="w-px h-4 bg-border" />
      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs gap-1.5"
        onClick={handleCopyMarkdown}
      >
        <FileText className="h-3 w-3" />
        Markdown
      </Button>
    </div>,
    document.body
  );
}

/**
 * Attempts to extract the markdown source corresponding to the selected plain text.
 * Falls back to the plain text if no good match is found.
 */
function findMarkdownForSelection(plainText: string, markdownSource: string): string {
  // Normalize whitespace for comparison
  const normalize = (s: string) => s.replace(/\s+/g, " ").trim();
  const normalizedPlain = normalize(plainText);
  const normalizedMd = normalize(markdownSource);

  // If the full markdown matches the plain text, return the full markdown
  if (normalizedMd === normalizedPlain) return markdownSource;

  // Try to find the selection boundaries in the markdown source
  // Strategy: find the first line of selected text in markdown, then find the last line
  const plainLines = plainText.split("\n").map(l => l.trim()).filter(Boolean);
  if (plainLines.length === 0) return plainText;

  const firstLine = plainLines[0];
  const lastLine = plainLines[plainLines.length - 1];

  const mdLines = markdownSource.split("\n");

  // Find start: first markdown line that contains the first selected line's text
  let startIdx = -1;
  for (let i = 0; i < mdLines.length; i++) {
    if (mdLines[i].includes(firstLine) || normalize(mdLines[i]).includes(normalize(firstLine))) {
      startIdx = i;
      break;
    }
  }

  // Find end: last markdown line that contains the last selected line's text
  let endIdx = -1;
  for (let i = mdLines.length - 1; i >= 0; i--) {
    if (mdLines[i].includes(lastLine) || normalize(mdLines[i]).includes(normalize(lastLine))) {
      endIdx = i;
      break;
    }
  }

  if (startIdx !== -1 && endIdx !== -1 && endIdx >= startIdx) {
    return mdLines.slice(startIdx, endIdx + 1).join("\n");
  }

  // Fallback: return plain text
  return plainText;
}
