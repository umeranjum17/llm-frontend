"use client";

import { useState } from "react";
import {
  FolderOpen,
  GitBranch,
  Star,
  X,
  Plus,
  Loader2,
  FileCode,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useClawStore } from "@/stores/claw-store";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function truncatePath(p: string, maxLen = 40) {
  if (p.length <= maxLen) return p;
  const parts = p.split("/");
  if (parts.length <= 3) return p;
  return `.../${parts.slice(-3).join("/")}`;
}

const TYPE_ICONS: Record<string, string> = {
  node: "JS",
  rust: "RS",
  go: "GO",
  python: "PY",
};

export function ClawWorkspacesTab() {
  const openProjects = useClawStore((s) => s.openProjects);
  const codebases = useClawStore((s) => s.codebases);
  const focusProject = useClawStore((s) => s.focusProject);
  const closeProject = useClawStore((s) => s.closeProject);
  const openProjectByPath = useClawStore((s) => s.openProjectByPath);
  const client = useClawStore((s) => s.client);

  const [showAdd, setShowAdd] = useState(false);
  const [newPath, setNewPath] = useState("");
  const [adding, setAdding] = useState(false);

  // Per-card search
  const [searchQuery, setSearchQuery] = useState<Record<string, string>>({});
  const [searchResults, setSearchResults] = useState<Record<string, any[]>>({});
  const [searching, setSearching] = useState<Record<string, boolean>>({});

  const handleAdd = async () => {
    const trimmed = newPath.trim();
    if (!trimmed || adding) return;
    setAdding(true);
    try {
      const result = await openProjectByPath(trimmed);
      if (result) {
        setNewPath("");
        setShowAdd(false);
        toast.success(`Opened: ${result.name}`);
      }
    } catch {
      toast.error("Failed to open project");
    } finally {
      setAdding(false);
    }
  };

  const handleSearch = async (codebaseId: string) => {
    const query = searchQuery[codebaseId]?.trim();
    if (!query || !client) return;
    setSearching((s) => ({ ...s, [codebaseId]: true }));
    try {
      const result = await client.searchCodebase(codebaseId, query, { limit: 5 });
      setSearchResults((s) => ({ ...s, [codebaseId]: result.results }));
    } catch {
      toast.error("Search failed");
    } finally {
      setSearching((s) => ({ ...s, [codebaseId]: false }));
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Open Workspaces</h2>
          <span className="text-xs text-muted-foreground">
            ({openProjects.length})
          </span>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1"
          onClick={() => setShowAdd(!showAdd)}
        >
          <Plus className="h-3 w-3" />
          Open Workspace
        </Button>
      </div>

      {/* Add workspace input */}
      {showAdd && (
        <div className="flex gap-2 rounded-lg border bg-card p-3">
          <Input
            value={newPath}
            onChange={(e) => setNewPath(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="/path/to/project"
            className="h-8 text-sm flex-1"
            autoFocus
          />
          <Button
            size="sm"
            className="h-8"
            disabled={!newPath.trim() || adding}
            onClick={handleAdd}
          >
            {adding ? <Loader2 className="h-3 w-3 animate-spin" /> : "Open"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8"
            onClick={() => setShowAdd(false)}
          >
            Cancel
          </Button>
        </div>
      )}

      {/* No workspaces */}
      {openProjects.length === 0 && (
        <div className="rounded-lg border bg-card py-12 text-center">
          <FolderOpen className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            No open workspaces. Use{" "}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">
              claw use .
            </code>{" "}
            or click &quot;Open Workspace&quot; above.
          </p>
        </div>
      )}

      {/* Workspace cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {openProjects.map((project) => {
          const codebase = codebases.find((cb) => cb.path === project.path);
          const isIndexing = codebase?.status === "indexing";
          const isReady = codebase?.status === "ready";
          const typeLabel = TYPE_ICONS[project.projectType || ""] || project.projectType || "";

          return (
            <div
              key={project.id}
              className={cn(
                "rounded-lg border bg-card overflow-hidden transition-all",
                project.isFocused
                  ? "border-primary/50 ring-1 ring-primary/20"
                  : "hover:border-muted-foreground/30"
              )}
            >
              {/* Card header */}
              <div className="flex items-start justify-between p-3 pb-2">
                <button
                  onClick={() => !project.isFocused && focusProject(project.id)}
                  className="flex items-center gap-2 min-w-0 text-left"
                >
                  {project.isFocused ? (
                    <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500 shrink-0" />
                  ) : (
                    <FolderOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  )}
                  <span className="text-sm font-medium truncate">
                    {project.name}
                  </span>
                  {typeLabel && (
                    <span className="text-[10px] font-mono bg-muted px-1 py-0.5 rounded shrink-0">
                      {typeLabel}
                    </span>
                  )}
                </button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => closeProject(project.id)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>

              {/* Path + git */}
              <div className="px-3 pb-2 space-y-1">
                <p className="text-[11px] text-muted-foreground font-mono truncate">
                  {truncatePath(project.path)}
                </p>
                {project.isGitRepo && project.gitBranch && (
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <GitBranch className="h-3 w-3" />
                    <span>{project.gitBranch}</span>
                    {project.gitLastCommit && (
                      <span className="opacity-60">
                        ({project.gitLastCommit.slice(0, 7)})
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Stats + indexing status */}
              <div className="flex items-center gap-3 px-3 pb-2 text-[11px] text-muted-foreground">
                {codebase && (
                  <>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5",
                        isReady
                          ? "bg-emerald-500/10 text-emerald-600"
                          : isIndexing
                            ? "bg-amber-500/10 text-amber-600"
                            : "bg-muted"
                      )}
                    >
                      {isIndexing && (
                        <Loader2 className="h-2.5 w-2.5 animate-spin" />
                      )}
                      {codebase.status}
                    </span>
                    {codebase.fileCount ? (
                      <span className="flex items-center gap-0.5">
                        <FileCode className="h-3 w-3" />
                        {codebase.fileCount} files
                      </span>
                    ) : null}
                    {codebase.chunkCount ? (
                      <span>{codebase.chunkCount} chunks</span>
                    ) : null}
                  </>
                )}
                {!codebase && (
                  <span className="text-muted-foreground/60">not indexed</span>
                )}
              </div>

              {/* Quick search */}
              {codebase && isReady && (
                <div className="border-t px-3 py-2">
                  <div className="flex gap-1">
                    <Input
                      value={searchQuery[codebase.id] || ""}
                      onChange={(e) =>
                        setSearchQuery((s) => ({
                          ...s,
                          [codebase.id]: e.target.value,
                        }))
                      }
                      onKeyDown={(e) =>
                        e.key === "Enter" && handleSearch(codebase.id)
                      }
                      placeholder="Search codebase..."
                      className="h-6 text-[11px] flex-1"
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 shrink-0"
                      disabled={
                        !searchQuery[codebase.id]?.trim() ||
                        searching[codebase.id]
                      }
                      onClick={() => handleSearch(codebase.id)}
                    >
                      {searching[codebase.id] ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Search className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                  {searchResults[codebase.id]?.length ? (
                    <div className="mt-1.5 space-y-1 max-h-32 overflow-y-auto">
                      {searchResults[codebase.id].map((r, i) => (
                        <div
                          key={i}
                          className="text-[10px] font-mono bg-muted/50 rounded px-1.5 py-1 truncate"
                        >
                          <span className="text-primary">{r.name || r.file}</span>
                          <span className="text-muted-foreground ml-1">
                            {r.file}:{r.lines}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}

              {/* Focus hint */}
              {!project.isFocused && (
                <div className="border-t px-3 py-1.5 text-center">
                  <button
                    onClick={() => focusProject(project.id)}
                    className="text-[11px] text-muted-foreground hover:text-primary transition-colors"
                  >
                    Click to focus
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
