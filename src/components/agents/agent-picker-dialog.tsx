"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, RefreshCw, Pencil } from "lucide-react";
import { getAllAgents, getChatById, updateChat } from "@/lib/db/queries";
import type { Agent } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import { getModelById } from "@/lib/constants/models";
import { AgentEditorDialog } from "./agent-editor-dialog";
import { ensureBuiltInAgents } from "@/lib/db/seed";
import { formatModelCost } from "@/components/model-picker/model-item";
import { toast } from "sonner";

interface AgentPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  chatId: string;
  currentAgentId?: string;
}

function matches(agent: Agent, query: string) {
  const q = query.toLowerCase();
  return (
    agent.name.toLowerCase().includes(q) ||
    (agent.description || "").toLowerCase().includes(q)
  );
}

export function AgentPickerDialog({
  open,
  onOpenChange,
  chatId,
  currentAgentId,
}: AgentPickerDialogProps) {
  const [query, setQuery] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
  const [syncing, setSyncing] = useState(false);
  const agents = useLiveQuery(() => getAllAgents(), []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await ensureBuiltInAgents();
      toast.success("Agents synced");
    } catch {
      toast.error("Failed to sync agents");
    } finally {
      setSyncing(false);
    }
  };

  const filtered = useMemo(() => {
    const list = agents || [];
    const q = query.trim();
    if (!q) return list.filter((a) => a.isActive);
    return list.filter((a) => a.isActive && matches(a, q));
  }, [agents, query]);

  const selectAgent = async (agent: Agent | null) => {
    const chat = await getChatById(chatId);
    if (!chat) return;

    if (!agent) {
      await updateChat(chatId, { agentId: undefined });
      onOpenChange(false);
      return;
    }

    await updateChat(chatId, {
      agentId: agent.id,
      modelId: agent.modelId || chat.modelId,
      enabledTools: agent.enabledTools || chat.enabledTools || [],
      activeMcpServerIds: agent.mcpServerIds || [],
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col p-4 sm:p-6">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-base sm:text-lg">Choose an Agent</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 flex-1 overflow-hidden flex flex-col">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search agents..."
            className="h-9 sm:h-10"
          />

          <div className="flex justify-between gap-2">
            <div className="flex gap-1.5 sm:gap-2">
              <Button variant="outline" size="sm" className="h-8 text-xs sm:text-sm" onClick={() => { setEditingAgent(null); setEditorOpen(true); }}>
                <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5" />
                <span className="hidden sm:inline">New Agent</span>
                <span className="sm:hidden">New</span>
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleSync} disabled={syncing} title="Sync built-in agents">
                <RefreshCw className={cn("h-3.5 w-3.5 sm:h-4 sm:w-4", syncing && "animate-spin")} />
              </Button>
            </div>
            <Button variant="outline" size="sm" className="h-8 text-xs sm:text-sm" onClick={() => selectAgent(null)}>
              <span className="hidden sm:inline">Use Default</span>
              <span className="sm:hidden">Default</span>
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto -mx-1 px-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
              {filtered.map((agent) => {
                const model = agent.modelId ? getModelById(agent.modelId) : null;
                const costDisplay = model ? formatModelCost(model.inputCost, model.outputCost) : null;
                const isFree = model && model.inputCost + model.outputCost === 0;
                return (
                  <div
                    key={agent.id}
                    className={cn(
                      "relative group text-left rounded-lg border p-2.5 sm:p-3 hover:bg-accent transition-colors cursor-pointer",
                      agent.id === currentAgentId && "border-primary"
                    )}
                    onClick={() => selectAgent(agent)}
                  >
                    {/* Edit button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingAgent(agent);
                        setEditorOpen(true);
                      }}
                      className="absolute top-2 right-2 p-1.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-background/80 transition-opacity"
                      title="Edit agent"
                    >
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>

                    <div className="flex items-start gap-2">
                      <span className="text-base sm:text-lg leading-none shrink-0">{agent.avatar || "🤖"}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1.5">
                          <div className="font-medium text-sm truncate">{agent.name}</div>
                          <div className="shrink-0 flex items-center gap-1 mr-5">
                            {agent.isBuiltIn && <Badge variant="secondary" className="text-[9px] sm:text-[10px] px-1.5 h-4">Built-in</Badge>}
                            {agent.mcpServerIds?.length ? (
                              <Badge variant="outline" className="text-[9px] sm:text-[10px] px-1.5 h-4">{agent.mcpServerIds.length} tools</Badge>
                            ) : null}
                          </div>
                        </div>
                        {agent.description && (
                          <div className="mt-0.5 text-[11px] sm:text-xs text-muted-foreground line-clamp-2">
                            {agent.description}
                          </div>
                        )}
                        {agent.executionType === "pipeline" && agent.pipeline?.steps?.length ? (
                          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                            <Badge variant="outline" className="text-[9px] sm:text-[10px] px-1.5 py-0 h-4 font-normal bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400">
                              Pipeline ({agent.pipeline.steps.length} steps)
                            </Badge>
                          </div>
                        ) : model && (
                          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                            <Badge variant="outline" className="text-[9px] sm:text-[10px] px-1.5 py-0 h-4 font-normal">
                              {model.name}
                            </Badge>
                            {costDisplay && (
                              <span className={cn(
                                "text-[9px] sm:text-[10px]",
                                isFree ? "text-green-500" : "text-muted-foreground"
                              )}>
                                {costDisplay}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6">
              No agents found.
            </div>
          ) : null}
        </div>
      </DialogContent>

      <AgentEditorDialog
        open={editorOpen}
        onOpenChange={(open) => {
          setEditorOpen(open);
          if (!open) setEditingAgent(null);
        }}
        agent={editingAgent}
        onSaved={(agentId) => {
          // After creating/editing, select the agent
          getAllAgents().then((allAgents) => {
            const savedAgent = allAgents.find((a) => a.id === agentId);
            if (savedAgent && !editingAgent) selectAgent(savedAgent);
          });
        }}
      />
    </Dialog>
  );
}

