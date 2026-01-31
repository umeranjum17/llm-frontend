"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Maximize2, Play, Code, Eye } from "lucide-react";
import { useUIStore } from "@/stores/ui-store";

interface SandpackInlinePreviewProps {
  code: string;
  template: string;
}

// Parse // @file markers to split a single code block into multiple files
function parseFileMarkers(code: string): Record<string, string> {
  const files: Record<string, string> = {};
  const lines = code.split("\n");
  let currentFile: string | null = null;
  let currentContent: string[] = [];

  for (const line of lines) {
    const fileMatch = line.match(/^\/\/\s*@file\s+(\S+)/);
    if (fileMatch) {
      // Save previous file
      if (currentFile) {
        files[currentFile] = currentContent.join("\n").trim();
      }
      currentFile = fileMatch[1];
      if (!currentFile.startsWith("/")) {
        currentFile = "/" + currentFile;
      }
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }

  // Save last file
  if (currentFile) {
    files[currentFile] = currentContent.join("\n").trim();
  }

  // If no @file markers found, treat as single App file based on template
  if (Object.keys(files).length === 0) {
    files["/App.tsx"] = code.trim();
  }

  return files;
}

// Determine entry file based on template and files
function getEntryFile(files: Record<string, string>, template: string): string {
  // Check for explicit index/App files
  if (files["/App.tsx"]) return "/App.tsx";
  if (files["/App.jsx"]) return "/App.jsx";
  if (files["/App.vue"]) return "/App.vue";
  if (files["/index.html"]) return "/index.html";
  if (files["/index.tsx"]) return "/index.tsx";
  if (files["/index.jsx"]) return "/index.jsx";
  if (files["/index.js"]) return "/index.js";
  if (files["/index.ts"]) return "/index.ts";

  // Fall back to first file
  return Object.keys(files)[0] || "/App.tsx";
}

export function SandpackInlinePreview({ code, template }: SandpackInlinePreviewProps) {
  const [showPreview, setShowPreview] = useState(false);
  const setShowArtifacts = useUIStore((state) => state.setShowArtifacts);
  const setActiveArtifact = useUIStore((state) => state.setActiveArtifact);
  const setArtifactsFullscreen = useUIStore((state) => state.setArtifactsFullscreen);

  const files = parseFileMarkers(code);
  const entry = getEntryFile(files, template);
  const fileCount = Object.keys(files).length;
  const fileNames = Object.keys(files).map(f => f.replace(/^\//, "")).join(", ");

  const handleOpenFullscreen = () => {
    setActiveArtifact({
      id: crypto.randomUUID(),
      title: `Sandpack Project (${template})`,
      code: "",
      language: "project",
      type: "project",
      files,
      template,
      entry,
    });
    setShowArtifacts(true);
    setArtifactsFullscreen(true);
  };

  return (
    <div className="my-3 sm:my-4 contain-layout">
      <div className="flex items-center justify-between bg-primary/5 border-b border-white/5 px-2 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-primary rounded-t-lg">
        <div className="flex items-center gap-1.5 min-w-0">
          <Play className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
          <span className="truncate">
            <span className="text-muted-foreground">sandpack</span>
            <span className="mx-1 text-muted-foreground/50">·</span>
            <span>{template}</span>
            <span className="text-muted-foreground text-xs ml-1">
              ({fileCount} {fileCount === 1 ? "file" : "files"}: {fileNames})
            </span>
          </span>
        </div>
        <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 sm:h-8 sm:w-8"
            onClick={() => setShowPreview(!showPreview)}
            title={showPreview ? "Show code" : "Preview"}
          >
            {showPreview ? (
              <Code className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            ) : (
              <Eye className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 sm:h-8 sm:w-8"
            onClick={handleOpenFullscreen}
            title="Open in Sandpack fullscreen"
          >
            <Maximize2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </Button>
        </div>
      </div>
      <div className="rounded-b-lg bg-[#24292e] overflow-hidden">
        {showPreview ? (
          <div className="p-4 text-center text-muted-foreground text-sm">
            <p className="mb-3">Sandpack preview requires fullscreen mode for live execution.</p>
            <Button variant="secondary" size="sm" onClick={handleOpenFullscreen}>
              <Play className="h-3.5 w-3.5 mr-1.5" />
              Open in Sandpack
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            {Object.entries(files).map(([filePath, content]) => (
              <div key={filePath}>
                <div className="px-3 sm:px-4 py-1 text-xs text-muted-foreground/70 bg-white/5 border-b border-white/5">
                  {filePath}
                </div>
                <pre className="text-[#e1e4e8] px-3 sm:px-4 py-2 sm:py-3 m-0 font-mono text-[11px] sm:text-[13px] leading-relaxed whitespace-pre-wrap break-words border-b border-white/5 last:border-b-0">
                  <code>{content}</code>
                </pre>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
