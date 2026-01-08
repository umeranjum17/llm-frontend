"use client";

import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, Code, Eye, Maximize2, Download, Play, Copy, FileText, AlertCircle } from "lucide-react";
import { useUIStore } from "@/stores/ui-store";
import { CodeBlock } from "@/components/markdown/code-block";
import { MonacoEditor } from "@/components/artifacts/monaco-editor";
import { SandpackExecutor } from "@/components/artifacts/sandpack-executor";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

export function ArtifactShell() {
    const setShowArtifacts = useUIStore((state) => state.setShowArtifacts);
    const activeArtifact = useUIStore((state) => state.activeArtifact);
    const [activeTab, setActiveTab] = useState("preview");

    // Switch to preview if the artifact is HTML/React-ish
    // Switch to run for executable languages
    useEffect(() => {
        if (activeArtifact) {
            const executableLangs = ["javascript", "typescript", "jsx", "tsx"];
            const webLangs = ["html", "javascript", "typescript", "jsx", "tsx", "css"];
            
            if (executableLangs.includes(activeArtifact.language)) {
                setActiveTab("run");
            } else if (webLangs.includes(activeArtifact.language)) {
                setActiveTab("preview");
            } else {
                setActiveTab("code");
            }
        }
    }, [activeArtifact?.id]);
    
    const isExecutable = activeArtifact && ["javascript", "typescript", "jsx", "tsx"].includes(activeArtifact.language);

    const handleDownload = () => {
        if (!activeArtifact) return;
        const blob = new Blob([activeArtifact.code], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `artifact-${activeArtifact.id.slice(0, 8)}.${activeArtifact.language || "txt"}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success("Artifact downloaded");
    };

    const handleCopyCode = () => {
        if (!activeArtifact) return;
        navigator.clipboard.writeText(activeArtifact.code);
        toast.success("Code copied to clipboard");
    };

    const handleFormatCode = () => {
        if (!activeArtifact) return;
        try {
            // Simple formatting - could be enhanced with prettier
            const formatted = activeArtifact.code
                .split('\n')
                .map(line => line.trimEnd())
                .join('\n');
            // Note: This doesn't actually update the artifact, just shows formatted version
            toast.info("Formatting applied (view only)");
        } catch (error) {
            toast.error("Failed to format code");
        }
    };

    const fileSize = activeArtifact ? new Blob([activeArtifact.code]).size : 0;
    const lineCount = activeArtifact ? activeArtifact.code.split('\n').length : 0;
    const fileSizeKB = (fileSize / 1024).toFixed(2);

    return (
        <div className="flex h-full flex-col border-l bg-background">
            {/* Header */}
            <div className="flex items-center justify-between border-b px-4 py-2 bg-muted/30">
                <div className="flex items-center gap-2 overflow-hidden flex-1 min-w-0">
                    <h3 className="text-sm font-semibold truncate">
                        {activeArtifact?.title || "Artifacts"}
                    </h3>
                    {activeArtifact && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="outline" className="text-xs">
                                <FileText className="h-3 w-3 mr-1" />
                                {lineCount} lines
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                                {fileSizeKB} KB
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
            <div className="flex-1 overflow-hidden">
                {!activeArtifact ? (
                    <div className="h-full flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
                        <Code className="h-8 w-8 mb-4 opacity-50" />
                        <p className="text-sm font-medium">No artifact selected</p>
                        <p className="text-xs opacity-70">Click the maximize icon on a code block to view it here</p>
                    </div>
                ) : (
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="flex h-full flex-col">
                        <div className="px-4 py-2 border-b bg-muted/10">
                            <TabsList className="w-full justify-start h-8 p-0 bg-transparent gap-4">
                                {isExecutable && (
                                    <TabsTrigger
                                        value="run"
                                        className="h-8 px-2 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary"
                                    >
                                        <Play className="mr-2 h-3.5 w-3.5" />
                                        Run
                                    </TabsTrigger>
                                )}
                                <TabsTrigger
                                    value="preview"
                                    className="h-8 px-2 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary"
                                >
                                    <Eye className="mr-2 h-3.5 w-3.5" />
                                    Preview
                                </TabsTrigger>
                                <TabsTrigger
                                    value="code"
                                    className="h-8 px-2 data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary"
                                >
                                    <Code className="mr-2 h-3.5 w-3.5" />
                                    Code
                                </TabsTrigger>
                            </TabsList>
                        </div>

                        {isExecutable && (
                            <TabsContent value="run" className="flex-1 m-0 p-0 overflow-hidden">
                                <div className="h-full">
                                    <SandpackExecutor
                                        code={activeArtifact.code}
                                        language={activeArtifact.language}
                                    />
                                </div>
                            </TabsContent>
                        )}
                        <TabsContent value="preview" className="flex-1 m-0 p-0 overflow-hidden">
                            <div className="h-full relative">
                                {activeArtifact.language === "html" ? (
                                    <iframe
                                        srcDoc={activeArtifact.code}
                                        className="w-full h-full border-0"
                                        sandbox="allow-scripts allow-same-origin"
                                        title="Preview"
                                    />
                                ) : activeArtifact.language === "css" ? (
                                    <div className="h-full p-4 overflow-auto">
                                        <style dangerouslySetInnerHTML={{ __html: activeArtifact.code }} />
                                        <div className="p-4 border rounded-lg bg-background">
                                            <p className="text-sm text-muted-foreground">CSS Preview</p>
                                            <div className="mt-4 p-4 bg-primary/10 rounded">
                                                Sample content with applied styles
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-center opacity-70 p-8">
                                        <AlertCircle className="h-8 w-8 mb-2 opacity-50" />
                                        <p className="text-sm font-medium">Preview not available</p>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Preview is currently limited to HTML and CSS.
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            Use the &quot;Code&quot; tab to view content.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </TabsContent>

                        <TabsContent value="code" className="flex-1 m-0 overflow-hidden">
                            <div className="h-full">
                                <MonacoEditor
                                    language={activeArtifact.language || "text"}
                                    code={activeArtifact.code}
                                    readOnly={true}
                                />
                            </div>
                        </TabsContent>
                    </Tabs>
                )}
            </div>
        </div>
    );
}
