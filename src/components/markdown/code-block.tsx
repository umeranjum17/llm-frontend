"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check, Maximize2 } from "lucide-react";
import { codeToHtml } from "shiki";
import { useUIStore } from "@/stores/ui-store";

interface CodeBlockProps {
  language: string;
  code: string;
}

export function CodeBlock({ language, code }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [html, setHtml] = useState<string>("");
  const setShowArtifacts = useUIStore((state) => state.setShowArtifacts);
  const setActiveArtifact = useUIStore((state) => state.setActiveArtifact);

  useEffect(() => {
    async function highlight() {
      try {
        const highlighted = await codeToHtml(code, {
          lang: language || "text",
          theme: "github-dark",
        });
        setHtml(highlighted);
      } catch (error) {
        // Fallback to plain text if highlighting fails
        setHtml(`<pre><code>${code}</code></pre>`);
      }
    }
    highlight();
  }, [code, language]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenArtifact = () => {
    setActiveArtifact({
      id: crypto.randomUUID(),
      title: language ? `${language.charAt(0).toUpperCase() + language.slice(1)} Code` : "Code Snippet",
      code,
      language: language || "text",
    });
    setShowArtifacts(true);
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
      <div
        className="overflow-x-auto rounded-b-lg [&>pre]:my-0 [&>pre]:rounded-none [&>pre]:rounded-b-lg"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
