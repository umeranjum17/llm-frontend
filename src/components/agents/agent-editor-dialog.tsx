"use client";

import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MODELS } from "@/lib/constants/models";
import { useModelsStore } from "@/stores/models-store";
import type { Agent } from "@/lib/db/schema";
import { addAgent, updateAgent } from "@/lib/db/queries";
import { toast } from "sonner";

const AVAILABLE_TOOLS = [
  { id: "web-search", label: "Web Search" },
];

interface AgentEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent?: Agent | null;
  onSaved?: (agentId: string) => void;
}

export function AgentEditorDialog({ open, onOpenChange, agent, onSaved }: AgentEditorDialogProps) {
  const isEditing = !!agent;
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [avatar, setAvatar] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [modelId, setModelId] = useState<string>("__default__");
  const [enabledTools, setEnabledTools] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const { models, loadModels } = useModelsStore();

  useEffect(() => {
    if (!open) return;
    loadModels().catch(() => {});
    setName(agent?.name || "");
    setDescription(agent?.description || "");
    setAvatar(agent?.avatar || "");
    setSystemPrompt(agent?.systemPrompt || "");
    setModelId(agent?.modelId || "__default__");
    setEnabledTools(agent?.enabledTools || []);
    setIsActive(agent?.isActive ?? true);
  }, [open, agent, loadModels]);

  const modelOptions = useMemo(() => (models.length > 0 ? models : MODELS), [models]);

  const toggleTool = (toolId: string) => {
    setEnabledTools((prev) =>
      prev.includes(toolId) ? prev.filter((t) => t !== toolId) : [...prev, toolId]
    );
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!systemPrompt.trim()) {
      toast.error("System prompt is required");
      return;
    }

    setSaving(true);
    try {
      if (agent) {
        if (agent.isBuiltIn) {
          toast.error("Built-in agents cannot be edited");
          return;
        }
        await updateAgent(agent.id, {
          name: name.trim(),
          description: description.trim() || undefined,
          avatar: avatar.trim() || undefined,
          systemPrompt,
          modelId: modelId === "__default__" ? undefined : modelId,
          enabledTools,
          isActive,
        });
        toast.success("Agent updated");
        onSaved?.(agent.id);
      } else {
        const created = await addAgent({
          name: name.trim(),
          description: description.trim() || undefined,
          avatar: avatar.trim() || undefined,
          systemPrompt,
          modelId: modelId === "__default__" ? undefined : modelId,
          enabledTools,
          knowledgeBaseIds: [],
          parameters: undefined,
          isBuiltIn: false,
          isActive,
        });
        toast.success("Agent created");
        onSaved?.(created.id);
      }
      onOpenChange(false);
    } catch (e) {
      toast.error("Failed to save agent");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Agent" : "New Agent"}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Agent name" />
          </div>
          <div className="space-y-2">
            <Label>Avatar (emoji)</Label>
            <Input value={avatar} onChange={(e) => setAvatar(e.target.value)} placeholder="🤖" />
          </div>

          <div className="sm:col-span-2 space-y-2">
            <Label>Description</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this agent do?"
            />
          </div>

          <div className="sm:col-span-2 space-y-2">
            <Label>System Prompt</Label>
            <Textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="min-h-[140px]"
              placeholder="Define the agent behavior..."
            />
          </div>

          <div className="space-y-2">
            <Label>Model</Label>
            <Select value={modelId} onValueChange={setModelId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__default__">Use chat model</SelectItem>
                {modelOptions.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Tools</Label>
            <div className="space-y-2 rounded-lg border p-3">
              {AVAILABLE_TOOLS.map((tool) => (
                <label key={tool.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={enabledTools.includes(tool.id)}
                    onChange={() => toggleTool(tool.id)}
                  />
                  <span>{tool.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Status</Label>
            <div className="space-y-2 rounded-lg border p-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={isActive}
                  onChange={() => setIsActive((v) => !v)}
                />
                <span>Enabled</span>
              </label>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
