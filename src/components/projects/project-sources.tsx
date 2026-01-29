"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Trash2, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getProjectFiles, deleteProjectFile } from "@/lib/db/queries";
import { deleteFileIndex } from "@/lib/rag/file-indexer";
import { getFileIcon, formatFileSize } from "@/lib/utils/file-extractor";
import { FileUploader } from "./file-uploader";

interface ProjectSourcesProps {
  projectId: string;
}

export function ProjectSources({ projectId }: ProjectSourcesProps) {
  const files = useLiveQuery(() => getProjectFiles(projectId), [projectId]);

  const handleDelete = async (fileId: string) => {
    await deleteFileIndex(fileId);
    await deleteProjectFile(fileId);
  };

  return (
    <div className="space-y-4">
      <FileUploader projectId={projectId} />

      {files && files.length > 0 && (
        <div className="space-y-1">
          {files.map((file) => (
            <div
              key={file.id}
              className="flex items-center gap-3 px-3 py-2 rounded-lg border bg-background/50 hover:bg-muted/50 transition-colors"
            >
              <span className="text-lg">{getFileIcon(file.name)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(file.size)}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {file.indexed ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => handleDelete(file.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {files && files.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No source files yet. Upload files to enable Knowledge Base mode.
        </p>
      )}
    </div>
  );
}
