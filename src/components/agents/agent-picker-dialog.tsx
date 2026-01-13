"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, RefreshCw } from "lucide-react";
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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Choose an Agent</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search agents..."
          />

          <div className="flex justify-between">
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditorOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                New Agent
              </Button>
              <Button variant="ghost" size="icon" onClick={handleSync} disabled={syncing} title="Sync built-in agents">
                <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
              </Button>
            </div>
            <Button variant="outline" onClick={() => selectAgent(null)}>
              Use Default
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filtered.map((agent) => {
              const model = agent.modelId ? getModelById(agent.modelId) : null;
              const costDisplay = model ? formatModelCost(model.inputCost, model.outputCost) : null;
              const isFree = model && model.inputCost + model.outputCost === 0;
              return (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => selectAgent(agent)}
                  className={cn(
                    "text-left rounded-lg border p-3 hover:bg-accent transition-colors",
                    agent.id === currentAgentId && "border-primary"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-lg leading-none">{agent.avatar || "🤖"}</span>
                        <div className="font-medium truncate">{agent.name}</div>
                      </div>
                      {agent.description ? (
                        <div className="mt-1 text-xs text-muted-foreground line-clamp-2">
                          {agent.description}
                        </div>
                      ) : null}
                      {model && (
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-normal">
                            {model.name}
                          </Badge>
                          {costDisplay && (
                            <span className={cn(
                              "text-[10px]",
                              isFree ? "text-green-500" : "text-muted-foreground"
                            )}>
                              {costDisplay}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      {agent.isBuiltIn ? <Badge variant="secondary" className="text-[10px]">Built-in</Badge> : null}
                      {agent.mcpServerIds?.length ? (
                        <Badge variant="outline" className="text-[10px]">{agent.mcpServerIds.length} tools</Badge>
                      ) : null}
                    </div>
                  </div>
                </button>
              );
            })}
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
        onOpenChange={setEditorOpen}
        onSaved={(agentId) => {
          // After creating, select the new agent
          getAllAgents().then((allAgents) => {
            const newAgent = allAgents.find((a) => a.id === agentId);
            if (newAgent) selectAgent(newAgent);
          });
        }}
      />
    </Dialog>
  );
}

