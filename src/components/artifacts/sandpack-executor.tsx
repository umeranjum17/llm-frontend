"use client";

import { useState } from "react";
import { Sandpack, type SandpackFiles, type SandpackPredefinedTemplate } from "@codesandbox/sandpack-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface SandpackExecutorProps {
  code: string;
  language?: string;
  template?: SandpackPredefinedTemplate;
}

export function SandpackExecutor({ code, language, template = "react" }: SandpackExecutorProps) {
  const [status, setStatus] = useState<"idle" | "running" | "completed" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const isReactLike =
    /\bimport\s+React\b/.test(code) ||
    /\bfrom\s+["']react["']/.test(code) ||
    /<[A-Z][A-Za-z0-9]*/.test(code);

  const getTemplate = (): SandpackPredefinedTemplate => {
    if (language === "vue") return "vue";
    if (language === "typescript") return isReactLike ? "react-ts" : "vanilla-ts";
    if (language === "javascript") return isReactLike ? "react" : "vanilla";
    return template;
  };

  const sandpackTemplate = getTemplate();

  const files: SandpackFiles = {};
  switch (sandpackTemplate) {
    case "react":
      files["/App.js"] = code;
      files["/index.js"] = `import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
`;
      break;
    case "react-ts":
      files["/App.tsx"] = code;
      files["/index.tsx"] = `import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
`;
      break;
    case "vanilla":
      files["/index.js"] = code;
      break;
    case "vanilla-ts":
      files["/index.ts"] = code;
      break;
    case "vue":
    case "vue-ts":
      files["/src/App.vue"] = code;
      break;
    default:
      files["/App.js"] = code;
      break;
  }

  return (
    <div className="h-full w-full flex flex-col">
      {/* Status Bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Badge
            variant={status === "completed" ? "default" : status === "error" ? "destructive" : "secondary"}
            className={cn(
              status === "completed" && "bg-green-500",
              status === "running" && "bg-blue-500"
            )}
          >
            {status === "idle" && "Ready"}
            {status === "running" && (
              <>
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                Running...
              </>
            )}
            {status === "completed" && (
              <>
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Completed
              </>
            )}
            {status === "error" && (
              <>
                <XCircle className="h-3 w-3 mr-1" />
                Error
              </>
            )}
          </Badge>
          {error && (
            <span className="text-xs text-destructive truncate max-w-md">{error}</span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setStatus("idle");
            setError(null);
            // Trigger Sandpack refresh by remounting
            window.location.reload();
          }}
          className="h-7 text-xs"
        >
          <RefreshCw className="h-3 w-3 mr-1" />
          Reset
        </Button>
      </div>

      {/* Sandpack Editor */}
      <div className="flex-1 overflow-hidden">
        <Sandpack
          template={sandpackTemplate}
          files={files}
          options={{
            showNavigator: false,
            showTabs: true,
            showLineNumbers: true,
            showInlineErrors: true,
            wrapContent: true,
            editorHeight: "100%",
            editorWidthPercentage: 50,
            showConsole: true,
            showConsoleButton: true,
          }}
          theme="dark"
        />
      </div>
    </div>
  );
}


