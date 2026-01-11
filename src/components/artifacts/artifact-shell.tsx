"use client";

import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, Code, Eye, Maximize2, Download, Play, Copy, FileText, AlertCircle, LayoutTemplate } from "lucide-react";
import { useUIStore } from "@/stores/ui-store";
import { CodeBlock } from "@/components/markdown/code-block";
import { MonacoEditor } from "@/components/artifacts/monaco-editor";
import { SandpackExecutor } from "@/components/artifacts/sandpack-executor";
import { DataViewer } from "@/components/artifacts/data-viewer";
import { DocxViewer } from "@/components/artifacts/docx-viewer";
import { ArtifactErrorBoundary } from "@/components/artifacts/artifact-error-boundary";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

export function ArtifactShell() {
    const setShowArtifacts = useUIStore((state) => state.setShowArtifacts);
    const activeArtifact = useUIStore((state) => state.activeArtifact);
    const [activeTab, setActiveTab] = useState("preview");

    // Determine artifact type for routing
    const isProject = activeArtifact?.type === 'project' || !!activeArtifact?.files;
    const isRunnable = activeArtifact && (
        isProject ||
        ["javascript", "typescript", "jsx", "tsx", "vue", "react", "node"].includes(activeArtifact.language)
    );
    const isData = activeArtifact && ["csv", "tsv", "sheet"].includes(activeArtifact.language || activeArtifact.type);
    const isDoc = activeArtifact && ["docx", "word"].includes(activeArtifact.language || activeArtifact.type);
    const isHtml = activeArtifact?.language === 'html';
    const isMarkdown = activeArtifact?.language === 'markdown';

    // Switch to appropriate tab on artifact change
    useEffect(() => {
        if (activeArtifact) {
            if (isProject || isRunnable) {
                setActiveTab("run");
            } else if (isData || isDoc || isHtml) {
                setActiveTab("preview");
            } else {
                setActiveTab("code");
            }
        }
    }, [activeArtifact, isProject, isRunnable, isData, isDoc, isHtml]);

    const handleDownload = () => {
        if (!activeArtifact) return;
        const content = activeArtifact.code || "";
        const blob = new Blob([content], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const filename = activeArtifact.title || `artifact-${activeArtifact.id.slice(0, 8)}`;
        a.download = `${filename}.${activeArtifact.language || "txt"}`;
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

    const fileSize = activeArtifact && activeArtifact.code ? new Blob([activeArtifact.code]).size : 0;
    const lineCount = activeArtifact && activeArtifact.code ? activeArtifact.code.split('\n').length : 0;
    const fileSizeKB = (fileSize / 1024).toFixed(2);

    return (
        <div className="flex h-full flex-col border-l bg-background">
            {/* Header */}
            <div className="flex items-center justify-between border-b px-4 py-2 bg-muted/30">
                <div className="flex items-center gap-2 overflow-hidden flex-1 min-w-0">
                    <h3 className="text-sm font-semibold truncate flex items-center gap-2">
                        {isProject ? <LayoutTemplate className="h-4 w-4 text-blue-500" /> : null}
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
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleCopyCode} title="Copy code">
                                <Copy className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleDownload} title="Download">
                                <Download className="h-4 w-4" />
                            </Button>
                        </>
                    )}
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setShowArtifacts(false)}
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
                        <p className="text-xs opacity-70">Click "Open Project" or code blocks to view content.</p>
                    </div>
                ) : (
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="flex h-full flex-col">
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
                                {(isData || isDoc || isHtml || isMarkdown) && (
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

                        {/* RUN TAB (Sandpack) */}
                        <TabsContent value="run" className="flex-1 m-0 p-0 overflow-hidden h-full">
                            <ArtifactErrorBoundary fallbackTitle="Failed to load code executor">
                                <SandpackExecutor
                                    id={activeArtifact.id}
                                    code={activeArtifact.code || ""}
                                    language={activeArtifact.language}
                                    template={activeArtifact.template}
                                    files={activeArtifact.files}
                                    entry={activeArtifact.entry}
                                />
                            </ArtifactErrorBoundary>
                        </TabsContent>

                        {/* PREVIEW TAB (Data, Doc, HTML) */}
                        <TabsContent value="preview" className="flex-1 m-0 p-0 overflow-hidden h-full">
                            {isData ? (
                                <ArtifactErrorBoundary fallbackTitle="Failed to load data viewer">
                                    <DataViewer content={activeArtifact.code || ""} filename={activeArtifact.title} />
                                </ArtifactErrorBoundary>
                            ) : isDoc ? (
                                <ArtifactErrorBoundary fallbackTitle="Failed to load document">
                                    <DocxViewer content={activeArtifact.code || ""} filename={activeArtifact.title} />
                                </ArtifactErrorBoundary>
                            ) : isHtml ? (
                                <ArtifactErrorBoundary fallbackTitle="Failed to load HTML preview">
                                    <iframe
                                        srcDoc={activeArtifact.code}
                                        className="w-full h-full border-0 bg-white"
                                        sandbox="allow-scripts allow-same-origin"
                                        title="Preview"
                                    />
                                </ArtifactErrorBoundary>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-center opacity-70 p-8">
                                    <Eye className="h-8 w-8 mb-2 opacity-50" />
                                    <p className="text-sm font-medium">No preview available</p>
                                </div>
                            )}
                        </TabsContent>

                        {/* CODE TAB (Monaco) */}
                        <TabsContent value="code" className="flex-1 m-0 overflow-hidden h-full">
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
    );
}
