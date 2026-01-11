"use client";

import { useEffect, useState } from "react";
import mammoth from "mammoth";
import { FileText, Loader2, AlertTriangle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface DocxViewerProps {
    content: string; // Base64 content or raw string
    filename: string;
}

// Basic HTML sanitization to remove dangerous tags and attributes
function sanitizeHtml(html: string): string {
    const temp = document.createElement('div');
    temp.innerHTML = html;

    // Remove script tags
    const scripts = temp.getElementsByTagName('script');
    while (scripts.length > 0) {
        scripts[0].parentNode?.removeChild(scripts[0]);
    }

    // Remove event handlers
    const all = temp.getElementsByTagName('*');
    for (let i = 0; i < all.length; i++) {
        const attributes = all[i].attributes;
        for (let j = attributes.length - 1; j >= 0; j--) {
            const attr = attributes[j];
            if (attr.name.startsWith('on')) {
                all[i].removeAttribute(attr.name);
            }
        }
    }

    return temp.innerHTML;
}

export function DocxViewer({ content, filename }: DocxViewerProps) {
    const [html, setHtml] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function convert() {
            try {
                setLoading(true);
                setError(null);

                // Try to decode base64 content
                let binaryString: string;
                try {
                    binaryString = window.atob(content);
                } catch (atobError) {
                    throw new Error("Content is not valid base64. Please provide base64-encoded DOCX content.");
                }

                // Convert to Uint8Array
                const len = binaryString.length;
                const bytes = new Uint8Array(len);
                for (let i = 0; i < len; i++) {
                    bytes[i] = binaryString.charCodeAt(i);
                }

                // Convert DOCX to HTML using mammoth
                const result = await mammoth.convertToHtml({ arrayBuffer: bytes.buffer });

                // Sanitize HTML before setting
                const sanitized = sanitizeHtml(result.value);
                setHtml(sanitized);

                if (result.messages.length > 0) {
                    console.warn("Mammoth conversion warnings:", result.messages);
                }
            } catch (err) {
                console.error("Docx conversion error:", err);
                const errorMessage = err instanceof Error ? err.message : "Failed to render document.";
                setError(errorMessage);
            } finally {
                setLoading(false);
            }
        }

        if (content) {
            convert();
        } else {
            setLoading(false);
            setError("No content provided");
        }
    }, [content]);

    if (loading) {
        return (
            <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin mb-2" />
                <p>Rendering Document...</p>
            </div>
        )
    }

    if (error) {
        return (
            <div className="flex h-full flex-col items-center justify-center text-destructive p-4 text-center">
                <AlertTriangle className="h-8 w-8 mb-2" />
                <p>{error}</p>
                <p className="text-xs text-muted-foreground mt-2">Note: Only DOCX base64 content is supported.</p>
            </div>
        )
    }

    return (
        <div className="flex h-full flex-col bg-background">
            <div className="flex items-center border-b p-3 bg-muted/20 gap-2">
                <FileText className="h-4 w-4 text-blue-600" />
                <span className="font-medium text-sm truncate">{filename}</span>
            </div>
            <ScrollArea className="flex-1 p-8">
                <div
                    className="prose dark:prose-invert max-w-none bg-white dark:bg-zinc-900 p-8 shadow-sm min-h-[500px]"
                    dangerouslySetInnerHTML={{ __html: html || "" }}
                />
            </ScrollArea>
        </div>
    );
}
