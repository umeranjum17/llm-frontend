"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Trash2, Pencil, Plus, Server, Wrench } from "lucide-react";
import { getAllAgents, deleteAgent, updateAgent } from "@/lib/db/queries";
import type { Agent } from "@/lib/db/schema";
import { AgentEditorDialog } from "@/components/agents/agent-editor-dialog";
import { toast } from "sonner";
import { getModelById } from "@/lib/constants/models";
import { BUILTIN_AGENTS } from "@/lib/constants/agents";

export function AgentsSettings() {
  const [query, setQuery] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);

  const agents = useLiveQuery(() => getAllAgents(), []);

  const filtered = useMemo(() => {
    const list = agents || [];
    const builtInIds = new Set(BUILTIN_AGENTS.map(a => a.id));
    
    // Filter: only show built-ins that are in BUILTIN_AGENTS, plus all custom agents
    const visibleAgents = list.filter(a => !a.isBuiltIn || builtInIds.has(a.id));
    
    const q = query.trim().toLowerCase();
    if (!q) return visibleAgents;
    return visibleAgents.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.description || "").toLowerCase().includes(q)
    );
  }, [agents, query]);

  const handleDelete = async (agent: Agent) => {
    if (agent.isBuiltIn) {
      toast.error("Built-in agents cannot be deleted");
      return;
    }
    if (!confirm(`Delete agent "${agent.name}"?`)) return;
    await deleteAgent(agent.id);
    toast.success("Agent deleted");
  };

  const toggleActive = async (agent: Agent) => {
    await updateAgent(agent.id, { isActive: !agent.isActive });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-medium">Agents</h3>
          <p className="text-sm text-muted-foreground">
            Create reusable agent personas with system prompts and tool defaults.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingAgent(null);
            setEditorOpen(true);
          }}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          New Agent
        </Button>
      </div>

      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search agents..."
      />

      <div className="space-y-2">
        {filtered?.map((agent) => (
          <div
            key={agent.id}
            className="flex items-center justify-between gap-4 rounded-lg border p-3"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-lg leading-none">{agent.avatar || "🤖"}</span>
                <div className="font-medium truncate">{agent.name}</div>
                {agent.isBuiltIn ? <Badge variant="secondary">Built-in</Badge> : null}
                {!agent.isActive ? <Badge variant="outline">Disabled</Badge> : null}
              </div>
              {agent.description ? (
                <div className="mt-1 text-xs text-muted-foreground line-clamp-1">
                  {agent.description}
                </div>
              ) : null}
              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                <span>
                  {agent.modelId ? getModelById(agent.modelId)?.name || agent.modelId.split("/").pop() : "Default model"}
                </span>
                {(agent.enabledTools?.length > 0 || (agent.mcpServerIds?.length ?? 0) > 0) && (
                  <div className="flex items-center gap-1">
                    <Wrench className="h-3 w-3" />
                    <span>{agent.enabledTools?.length || 0} tools</span>
                  </div>
                )}
                {(agent.mcpServerIds?.length ?? 0) > 0 && (
                  <div className="flex items-center gap-1">
                    <Server className="h-3 w-3" />
                    <span>{agent.mcpServerIds?.length} MCP</span>
                  </div>
                )}
              </div>
            </div>

            <div className="shrink-0 flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => toggleActive(agent)}
              >
                {agent.isActive ? "Disable" : "Enable"}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setEditingAgent(agent);
                  setEditorOpen(true);
                }}
                title={agent.isBuiltIn ? "Configure agent" : "Edit agent"}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleDelete(agent)}
                disabled={agent.isBuiltIn}
                title={agent.isBuiltIn ? "Built-in agents cannot be deleted" : "Delete agent"}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
        {filtered && filtered.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8">
            No agents found.
          </div>
        ) : null}
      </div>

      <AgentEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        agent={editingAgent}
      />
    </div>
  );
}

