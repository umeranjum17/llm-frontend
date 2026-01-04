"use client";

import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, Code, Eye, Maximize2, Download } from "lucide-react";
import { useUIStore } from "@/stores/ui-store";
import { CodeBlock } from "@/components/markdown/code-block";
import { toast } from "sonner";

export function ArtifactShell() {
    const setShowArtifacts = useUIStore((state) => state.setShowArtifacts);
    const activeArtifact = useUIStore((state) => state.activeArtifact);
    const [activeTab, setActiveTab] = useState("preview");

    // Switch to preview if the artifact is HTML/React-ish (future enhancement)
    // For now, default to code for non-web languages
    useEffect(() => {
        if (activeArtifact) {
            const webLangs = ["html", "javascript", "typescript", "jsx", "tsx", "css"];
            if (!webLangs.includes(activeArtifact.language)) {
                setActiveTab("code");
            } else {
                setActiveTab("preview");
            }
        }
    }, [activeArtifact?.id]);

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

    return (
        <div className="flex h-full flex-col border-l bg-background">
            {/* Header */}
            <div className="flex items-center justify-between border-b px-4 py-2 bg-muted/30">
                <div className="flex items-center gap-2 overflow-hidden">
                    <h3 className="text-sm font-semibold truncate">
                        {activeArtifact?.title || "Artifacts"}
                    </h3>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleDownload} disabled={!activeArtifact}>
                        <Download className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setShowArtifacts(false)}
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

                        <TabsContent value="preview" className="flex-1 m-0 p-0 overflow-hidden">
                            {/* For now, just show a message if it's not HTML/web */}
                            <div className="h-full p-4 overflow-auto bg-muted/5 font-mono text-sm">
                                {activeArtifact.language === "html" ? (
                                    <div dangerouslySetInnerHTML={{ __html: activeArtifact.code }} />
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-center opacity-70">
                                        <Eye className="h-8 w-8 mb-2 opacity-50" />
                                        <p>Preview is currently limited to HTML.</p>
                                        <p className="text-xs">Use the &quot;Code&quot; tab to view content.</p>
                                    </div>
                                )}
                            </div>
                        </TabsContent>

                        <TabsContent value="code" className="flex-1 m-0 overflow-hidden">
                            <ScrollArea className="h-full">
                                <div className="p-4">
                                    <CodeBlock language={activeArtifact.language} code={activeArtifact.code} />
                                </div>
                            </ScrollArea>
                        </TabsContent>
                    </Tabs>
                )}
            </div>
        </div>
    );
}
