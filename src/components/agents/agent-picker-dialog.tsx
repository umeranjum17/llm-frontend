"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getAllAgents, getChatById, updateChat } from "@/lib/db/queries";
import type { Agent } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

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
  const agents = useLiveQuery(() => getAllAgents(), []);

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

          <div className="flex justify-end">
            <Button variant="outline" onClick={() => selectAgent(null)}>
              Use Default
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filtered.map((agent) => (
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
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-lg leading-none">{agent.avatar || "🤖"}</span>
                      <div className="font-medium truncate">{agent.name}</div>
                    </div>
                    {agent.description ? (
                      <div className="mt-1 text-xs text-muted-foreground line-clamp-2">
                        {agent.description}
                      </div>
                    ) : null}
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    {agent.isBuiltIn ? <Badge variant="secondary">Built-in</Badge> : null}
                    {agent.enabledTools?.length ? (
                      <Badge variant="outline">{agent.enabledTools.length} tools</Badge>
                    ) : null}
                  </div>
                </div>
              </button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-6">
              No agents found.
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

