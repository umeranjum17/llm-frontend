"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import {
  SandpackProvider,
  SandpackLayout,
  SandpackCodeEditor,
  SandpackPreview,
  SandpackConsole,
  SandpackFileExplorer,
  SandpackFiles,
  SandpackPredefinedTemplate,
  useSandpack,
  UnstyledOpenInCodeSandboxButton,
} from "@codesandbox/sandpack-react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  RefreshCw,
  PanelLeft,
  TerminalSquare,
  Maximize2,
  Minimize2,
  Files,
  Code,
  Play,
  ExternalLink,
  Keyboard,
  Package,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SandpackExecutorProps {
  id: string;
  code: string;
  language?: string;
  template?: string;
  files?: Record<string, string>;
  entry?: string;
}

// Custom theme for premium look
const customTheme = {
  colors: {
    surface1: "var(--sp-surface1, hsl(var(--background)))",
    surface2: "var(--sp-surface2, hsl(var(--muted)))",
    surface3: "var(--sp-surface3, hsl(var(--muted)))",
    clickable: "var(--sp-clickable, hsl(var(--muted-foreground)))",
    base: "var(--sp-base, hsl(var(--foreground)))",
    disabled: "var(--sp-disabled, hsl(var(--muted-foreground) / 0.5))",
    hover: "var(--sp-hover, hsl(var(--accent)))",
    accent: "var(--sp-accent, hsl(var(--primary)))",
    error: "var(--sp-error, hsl(var(--destructive)))",
    errorSurface: "var(--sp-error-surface, hsl(var(--destructive) / 0.1))",
  },
  syntax: {
    plain: "hsl(var(--foreground))",
    comment: { color: "hsl(var(--muted-foreground))", fontStyle: "italic" },
    keyword: "hsl(280, 100%, 70%)",
    tag: "hsl(350, 80%, 65%)",
    punctuation: "hsl(var(--muted-foreground))",
    definition: "hsl(200, 100%, 70%)",
    property: "hsl(40, 90%, 60%)",
    static: "hsl(170, 70%, 55%)",
    string: "hsl(100, 60%, 55%)",
  },
  font: {
    body: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    mono: '"JetBrains Mono", "Fira Code", "SF Mono", Consolas, monospace',
    size: "13px",
    lineHeight: "1.6",
  },
};

// Internal component for keyboard shortcuts
function KeyboardShortcuts({
  onToggleExplorer,
  onToggleConsole,
  onRefresh,
}: {
  onToggleExplorer: () => void;
  onToggleConsole: () => void;
  onRefresh: () => void;
}) {
  const { sandpack } = useSandpack();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + B: Toggle file explorer
      if ((e.ctrlKey || e.metaKey) && e.key === "b") {
        e.preventDefault();
        onToggleExplorer();
      }
      // Ctrl/Cmd + `: Toggle console
      if ((e.ctrlKey || e.metaKey) && e.key === "`") {
        e.preventDefault();
        onToggleConsole();
      }
      // Ctrl/Cmd + S: Refresh preview
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        onRefresh();
      }
      // Ctrl/Cmd + P: Quick file switcher (cycle through files)
      if ((e.ctrlKey || e.metaKey) && e.key === "p" && !e.shiftKey) {
        e.preventDefault();
        const files = Object.keys(sandpack.files);
        const currentIndex = files.indexOf(sandpack.activeFile);
        const nextIndex = (currentIndex + 1) % files.length;
        sandpack.setActiveFile(files[nextIndex]);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [sandpack, onToggleExplorer, onToggleConsole, onRefresh]);

  return null;
}

// Mobile tab-based layout
function MobileLayout({
  showConsole,
  setShowConsole,
}: {
  showConsole: boolean;
  setShowConsole: (v: boolean) => void;
}) {
  const [mobileTab, setMobileTab] = useState<"files" | "code" | "preview">(
    "preview"
  );

  return (
    <Tabs
      value={mobileTab}
      onValueChange={(v) => setMobileTab(v as typeof mobileTab)}
      className="flex flex-col h-full"
    >
      <TabsList className="w-full justify-around h-10 rounded-none border-b bg-muted/30 shrink-0">
        <TabsTrigger value="files" className="gap-1.5 flex-1">
          <Files className="h-3.5 w-3.5" />
          Files
        </TabsTrigger>
        <TabsTrigger value="code" className="gap-1.5 flex-1">
          <Code className="h-3.5 w-3.5" />
          Code
        </TabsTrigger>
        <TabsTrigger value="preview" className="gap-1.5 flex-1">
          <Play className="h-3.5 w-3.5" />
          Preview
        </TabsTrigger>
      </TabsList>

      <TabsContent value="files" className="flex-1 m-0 overflow-hidden">
        <SandpackFileExplorer className="!h-full" />
      </TabsContent>

      <TabsContent value="code" className="flex-1 m-0 overflow-hidden">
        <SandpackCodeEditor
          showTabs
          showLineNumbers
          showInlineErrors
          wrapContent
          className="!h-full"
        />
      </TabsContent>

      <TabsContent value="preview" className="flex-1 m-0 overflow-hidden">
        <div className="h-full flex flex-col">
          <div className="flex-1">
            <SandpackPreview
              showNavigator
              showOpenInCodeSandbox={false}
              showRefreshButton
              className="!h-full"
            />
          </div>
          {showConsole && (
            <div className="h-1/3 min-h-[100px] border-t">
              <SandpackConsole className="!h-full" />
            </div>
          )}
        </div>
      </TabsContent>

      {/* Mobile footer */}
      <div className="h-10 border-t bg-muted/30 flex items-center justify-center px-3 gap-2 shrink-0">
        <Button
          variant={showConsole ? "secondary" : "ghost"}
          size="sm"
          className="h-7 gap-1.5"
          onClick={() => setShowConsole(!showConsole)}
        >
          <TerminalSquare className="h-3 w-3" />
          Console
        </Button>
      </div>
    </Tabs>
  );
}

export function SandpackExecutor({
  id,
  code,
  language,
  template = "react",
  files,
  entry,
}: SandpackExecutorProps) {
  const { theme } = useTheme();
  const [remountKey, setRemountKey] = useState(0);
  const [showConsole, setShowConsole] = useState(false);
  const [showExplorer, setShowExplorer] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const handleRefresh = useCallback(() => {
    setRemountKey((k) => k + 1);
  }, []);

  const handleToggleExplorer = useCallback(() => {
    setShowExplorer((v) => !v);
  }, []);

  const handleToggleConsole = useCallback(() => {
    setShowConsole((v) => !v);
  }, []);

  const sandpackTemplate = useMemo((): SandpackPredefinedTemplate => {
    if (files) {
      if (files["/package.json"]) {
        const pkg = files["/package.json"];
        if (pkg.includes("next")) return "nextjs";
        if (pkg.includes("vite")) return "vite";
        if (pkg.includes("vue")) return "vue";
      }
      if (Object.keys(files).some((f) => f.endsWith(".vue"))) return "vue";
    }

    if (template) return template as SandpackPredefinedTemplate;

    if (language === "vue") return "vue";
    if (
      language === "typescript" ||
      language === "ts" ||
      language === "tsx"
    )
      return "react-ts";
    if (
      language === "javascript" ||
      language === "js" ||
      language === "jsx"
    )
      return "react";
    return "react";
  }, [language, template, files]);

  const sandpackFiles = useMemo((): SandpackFiles => {
    if (files && Object.keys(files).length > 0) return files;

    const isTs = sandpackTemplate.includes("ts");
    const isVue = sandpackTemplate.includes("vue");

    if (isVue) return { "/src/App.vue": code };
    if (sandpackTemplate === "vanilla") return { "/index.js": code };
    if (sandpackTemplate === "vanilla-ts") return { "/index.ts": code };

    return {
      [isTs ? "/App.tsx" : "/App.js"]: code,
    };
  }, [files, code, sandpackTemplate]);

  const containerClasses = cn(
    "flex flex-col bg-gradient-to-br from-background to-muted/20 transition-all duration-300",
    isFullscreen
      ? "fixed inset-0 z-50"
      : "h-full w-full"
  );

  return (
    <div className={containerClasses}>
      <SandpackProvider
        key={`${id}-${remountKey}`}
        template={sandpackTemplate}
        files={sandpackFiles}
        theme={theme === "dark" ? customTheme : "light"}
        options={{
          visibleFiles: entry ? [entry] : undefined,
          activeFile: entry,
          externalResources: ["https://cdn.tailwindcss.com"],
          recompileMode: "delayed",
          recompileDelay: 500,
        }}
        className="flex-1 flex flex-col overflow-hidden"
      >
        <KeyboardShortcuts
          onToggleExplorer={handleToggleExplorer}
          onToggleConsole={handleToggleConsole}
          onRefresh={handleRefresh}
        />

        {/* Main Content */}
        {isMobile ? (
          <MobileLayout
            showConsole={showConsole}
            setShowConsole={setShowConsole}
          />
        ) : (
          <SandpackLayout className="flex-1 !border-none !rounded-none !bg-transparent overflow-hidden">
            <PanelGroup direction="horizontal" className="h-full">
              {/* File Explorer Panel */}
              {showExplorer && (
                <>
                  <Panel
                    defaultSize={15}
                    minSize={10}
                    maxSize={30}
                    className="bg-muted/20"
                  >
                    <div className="h-full border-r border-border/40 overflow-hidden">
                      <SandpackFileExplorer className="!h-full" />
                    </div>
                  </Panel>
                  <PanelResizeHandle className="w-1 bg-border/30 hover:bg-primary/50 transition-colors cursor-col-resize" />
                </>
              )}

              {/* Code Editor Panel */}
              <Panel defaultSize={showExplorer ? 45 : 50} minSize={30}>
                <SandpackCodeEditor
                  showTabs
                  showLineNumbers
                  showInlineErrors
                  wrapContent
                  closableTabs
                  className="!h-full"
                />
              </Panel>

              <PanelResizeHandle className="w-1 bg-border/30 hover:bg-primary/50 transition-colors cursor-col-resize" />

              {/* Preview + Console Panel */}
              <Panel defaultSize={showExplorer ? 40 : 50} minSize={25}>
                <PanelGroup direction="vertical" className="h-full">
                  <Panel defaultSize={showConsole ? 70 : 100} minSize={30}>
                    <SandpackPreview
                      showNavigator
                      showOpenInCodeSandbox={false}
                      showRefreshButton
                      className="!h-full"
                    />
                  </Panel>

                  {showConsole && (
                    <>
                      <PanelResizeHandle className="h-1 bg-border/30 hover:bg-primary/50 transition-colors cursor-row-resize" />
                      <Panel defaultSize={30} minSize={15} maxSize={50}>
                        <div className="h-full border-t border-border/40 bg-muted/10">
                          <SandpackConsole className="!h-full" />
                        </div>
                      </Panel>
                    </>
                  )}
                </PanelGroup>
              </Panel>
            </PanelGroup>
          </SandpackLayout>
        )}

        {/* Premium Status Bar */}
        <div className="h-9 border-t border-border/40 bg-gradient-to-r from-muted/30 to-muted/10 flex items-center justify-between px-3 text-xs shrink-0">
          <div className="flex items-center gap-2">
            {!isMobile && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={showExplorer ? "secondary" : "ghost"}
                    size="icon"
                    className="h-6 w-6"
                    onClick={handleToggleExplorer}
                  >
                    <PanelLeft className="h-3 w-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  Toggle Explorer (Ctrl+B)
                </TooltipContent>
              </Tooltip>
            )}

            <Badge
              variant="outline"
              className="text-[10px] font-normal bg-background/50"
            >
              {sandpackTemplate}
            </Badge>
          </div>

          <div className="flex items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={showConsole ? "secondary" : "ghost"}
                  size="sm"
                  className="h-6 gap-1.5 px-2 font-normal"
                  onClick={handleToggleConsole}
                >
                  <TerminalSquare className="h-3 w-3" />
                  <span className="hidden sm:inline">Console</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                Toggle Console (Ctrl+`)
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={handleRefresh}
                >
                  <RefreshCw className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                Refresh (Ctrl+S)
              </TooltipContent>
            </Tooltip>

            <UnstyledOpenInCodeSandboxButton className="inline-flex items-center justify-center h-6 w-6 rounded-md hover:bg-accent transition-colors">
              <Tooltip>
                <TooltipTrigger asChild>
                  <ExternalLink className="h-3 w-3" />
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  Open in CodeSandbox
                </TooltipContent>
              </Tooltip>
            </UnstyledOpenInCodeSandboxButton>

            {!isMobile && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setIsFullscreen(!isFullscreen)}
                  >
                    {isFullscreen ? (
                      <Minimize2 className="h-3 w-3" />
                    ) : (
                      <Maximize2 className="h-3 w-3" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  {isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </SandpackProvider>
    </div>
  );
}
