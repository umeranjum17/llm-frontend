"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
    X,
    Code,
    Eye,
    Maximize2,
    Minimize2,
    Download,
    Play,
    Copy,
    LayoutTemplate,
} from "lucide-react";
import { useUIStore, Artifact } from "@/stores/ui-store";
import { MonacoEditor } from "@/components/artifacts/monaco-editor";
import { SandpackExecutor } from "@/components/artifacts/sandpack-executor";
import { E2BExecutor } from "@/components/artifacts/e2b-executor";
import { DataViewer } from "@/components/artifacts/data-viewer";
import { DocxViewer } from "@/components/artifacts/docx-viewer";
import { ArtifactErrorBoundary } from "@/components/artifacts/artifact-error-boundary";
import { MarkdownRenderer } from "@/components/markdown/markdown-renderer";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { cn, sanitizeSvgHtml, languageToExtension } from "@/lib/utils";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

export function ArtifactShell() {
    const setShowArtifacts = useUIStore((state) => state.setShowArtifacts);
    const activeArtifact = useUIStore((state) => state.activeArtifact);
    const artifactTabs = useUIStore((state) => state.artifactTabs);
    const setActiveArtifact = useUIStore((state) => state.setActiveArtifact);
    const removeArtifactTab = useUIStore((state) => state.removeArtifactTab);
    const clearArtifactTabs = useUIStore((state) => state.clearArtifactTabs);
    const artifactsFullscreen = useUIStore((state) => state.artifactsFullscreen);
    const setArtifactsFullscreen = useUIStore(
        (state) => state.setArtifactsFullscreen
    );

    const [activeTab, setActiveTab] = useState("preview");
    const iframeRef = useRef<HTMLIFrameElement>(null);

    // Determine artifact type for routing
    const isProject =
        activeArtifact?.type === "project" || !!activeArtifact?.files;

    // Languages that run in Sandpack (browser-based JS/TS)
    const isSandpackRunnable =
        activeArtifact &&
        (isProject ||
            [
                "javascript",
                "typescript",
                "jsx",
                "tsx",
                "vue",
                "react",
                "node",
            ].includes(activeArtifact.language));

    // Languages that run in E2B (remote sandbox - Python, Node.js, Bash)
    const isE2BRunnable =
        activeArtifact &&
        ["python", "py", "bash", "sh", "shell"].includes(activeArtifact.language || "");

    const isRunnable = isSandpackRunnable || isE2BRunnable;

    const isData =
        activeArtifact &&
        ["csv", "tsv", "sheet"].includes(
            activeArtifact.language || activeArtifact.type
        );
    const isDoc =
        activeArtifact &&
        ["docx", "word"].includes(activeArtifact.language || activeArtifact.type);
    const isHtml = activeArtifact?.language === "html";
    const isSvg = activeArtifact?.language === "svg";
    const isMarkdown = activeArtifact?.language === "markdown";

    // Switch to appropriate tab on artifact change
    useEffect(() => {
        if (activeArtifact) {
            if (isRunnable) {
                setActiveTab("run");
            } else if (isData || isDoc || isHtml || isSvg || isMarkdown) {
                setActiveTab("preview");
            } else {
                setActiveTab("code");
            }
        }
    }, [activeArtifact, isRunnable, isData, isDoc, isHtml, isSvg, isMarkdown]);

    // Handle escape key for fullscreen
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape" && artifactsFullscreen) {
                setArtifactsFullscreen(false);
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [artifactsFullscreen, setArtifactsFullscreen]);

    // Auto-focus iframe when HTML preview is active so keyboard events go to the game/app
    useEffect(() => {
        if (isHtml && activeTab === "preview" && iframeRef.current) {
            // Small delay to ensure iframe is rendered
            const timer = setTimeout(() => {
                iframeRef.current?.focus();
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [isHtml, activeTab, activeArtifact?.id]);

    const handleDownload = () => {
        if (!activeArtifact) return;
        const content = activeArtifact.code || "";
        const blob = new Blob([content], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const filename =
            activeArtifact.title || `artifact-${activeArtifact.id.slice(0, 8)}`;
        a.download = `${filename}.${languageToExtension(activeArtifact.language || "txt")}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success("Artifact downloaded");
    };

    const handleCopyCode = () => {
        if (!activeArtifact) return;
        const content = activeArtifact.code || "";
        navigator.clipboard.writeText(content);
        toast.success("Code copied to clipboard");
    };

    const handleCloseTab = (e: React.MouseEvent, artifact: Artifact) => {
        e.stopPropagation();
        removeArtifactTab(artifact.id);
    };

    const handleClose = () => {
        clearArtifactTabs();
        setShowArtifacts(false);
    };

    const containerClasses = cn(
        "flex flex-col border-l bg-gradient-to-br from-background to-muted/10",
        artifactsFullscreen
            ? "fixed inset-0 z-50 border-none"
            : "h-full"
    );

    return (
        <TooltipProvider>
            <div className={containerClasses}>
                {/* Multi-Tab Header */}
                {artifactTabs.length > 1 && (
                    <div className="h-9 border-b bg-muted/20 flex items-center px-1 shrink-0 overflow-hidden">
                        <ScrollArea className="flex-1">
                            <div className="flex items-center gap-0.5">
                                {artifactTabs.map((tab) => (
                                    <Button
                                        key={tab.id}
                                        variant={activeArtifact?.id === tab.id ? "secondary" : "ghost"}
                                        size="sm"
                                        className={cn(
                                            "h-7 px-2 gap-1.5 text-xs font-normal shrink-0 max-w-[150px]",
                                            activeArtifact?.id === tab.id && "bg-background shadow-sm"
                                        )}
                                        onClick={() => setActiveArtifact(tab)}
                                    >
                                        {tab.type === "project" ? (
                                            <LayoutTemplate className="h-3 w-3 text-blue-500 shrink-0" />
                                        ) : (
                                            <Code className="h-3 w-3 text-muted-foreground shrink-0" />
                                        )}
                                        <span className="truncate">{tab.title}</span>
                                        <X
                                            className="h-3 w-3 text-muted-foreground hover:text-foreground shrink-0"
                                            onClick={(e) => handleCloseTab(e, tab)}
                                        />
                                    </Button>
                                ))}
                            </div>
                            <ScrollBar orientation="horizontal" />
                        </ScrollArea>
                    </div>
                )}

                {/* Header */}
                <div className="flex items-center justify-between border-b px-4 py-2 bg-muted/30 shrink-0">
                    <div className="flex items-center gap-2 overflow-hidden flex-1 min-w-0">
                        <h3 className="text-sm font-semibold truncate flex items-center gap-2">
                            {isProject ? (
                                <LayoutTemplate className="h-4 w-4 text-blue-500" />
                            ) : null}
                            {activeArtifact?.title || "Artifacts"}
                        </h3>
                        {activeArtifact && !isProject && (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground ml-2">
                                <Badge variant="outline" className="text-xs font-normal">
                                    {activeArtifact.language}
                                </Badge>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        {activeArtifact && (
                            <>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8"
                                            onClick={handleCopyCode}
                                        >
                                            <Copy className="h-4 w-4" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Copy code</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8"
                                            onClick={handleDownload}
                                        >
                                            <Download className="h-4 w-4" />
                                        </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Download</TooltipContent>
                                </Tooltip>
                            </>
                        )}
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => setArtifactsFullscreen(!artifactsFullscreen)}
                                >
                                    {artifactsFullscreen ? (
                                        <Minimize2 className="h-4 w-4" />
                                    ) : (
                                        <Maximize2 className="h-4 w-4" />
                                    )}
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                                {artifactsFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                            </TooltipContent>
                        </Tooltip>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={handleClose}
                            title="Close"
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden relative">
                    {!activeArtifact ? (
                        <div className="h-full flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
                            <Code className="h-8 w-8 mb-4 opacity-50" />
                            <p className="text-sm font-medium">No artifact selected</p>
                            <p className="text-xs opacity-70">
                                Click &quot;Open Project&quot; or code blocks to view content.
                            </p>
                        </div>
                    ) : (
                        <Tabs
                            value={activeTab}
                            onValueChange={setActiveTab}
                            className="flex h-full flex-col"
                        >
                            <div className="px-4 py-0 border-b bg-muted/10 shrink-0">
                                <TabsList className="w-full justify-start h-9 p-0 bg-transparent gap-4">
                                    {(isRunnable || isProject) && (
                                        <TabsTrigger
                                            value="run"
                                            className="h-9 px-2 rounded-none data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary"
                                        >
                                            <Play className="mr-2 h-3.5 w-3.5" />
                                            Run
                                        </TabsTrigger>
                                    )}
                                    {(isData || isDoc || isHtml || isSvg || isMarkdown) && (
                                        <TabsTrigger
                                            value="preview"
                                            className="h-9 px-2 rounded-none data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary"
                                        >
                                            <Eye className="mr-2 h-3.5 w-3.5" />
                                            Preview
                                        </TabsTrigger>
                                    )}
                                    <TabsTrigger
                                        value="code"
                                        className="h-9 px-2 rounded-none data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary"
                                    >
                                        <Code className="mr-2 h-3.5 w-3.5" />
                                        Code
                                    </TabsTrigger>
                                </TabsList>
                            </div>

                            {/* RUN TAB (Sandpack or E2B) */}
                            <TabsContent
                                value="run"
                                className="flex-1 m-0 p-0 overflow-hidden h-full"
                            >
                                <ArtifactErrorBoundary fallbackTitle="Failed to load code executor">
                                    {isE2BRunnable ? (
                                        <E2BExecutor
                                            id={activeArtifact.id}
                                            code={activeArtifact.code || ""}
                                            language={
                                                activeArtifact.language === "py" ? "python" :
                                                activeArtifact.language === "sh" || activeArtifact.language === "shell" ? "bash" :
                                                activeArtifact.language as "python" | "javascript" | "bash"
                                            }
                                        />
                                    ) : (
                                        <SandpackExecutor
                                            id={activeArtifact.id}
                                            code={activeArtifact.code || ""}
                                            language={activeArtifact.language}
                                            template={activeArtifact.template}
                                            files={activeArtifact.files}
                                            entry={activeArtifact.entry}
                                        />
                                    )}
                                </ArtifactErrorBoundary>
                            </TabsContent>

                            {/* PREVIEW TAB (Data, Doc, HTML) */}
                            <TabsContent
                                value="preview"
                                className="flex-1 m-0 p-0 overflow-hidden h-full"
                            >
                                {isData ? (
                                    <ArtifactErrorBoundary fallbackTitle="Failed to load data viewer">
                                        <DataViewer
                                            content={activeArtifact.code || ""}
                                            filename={activeArtifact.title}
                                        />
                                    </ArtifactErrorBoundary>
                                ) : isDoc ? (
                                    <ArtifactErrorBoundary fallbackTitle="Failed to load document">
                                        <DocxViewer
                                            content={activeArtifact.code || ""}
                                            filename={activeArtifact.title}
                                        />
                                    </ArtifactErrorBoundary>
                                ) : isHtml ? (
                                    <ArtifactErrorBoundary fallbackTitle="Failed to load HTML preview">
                                        <div
                                            className="w-full h-full relative overflow-hidden"
                                            onClick={() => iframeRef.current?.focus()}
                                            onKeyDown={(e) => {
                                                // Prevent keyboard events from bubbling to parent app
                                                e.stopPropagation();
                                            }}
                                            onWheel={(e) => {
                                                // Prevent scroll from affecting parent
                                                e.stopPropagation();
                                            }}
                                        >
                                            <iframe
                                                ref={iframeRef}
                                                srcDoc={activeArtifact.code}
                                                className="absolute inset-0 w-full h-full border-0 bg-white focus:outline-none"
                                                sandbox="allow-scripts allow-forms allow-popups allow-modals"
                                                title="Preview"
                                                tabIndex={0}
                                                onLoad={() => {
                                                    // Focus iframe
                                                    iframeRef.current?.focus();
                                                }}
                                            />
                                        </div>
                                    </ArtifactErrorBoundary>
                                ) : isSvg ? (
                                    <ArtifactErrorBoundary fallbackTitle="Failed to load SVG preview">
                                        <div className="w-full h-full flex items-center justify-center p-8 overflow-auto bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
                                            <div
                                                className="[&>svg]:w-full [&>svg]:h-auto [&>svg]:max-h-[80vh] [&>svg]:min-w-[200px]"
                                                style={{ width: '100%', maxWidth: '600px' }}
                                                dangerouslySetInnerHTML={{ __html: sanitizeSvgHtml(activeArtifact.code || "") }}
                                            />
                                        </div>
                                    </ArtifactErrorBoundary>
                                ) : isMarkdown ? (
                                    <ArtifactErrorBoundary fallbackTitle="Failed to render markdown">
                                        <div className="w-full h-full overflow-auto p-6 prose prose-sm dark:prose-invert max-w-none">
                                            <MarkdownRenderer content={activeArtifact.code || ""} />
                                        </div>
                                    </ArtifactErrorBoundary>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-center opacity-70 p-8">
                                        <Eye className="h-8 w-8 mb-2 opacity-50" />
                                        <p className="text-sm font-medium">No preview available</p>
                                    </div>
                                )}
                            </TabsContent>

                            {/* CODE TAB (Monaco) */}
                            <TabsContent
                                value="code"
                                className="flex-1 m-0 overflow-hidden h-full"
                            >
                                <ArtifactErrorBoundary fallbackTitle="Failed to load code editor">
                                    <MonacoEditor
                                        language={activeArtifact.language || "text"}
                                        code={activeArtifact.code || ""}
                                        readOnly={true}
                                    />
                                </ArtifactErrorBoundary>
                            </TabsContent>
                        </Tabs>
                    )}
                </div>
            </div>
        </TooltipProvider>
    );
}
