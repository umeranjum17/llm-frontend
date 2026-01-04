"use client";

import { useState, useRef } from "react";
import { Upload, File, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { addProjectFile } from "@/lib/db/queries";
import { extractTextFromFile } from "@/lib/utils/file-extractor";
import { cn } from "@/lib/utils";

interface FileUploaderProps {
  projectId: string;
  onUploadComplete?: () => void;
}

export function FileUploader({ projectId, onUploadComplete }: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ACCEPTED_TYPES = [
    ".txt",
    ".md",
    ".pdf",
    ".docx",
    ".csv",
    ".json",
    ".js",
    ".ts",
    ".tsx",
    ".jsx",
    ".py",
    ".java",
    ".c",
    ".cpp",
    ".html",
    ".css",
  ];

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    await handleFiles(files);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    await handleFiles(files);
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleFiles = async (files: File[]) => {
    setIsUploading(true);

    for (const file of files) {
      try {
        setUploadProgress(`Processing ${file.name}...`);

        // Extract text from file
        const extractedText = await extractTextFromFile(file);

        // Save to database
        await addProjectFile({
          projectId,
          name: file.name,
          mime: file.type,
          size: file.size,
          text: extractedText,
        });

        setUploadProgress(`Uploaded ${file.name}`);
      } catch (error) {
        console.error(`Failed to process ${file.name}:`, error);
        setUploadProgress(`Failed: ${file.name}`);
      }
    }

    setIsUploading(false);
    setUploadProgress("");
    onUploadComplete?.();
  };

  return (
    <div className="space-y-4">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-primary/50"
        )}
        onClick={() => fileInputRef.current?.click()}
      >
        <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
        <p className="text-sm font-medium mb-1">
          Drop files here or click to browse
        </p>
        <p className="text-xs text-muted-foreground mb-4">
          Supports: TXT, MD, PDF, DOCX, CSV, JSON, and code files
        </p>
        <p className="text-xs text-muted-foreground">
          Max file size: 10MB per file
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_TYPES.join(",")}
          onChange={handleFileSelect}
          className="hidden"
        />
      </div>

      {isUploading && (
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">{uploadProgress}</span>
          </div>
        </Card>
      )}
    </div>
  );
}
