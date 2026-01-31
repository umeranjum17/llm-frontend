"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import {
  Play,
  Square,
  TerminalSquare,
  Code,
  Image as ImageIcon,
  Maximize2,
  Minimize2,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Copy,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Editor from "@monaco-editor/react";
import { useTheme } from "next-themes";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface E2BExecutorProps {
  id: string;
  code: string;
  language?: "python" | "javascript" | "bash";
  onCodeChange?: (code: string) => void;
}

interface ExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  error?: string;
  results?: Array<{
    type: string;
    data?: string;
    format?: string;
    text?: string;
  }>;
  executionTime?: number;
}

const LANGUAGE_CONFIG = {
  python: {
    label: "Python",
    monacoLanguage: "python",
    icon: "🐍",
    description: "Python 3 with pandas, numpy, matplotlib",
  },
  javascript: {
    label: "Node.js",
    monacoLanguage: "javascript",
    icon: "⬢",
    description: "Node.js 20 with npm packages",
  },
  bash: {
    label: "Bash",
    monacoLanguage: "shell",
    icon: "$",
    description: "Bash shell commands",
  },
};

export function E2BExecutor({
  id,
  code: initialCode,
  language = "python",
  onCodeChange,
}: E2BExecutorProps) {
  const [code, setCode] = useState(initialCode);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();

  const config = LANGUAGE_CONFIG[language];

  // Handle fullscreen
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isFullscreen]);

  const runCode = useCallback(async () => {
    if (isRunning || !code.trim()) return;

    setIsRunning(true);
    setResult(null);

    try {
      const response = await fetch("/api/sandbox/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, language }),
      });

      const data = await response.json();
      setResult(data);
    } catch (error) {
      setResult({
        success: false,
        stdout: "",
        stderr: "",
        error: error instanceof Error ? error.message : "Failed to execute code",
      });
    } finally {
      setIsRunning(false);
    }
  }, [code, language, isRunning]);

  // Keyboard shortcut to run
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        runCode();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [runCode]);

  const handleCodeChange = useCallback((value: string | undefined) => {
    const newCode = value || "";
    setCode(newCode);
    onCodeChange?.(newCode);
  }, [onCodeChange]);

  const copyCode = useCallback(async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  const hasOutput = result?.results && result.results.length > 0;

  return (
    <div
      ref={containerRef}
      className={cn(
        "flex flex-col bg-gradient-to-br from-background to-muted/20 h-full w-full overflow-hidden",
        isFullscreen && "fixed inset-4 z-50 shadow-2xl rounded-lg border"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-gradient-to-r from-muted/30 to-muted/10">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs font-mono gap-1">
            <span>{config.icon}</span>
            {config.label}
          </Badge>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            {config.description}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {result && (
            <Badge
              variant={result.success ? "default" : "destructive"}
              className="text-xs gap-1"
            >
              {result.success ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : (
                <AlertCircle className="h-3 w-3" />
              )}
              {result.executionTime ? `${result.executionTime}ms` : result.success ? "Success" : "Error"}
            </Badge>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={copyCode}
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copy code</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => setIsFullscreen(!isFullscreen)}
              >
                {isFullscreen ? (
                  <Minimize2 className="h-3.5 w-3.5" />
                ) : (
                  <Maximize2 className="h-3.5 w-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isFullscreen ? "Exit fullscreen" : "Fullscreen"}</TooltipContent>
          </Tooltip>

          <Button
            size="sm"
            className="h-7 gap-1.5 ml-1"
            onClick={runCode}
            disabled={isRunning || !code.trim()}
          >
            {isRunning ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" />
                Run
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <PanelGroup direction="horizontal" className="h-full">
          {/* Code Editor Panel */}
          <Panel defaultSize={50} minSize={30}>
            <div className="h-full flex flex-col">
              <div className="h-9 border-b bg-muted/10 flex items-center px-3 gap-2">
                <Code className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium">Code</span>
              </div>
              <div className="flex-1 min-h-0">
                <Editor
                  height="100%"
                  language={config.monacoLanguage}
                  value={code}
                  onChange={handleCodeChange}
                  theme={resolvedTheme === "dark" ? "vs-dark" : "light"}
                  options={{
                    minimap: { enabled: false },
                    fontSize: 13,
                    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                    lineNumbers: "on",
                    scrollBeyondLastLine: false,
                    padding: { top: 12, bottom: 12 },
                    wordWrap: "on",
                    automaticLayout: true,
                    tabSize: language === "python" ? 4 : 2,
                    insertSpaces: true,
                  }}
                />
              </div>
            </div>
          </Panel>

          <PanelResizeHandle className="w-1 bg-border/30 hover:bg-primary/50 transition-colors cursor-col-resize" />

          {/* Output Panel */}
          <Panel defaultSize={50} minSize={25}>
            <PanelGroup direction="vertical" className="h-full">
              {/* Console */}
              <Panel defaultSize={hasOutput ? 50 : 100} minSize={20}>
                <div className="h-full flex flex-col">
                  <div className="h-9 border-b bg-muted/10 flex items-center px-3 gap-2">
                    <TerminalSquare className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">Console</span>
                    {result && (
                      <span className={cn(
                        "h-1.5 w-1.5 rounded-full ml-1",
                        result.success ? "bg-green-500" : "bg-destructive"
                      )} />
                    )}
                  </div>
                  <div className="flex-1 min-h-0 overflow-auto bg-zinc-950 text-zinc-100">
                    <div className="p-3 font-mono text-xs space-y-2">
                      {!result && !isRunning && (
                        <div className="text-zinc-500 italic">
                          Press Ctrl+Enter or click Run to execute
                        </div>
                      )}
                      {isRunning && (
                        <div className="flex items-center gap-2 text-zinc-400">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Executing...
                        </div>
                      )}
                      {result?.stdout && (
                        <div>
                          <div className="text-zinc-500 text-[10px] uppercase tracking-wider mb-1">stdout</div>
                          <pre className="whitespace-pre-wrap text-green-400">{result.stdout}</pre>
                        </div>
                      )}
                      {result?.stderr && (
                        <div>
                          <div className="text-zinc-500 text-[10px] uppercase tracking-wider mb-1">stderr</div>
                          <pre className="whitespace-pre-wrap text-yellow-400">{result.stderr}</pre>
                        </div>
                      )}
                      {result?.error && (
                        <div>
                          <div className="text-zinc-500 text-[10px] uppercase tracking-wider mb-1">error</div>
                          <pre className="whitespace-pre-wrap text-red-400">{result.error}</pre>
                        </div>
                      )}
                      {result && !result.stdout && !result.stderr && !result.error && result.success && (
                        <div className="text-zinc-500 italic">
                          Code executed successfully with no output
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Panel>

              {/* Visual Output (only if results exist) */}
              {hasOutput && (
                <>
                  <PanelResizeHandle className="h-1 bg-border/30 hover:bg-primary/50 transition-colors cursor-row-resize" />
                  <Panel defaultSize={50} minSize={20}>
                    <div className="h-full flex flex-col">
                      <div className="h-9 border-b bg-muted/10 flex items-center px-3 gap-2">
                        <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs font-medium">Output</span>
                        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                      </div>
                      <div className="flex-1 min-h-0 overflow-auto p-4">
                        <div className="space-y-4">
                          {result?.results?.map((r, i) => (
                            <div key={i} className="space-y-2">
                              {r.type === "image" && r.data && (
                                <div className="border rounded-lg overflow-hidden bg-card">
                                  <img
                                    src={r.format === "svg" ? `data:image/svg+xml;base64,${btoa(r.data)}` : `data:image/${r.format || "png"};base64,${r.data}`}
                                    alt={`Output ${i + 1}`}
                                    className="max-w-full h-auto"
                                  />
                                </div>
                              )}
                              {r.type === "html" && r.data && (
                                <div className="border rounded-lg overflow-hidden bg-card">
                                  <iframe
                                    srcDoc={r.data}
                                    className="w-full border-0"
                                    style={{ minHeight: "200px" }}
                                    sandbox="allow-scripts allow-forms allow-popups allow-modals"
                                    title={`HTML Output ${i + 1}`}
                                  />
                                </div>
                              )}
                              {r.type === "text" && r.text && (
                                <pre className="border rounded-lg p-4 bg-muted text-sm overflow-auto">{r.text}</pre>
                              )}
                              {r.type === "latex" && r.text && (
                                <div className="border rounded-lg p-4 bg-muted font-mono text-sm">{r.text}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </Panel>
                </>
              )}
            </PanelGroup>
          </Panel>
        </PanelGroup>
      </div>

      {/* Footer */}
      <div className="h-9 border-t border-border/40 bg-gradient-to-r from-muted/30 to-muted/10 flex items-center justify-between px-3 text-xs shrink-0">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] font-normal bg-background/50">
            {config.label}
          </Badge>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <span>Ctrl+Enter to run</span>
          <span className="text-muted-foreground/50">·</span>
          <span>Powered by E2B</span>
        </div>
      </div>
    </div>
  );
}
