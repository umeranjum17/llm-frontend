"use client";

import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MODELS } from "@/lib/constants/models";
import { useModelsStore } from "@/stores/models-store";
import type { Agent, McpServer } from "@/lib/db/schema";
import { addAgent, updateAgent, getAllMcpServers, getMcpServerById } from "@/lib/db/queries";
import { toast } from "sonner";
import { Eye, Brain, Wrench, Sparkles, Server, Loader2, AlertCircle } from "lucide-react";
import { getModelCapabilities } from "@/lib/constants/model-capabilities";
import { formatModelCost } from "@/components/model-picker/model-item";
import { McpManager } from "@/lib/mcp/mcp-manager";

interface AgentEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent?: Agent | null;
  onSaved?: (agentId: string) => void;
}

interface McpTool {
  fullName: string;
  serverName: string;
  toolName: string;
  description: string;
  serverId: string;
}

export function AgentEditorDialog({ open, onOpenChange, agent, onSaved }: AgentEditorDialogProps) {
  const isEditing = !!agent;
  const isBuiltIn = agent?.isBuiltIn ?? false;

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [avatar, setAvatar] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [modelId, setModelId] = useState<string>("__default__");
  const [enabledTools, setEnabledTools] = useState<string[]>([]);
  const [mcpServerIds, setMcpServerIds] = useState<string[]>([]);
  const [disabledMcpTools, setDisabledMcpTools] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  // MCP state
  const [loadingTools, setLoadingTools] = useState(false);
  const [mcpTools, setMcpTools] = useState<McpTool[]>([]);
  const [toolsError, setToolsError] = useState<string | null>(null);

  const { models, loadModels } = useModelsStore();

  // Load all MCP servers (show all, not just enabled ones)
  const allMcpServers = useLiveQuery(() => getAllMcpServers(), []) || [];

  // Initialize form when dialog opens
  useEffect(() => {
    if (!open) return;
    loadModels().catch(() => {});
    setName(agent?.name || "");
    setDescription(agent?.description || "");
    setAvatar(agent?.avatar || "");
    setSystemPrompt(agent?.systemPrompt || "");
    setModelId(agent?.modelId || "__default__");
    setEnabledTools(agent?.enabledTools || []);
    setMcpServerIds(agent?.mcpServerIds || []);
    setDisabledMcpTools(agent?.mcpToolPolicy?.disabledTools || []);
    setIsActive(agent?.isActive ?? true);
    setMcpTools([]);
    setToolsError(null);
  }, [open, agent, loadModels]);

  // Load MCP tools when servers are selected
  useEffect(() => {
    if (mcpServerIds.length === 0) {
      setMcpTools([]);
      return;
    }

    const loadMcpTools = async () => {
      setLoadingTools(true);
      setToolsError(null);
      try {
        const selectedServers = (allMcpServers || []).filter((s) =>
          mcpServerIds.includes(s.id)
        );

        if (selectedServers.length === 0) {
          setMcpTools([]);
          return;
        }

        const manager = McpManager.getInstance();
        const { tools, metadata } = await manager.getTools(selectedServers);

        // Map tools with server info
        const toolsList: McpTool[] = metadata.map((m) => {
          const server = selectedServers.find((s) => s.name === m.serverName);
          return {
            fullName: m.fullName,
            serverName: m.serverName,
            toolName: m.toolName,
            description: m.description || "No description",
            serverId: server?.id || "",
          };
        });

        setMcpTools(toolsList);
      } catch (err) {
        console.error("Failed to load MCP tools:", err);
        setToolsError(err instanceof Error ? err.message : "Failed to load tools");
        setMcpTools([]);
      } finally {
        setLoadingTools(false);
      }
    };

    loadMcpTools();
  }, [mcpServerIds, allMcpServers]);

  const modelOptions = useMemo(() => (models.length > 0 ? models : MODELS), [models]);
  const selectedModel = modelOptions.find((m) => m.id === modelId);

  const toggleMcpServer = (serverId: string) => {
    setMcpServerIds((prev) =>
      prev.includes(serverId) ? prev.filter((id) => id !== serverId) : [...prev, serverId]
    );
  };

  const toggleMcpTool = (toolName: string) => {
    setDisabledMcpTools((prev) =>
      prev.includes(toolName) ? prev.filter((t) => t !== toolName) : [...prev, toolName]
    );
  };

  const handleSave = async () => {
    // Built-in agents can only have model, MCP servers, and tool policy updated
    if (!isBuiltIn) {
      if (!name.trim()) {
        toast.error("Name is required");
        return;
      }
      if (!systemPrompt.trim()) {
        toast.error("System prompt is required");
        return;
      }
    }

    setSaving(true);
    try {
      if (agent) {
        // For built-in agents, only update specific fields
        if (isBuiltIn) {
          await updateAgent(agent.id, {
            modelId: modelId === "__default__" ? undefined : modelId,
            mcpServerIds,
            mcpToolPolicy: disabledMcpTools.length > 0 ? { disabledTools: disabledMcpTools } : undefined,
            enabledTools,
            isActive,
          });
          toast.success("Agent settings updated");
        } else {
          await updateAgent(agent.id, {
            name: name.trim(),
            description: description.trim() || undefined,
            avatar: avatar.trim() || undefined,
            systemPrompt,
            modelId: modelId === "__default__" ? undefined : modelId,
            enabledTools,
            mcpServerIds,
            mcpToolPolicy: disabledMcpTools.length > 0 ? { disabledTools: disabledMcpTools } : undefined,
            isActive,
          });
          toast.success("Agent updated");
        }
        onSaved?.(agent.id);
      } else {
        const created = await addAgent({
          name: name.trim(),
          description: description.trim() || undefined,
          avatar: avatar.trim() || undefined,
          systemPrompt,
          modelId: modelId === "__default__" ? undefined : modelId,
          enabledTools,
          mcpServerIds,
          mcpToolPolicy: disabledMcpTools.length > 0 ? { disabledTools: disabledMcpTools } : undefined,
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
      console.error("Failed to save agent:", e);
      toast.error("Failed to save agent");
    } finally {
      setSaving(false);
    }
  };

  const enabledMcpToolsCount = mcpTools.filter((t) => !disabledMcpTools.includes(t.fullName)).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? (isBuiltIn ? "Configure Agent" : "Edit Agent") : "New Agent"}
          </DialogTitle>
          {isBuiltIn && (
            <DialogDescription>
              Configure model, tools, and MCP servers for this built-in agent
            </DialogDescription>
          )}
        </DialogHeader>

        <Tabs defaultValue="general" className="flex-1 min-h-0">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="model">Model</TabsTrigger>
            <TabsTrigger value="tools">
              Tools
              {mcpServerIds.length > 0 && (
                <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs">
                  {enabledMcpToolsCount}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 mt-4 pr-4" style={{ maxHeight: "calc(90vh - 220px)" }}>
            {/* General Tab */}
            <TabsContent value="general" className="space-y-4 mt-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Agent name"
                    disabled={isBuiltIn}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Avatar (emoji)</Label>
                  <Input
                    value={avatar}
                    onChange={(e) => setAvatar(e.target.value)}
                    placeholder="🤖"
                    disabled={isBuiltIn}
                  />
                </div>

                <div className="sm:col-span-2 space-y-2">
                  <Label>Description</Label>
                  <Input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What does this agent do?"
                    disabled={isBuiltIn}
                  />
                </div>

                <div className="sm:col-span-2 space-y-2">
                  <Label>System Prompt</Label>
                  <Textarea
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    className="min-h-[140px]"
                    placeholder="Define the agent behavior..."
                    disabled={isBuiltIn}
                  />
                  {isBuiltIn && (
                    <p className="text-xs text-muted-foreground">
                      System prompt cannot be modified for built-in agents
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Status</Label>
                  <div className="flex items-center gap-2 p-3 rounded-lg border">
                    <Checkbox
                      id="agent-active"
                      checked={isActive}
                      onCheckedChange={(checked) => setIsActive(checked === true)}
                    />
                    <label htmlFor="agent-active" className="text-sm cursor-pointer">
                      Enabled
                    </label>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Model Tab */}
            <TabsContent value="model" className="space-y-4 mt-0">
              <div className="space-y-2">
                <Label>Model</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Select a specific model for this agent or use the chat's default model
                </p>
                <Select value={modelId} onValueChange={setModelId}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Select a model">
                      {modelId === "__default__" ? (
                        <span className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-muted-foreground" />
                          Use chat model
                        </span>
                      ) : selectedModel ? (
                        <div className="flex items-center gap-2">
                          <span className="truncate">{selectedModel.name}</span>
                          {(() => {
                            const caps = getModelCapabilities(selectedModel.id);
                            return (
                              <div className="flex items-center gap-0.5">
                                {caps.supportsVision && <Eye className="h-3 w-3 text-sky-500" />}
                                {caps.supportsReasoning && <Brain className="h-3 w-3 text-purple-500" />}
                                {caps.supportsTools && <Wrench className="h-3 w-3 text-amber-500" />}
                              </div>
                            );
                          })()}
                        </div>
                      ) : null}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    <SelectItem value="__default__">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-muted-foreground" />
                        <span>Use chat model</span>
                      </div>
                    </SelectItem>
                    {modelOptions.slice(0, 50).map((m) => {
                      const capabilities = getModelCapabilities(m.id);
                      const costDisplay = formatModelCost(m.inputCost, m.outputCost);
                      const isFree = costDisplay === "Free";
                      return (
                        <SelectItem key={m.id} value={m.id}>
                          <div className="flex items-center gap-2 w-full">
                            <span className="truncate">{m.name}</span>
                            <div className="flex items-center gap-0.5 shrink-0">
                              {capabilities.supportsVision && <Eye className="h-3 w-3 text-sky-500" />}
                              {capabilities.supportsReasoning && <Brain className="h-3 w-3 text-purple-500" />}
                              {capabilities.supportsTools && <Wrench className="h-3 w-3 text-amber-500" />}
                            </div>
                            <span className={isFree ? "text-green-500 text-xs" : "text-muted-foreground text-xs"}>
                              {costDisplay}
                            </span>
                            <span className="text-muted-foreground/70 text-xs">{m.provider}</span>
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>

            {/* Tools Tab */}
            <TabsContent value="tools" className="space-y-6 mt-0">
              {/* MCP Servers */}
              <div className="space-y-3">
                <div>
                  <Label className="text-base">MCP Servers</Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Connect external tool servers to extend agent capabilities
                  </p>
                </div>

                {allMcpServers.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-6 text-center">
                    <Server className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                    <p className="text-sm text-muted-foreground">No MCP servers configured</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Add MCP servers in Settings → Plugins
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 rounded-lg border p-3">
                    {allMcpServers.map((server) => (
                      <div key={server.id} className="flex items-center gap-3">
                        <Checkbox
                          id={`mcp-${server.id}`}
                          checked={mcpServerIds.includes(server.id)}
                          onCheckedChange={() => toggleMcpServer(server.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <label
                            htmlFor={`mcp-${server.id}`}
                            className="text-sm font-medium cursor-pointer truncate block"
                          >
                            {server.name}
                          </label>
                          {server.description && (
                            <p className="text-xs text-muted-foreground truncate">
                              {server.description}
                            </p>
                          )}
                        </div>
                        <Server className="h-4 w-4 text-muted-foreground shrink-0" />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* MCP Tools from Selected Servers */}
              {mcpServerIds.length > 0 && (
                <div className="space-y-3">
                  <div>
                    <Label className="text-base">MCP Tools</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Tools from selected MCP servers. Uncheck to disable specific tools.
                    </p>
                  </div>

                  {loadingTools ? (
                    <div className="rounded-lg border p-6 text-center">
                      <Loader2 className="h-6 w-6 mx-auto animate-spin text-muted-foreground" />
                      <p className="text-sm text-muted-foreground mt-2">Loading tools...</p>
                    </div>
                  ) : toolsError ? (
                    <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
                      <div className="flex items-center gap-2 text-destructive">
                        <AlertCircle className="h-4 w-4" />
                        <span className="text-sm font-medium">Failed to load tools</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{toolsError}</p>
                    </div>
                  ) : mcpTools.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-4 text-center">
                      <p className="text-sm text-muted-foreground">No tools available from selected servers</p>
                    </div>
                  ) : (
                    <div className="space-y-2 rounded-lg border p-3 max-h-[250px] overflow-y-auto">
                      {mcpTools.map((tool) => {
                        const isEnabled = !disabledMcpTools.includes(tool.fullName);
                        return (
                          <div key={tool.fullName} className="flex items-start gap-3 py-1">
                            <Checkbox
                              id={`mcp-tool-${tool.fullName}`}
                              checked={isEnabled}
                              onCheckedChange={() => toggleMcpTool(tool.fullName)}
                              className="mt-0.5"
                            />
                            <div className="flex-1 min-w-0">
                              <label
                                htmlFor={`mcp-tool-${tool.fullName}`}
                                className="text-sm font-medium cursor-pointer block"
                              >
                                {tool.toolName}
                              </label>
                              <p className="text-xs text-muted-foreground line-clamp-2">
                                {tool.description}
                              </p>
                              <Badge variant="outline" className="mt-1 text-[10px] h-4">
                                {tool.serverName}
                              </Badge>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {mcpTools.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {enabledMcpToolsCount} of {mcpTools.length} tools enabled
                    </p>
                  )}
                </div>
              )}
            </TabsContent>
          </ScrollArea>
        </Tabs>

        <div className="flex justify-end gap-2 pt-4 border-t mt-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
