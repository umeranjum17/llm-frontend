"use client";

import { useState, useEffect } from "react";
import {
  Plus,
  Trash2,
  RefreshCw,
  FolderCode,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  FileCode,
  Database,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useClawStore } from "@/stores/claw-store";
import { toast } from "sonner";
import type { Codebase } from "@/lib/claw/types";

const statusConfig: Record<Codebase["status"], { color: string; icon: React.ReactNode; label: string }> = {
  pending: {
    color: "bg-yellow-500/20 text-yellow-600",
    icon: <Clock className="h-3 w-3" />,
    label: "Pending",
  },
  indexing: {
    color: "bg-blue-500/20 text-blue-600",
    icon: <Loader2 className="h-3 w-3 animate-spin" />,
    label: "Indexing",
  },
  ready: {
    color: "bg-green-500/20 text-green-600",
    icon: <CheckCircle2 className="h-3 w-3" />,
    label: "Ready",
  },
  error: {
    color: "bg-red-500/20 text-red-600",
    icon: <XCircle className="h-3 w-3" />,
    label: "Error",
  },
};

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
}

export function ClawCodebasesPanel() {
  const codebases = useClawStore((s) => s.codebases);
  const registerCodebase = useClawStore((s) => s.registerCodebase);
  const indexCodebase = useClawStore((s) => s.indexCodebase);
  const deleteCodebase = useClawStore((s) => s.deleteCodebase);
  const refreshCodebases = useClawStore((s) => s.refreshCodebases);
  const isConnected = useClawStore((s) => s.isConnected);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [indexingIds, setIndexingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isConnected) {
      refreshCodebases();
    }
  }, [isConnected, refreshCodebases]);

  const handleRegister = async () => {
    if (!name.trim() || !path.trim()) {
      toast.error("Name and path are required");
      return;
    }
    setIsSubmitting(true);
    try {
      const codebase = await registerCodebase(name.trim(), path.trim(), description.trim() || undefined);
      if (codebase) {
        toast.success(`Codebase "${name}" registered`);
        setName("");
        setPath("");
        setDescription("");
        setDialogOpen(false);
      } else {
        toast.error("Failed to register codebase");
      }
    } catch (e) {
      toast.error((e as Error).message || "Failed to register codebase");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleIndex = async (id: string, incremental = false) => {
    setIndexingIds((prev) => new Set(prev).add(id));
    try {
      await indexCodebase(id, incremental);
      toast.success(incremental ? "Incremental indexing started" : "Full indexing started");
    } catch (e) {
      toast.error((e as Error).message || "Failed to start indexing");
    } finally {
      setIndexingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete codebase "${name}"? This will remove all indexed data.`)) {
      return;
    }
    try {
      await deleteCodebase(id);
      toast.success(`Codebase "${name}" deleted`);
    } catch (e) {
      toast.error((e as Error).message || "Failed to delete codebase");
    }
  };

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <FolderCode className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Codebases</h3>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {codebases.length}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  onClick={() => refreshCodebases()}
                  disabled={!isConnected}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" disabled={!isConnected}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Register Codebase</DialogTitle>
                <DialogDescription>
                  Add a local codebase for indexing. The path must be accessible from the Claw server.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="codebase-name">Name</Label>
                  <Input
                    id="codebase-name"
                    placeholder="my-project"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="codebase-path">Path</Label>
                  <Input
                    id="codebase-path"
                    placeholder="/home/user/projects/my-project"
                    value={path}
                    onChange={(e) => setPath(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="codebase-description">Description (optional)</Label>
                  <Input
                    id="codebase-description"
                    placeholder="A brief description..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
                <Button onClick={handleRegister} className="w-full" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Register
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="p-2 max-h-[400px] overflow-y-auto">
        {codebases.length === 0 ? (
          <div className="px-2 py-8 text-center">
            <FolderCode className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">No codebases registered yet.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Add a codebase to enable @codebase mentions in chat.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {codebases.map((codebase) => {
              const status = statusConfig[codebase.status];
              const isCurrentlyIndexing = indexingIds.has(codebase.id) || codebase.status === "indexing";

              return (
                <div
                  key={codebase.id}
                  className="rounded-md px-3 py-2.5 hover:bg-muted/40 transition-colors border border-transparent hover:border-border/50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{codebase.name}</span>
                        <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 flex items-center gap-1 ${status.color}`}>
                          {status.icon}
                          {status.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5" title={codebase.path}>
                        {codebase.path}
                      </p>
                      {codebase.description && (
                        <p className="text-xs text-muted-foreground/80 mt-1 line-clamp-1">
                          {codebase.description}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                        {codebase.fileCount !== undefined && (
                          <span className="flex items-center gap-1">
                            <FileCode className="h-3 w-3" />
                            {codebase.fileCount} files
                          </span>
                        )}
                        {codebase.chunkCount !== undefined && (
                          <span className="flex items-center gap-1">
                            <Database className="h-3 w-3" />
                            {codebase.chunkCount} chunks
                          </span>
                        )}
                        {codebase.lastIndexedAt && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatRelativeTime(codebase.lastIndexedAt)}
                          </span>
                        )}
                      </div>
                      {codebase.error && (
                        <p className="text-xs text-destructive mt-1 line-clamp-2">{codebase.error}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleIndex(codebase.id, codebase.status === "ready")}
                              disabled={isCurrentlyIndexing}
                            >
                              {isCurrentlyIndexing ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <RefreshCw className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {codebase.status === "ready" ? "Re-index (incremental)" : "Start indexing"}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleDelete(codebase.id, codebase.name)}
                              disabled={isCurrentlyIndexing}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Delete codebase</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {codebases.length > 0 && (
        <div className="border-t px-4 py-2 text-[10px] text-muted-foreground">
          Use @codebase:{"{id}"}[name] in chat to search indexed code
        </div>
      )}
    </div>
  );
}
