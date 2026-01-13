"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MODELS } from "@/lib/constants/models";
import { useModelsStore } from "@/stores/models-store";
import type { Agent, McpServer, PipelineStep } from "@/lib/db/schema";
import { PROVIDERS } from "@/lib/providers/registry";
import { addAgent, updateAgent, getAllMcpServers, getMcpServerById } from "@/lib/db/queries";
import { toast } from "sonner";
import { Eye, Brain, Wrench, Sparkles, Server, Loader2, AlertCircle, Image, Search, Check, Plus, Trash2, GripVertical, MessageSquare, ImageIcon, Bot, Settings2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getModelCapabilities, isImageGenerationModel } from "@/lib/constants/model-capabilities";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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

  // Pipeline state
  const [executionType, setExecutionType] = useState<"simple" | "pipeline" | "orchestrator">("simple");
  const [pipelineSteps, setPipelineSteps] = useState<PipelineStep[]>([]);

  // MCP state
  const [loadingTools, setLoadingTools] = useState(false);
  const [mcpTools, setMcpTools] = useState<McpTool[]>([]);
  const [toolsError, setToolsError] = useState<string | null>(null);

  // Model picker state
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const [modelCategory, setModelCategory] = useState<"all" | "chat" | "image" | "vision">("all");

  // Pipeline step model picker state
  const [stepModelPickerOpen, setStepModelPickerOpen] = useState<number | null>(null);
  const [stepModelSearch, setStepModelSearch] = useState("");

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
    // Pipeline state
    setExecutionType(agent?.executionType || "simple");
    setPipelineSteps(agent?.pipeline?.steps || []);
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

  // Filter models by category and search
  const filteredModels = useMemo(() => {
    let filtered = modelOptions;

    // Filter by category
    if (modelCategory === "image") {
      filtered = filtered.filter((m) => isImageGenerationModel(m.id));
    } else if (modelCategory === "vision") {
      filtered = filtered.filter((m) => {
        const caps = getModelCapabilities(m.id);
        return caps.supportsVision && !isImageGenerationModel(m.id);
      });
    } else if (modelCategory === "chat") {
      filtered = filtered.filter((m) => !isImageGenerationModel(m.id));
    }

    // Filter by search
    if (modelSearch.trim()) {
      const q = modelSearch.toLowerCase();
      filtered = filtered.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.id.toLowerCase().includes(q) ||
          m.provider.toLowerCase().includes(q)
      );
    }

    return filtered.slice(0, 100);
  }, [modelOptions, modelCategory, modelSearch]);

  // Filter models for pipeline steps (based on step type and search)
  const getFilteredModelsForStep = useCallback((stepType: "llm" | "image" | "tool" | "subagent") => {
    let filtered = modelOptions;

    // Filter by step type
    if (stepType === "image") {
      filtered = filtered.filter((m) => isImageGenerationModel(m.id));
    } else if (stepType === "llm") {
      filtered = filtered.filter((m) => !isImageGenerationModel(m.id));
    }

    // Filter by search
    if (stepModelSearch.trim()) {
      const q = stepModelSearch.toLowerCase();
      filtered = filtered.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.id.toLowerCase().includes(q) ||
          m.provider.toLowerCase().includes(q)
      );
    }

    return filtered.slice(0, 50);
  }, [modelOptions, stepModelSearch]);

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
      if (!systemPrompt.trim() && executionType === "simple") {
        toast.error("System prompt is required");
        return;
      }
      if (executionType === "pipeline" && pipelineSteps.length === 0) {
        toast.error("Pipeline requires at least one step");
        return;
      }
    }

    setSaving(true);
    try {
      // Build pipeline config if applicable
      const pipelineConfig = executionType === "pipeline" && pipelineSteps.length > 0
        ? { steps: pipelineSteps }
        : undefined;

      if (agent) {
        // For built-in agents, only update specific fields
        if (isBuiltIn) {
          await updateAgent(agent.id, {
            modelId: modelId === "__default__" ? undefined : modelId,
            mcpServerIds,
            mcpToolPolicy: disabledMcpTools.length > 0 ? { disabledTools: disabledMcpTools } : undefined,
            enabledTools,
            isActive,
            executionType,
            pipeline: pipelineConfig,
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
            executionType,
            pipeline: pipelineConfig,
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
          executionType,
          pipeline: pipelineConfig,
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
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="model">Model</TabsTrigger>
            <TabsTrigger value="pipeline">
              Pipeline
              {executionType === "pipeline" && pipelineSteps.length > 0 && (
                <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs">
                  {pipelineSteps.length}
                </Badge>
              )}
            </TabsTrigger>
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
              {/* Show different content for pipeline agents */}
              {executionType === "pipeline" ? (
                <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-6 text-center">
                  <Settings2 className="h-10 w-10 mx-auto text-blue-500/70 mb-3" />
                  <h3 className="font-medium mb-2">Pipeline Agent</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Pipeline agents configure models for each step individually.
                    <br />
                    Go to the <strong>Pipeline</strong> tab to configure step models.
                  </p>
                  <div className="text-xs text-muted-foreground">
                    {pipelineSteps.length > 0 && (
                      <div className="flex flex-col gap-1">
                        <span className="font-medium">Current pipeline models:</span>
                        {pipelineSteps.map((step, i) => {
                          const stepModelId = step.type === "image" ? step.imageModelId : step.modelId;
                          const model = modelOptions.find((m) => m.id === stepModelId);
                          return (
                            <span key={step.id} className="text-muted-foreground">
                              Step {i + 1}: {model?.name || stepModelId || "Not set"}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
              <div className="space-y-3">
                <div>
                  <Label>Model</Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Select a specific model for this agent or use the chat&apos;s default model
                  </p>
                </div>

                {/* Category filters */}
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { key: "all", label: "All Models" },
                    { key: "chat", label: "Chat" },
                    { key: "image", label: "Image Gen", icon: Image },
                    { key: "vision", label: "Vision", icon: Eye },
                  ].map(({ key, label, icon: Icon }) => (
                    <Button
                      key={key}
                      variant={modelCategory === key ? "default" : "outline"}
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setModelCategory(key as typeof modelCategory)}
                    >
                      {Icon && <Icon className="h-3 w-3 mr-1" />}
                      {label}
                    </Button>
                  ))}
                </div>

                {/* Model combobox */}
                <Popover open={modelPickerOpen} onOpenChange={setModelPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={modelPickerOpen}
                      className="w-full justify-between h-10"
                    >
                      {modelId === "__default__" ? (
                        <span className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-muted-foreground" />
                          Use chat model
                        </span>
                      ) : selectedModel ? (
                        <div className="flex items-center gap-2 min-w-0">
                          {isImageGenerationModel(selectedModel.id) && (
                            <Image className="h-4 w-4 text-pink-500 shrink-0" />
                          )}
                          <span className="truncate">{selectedModel.name}</span>
                          {(() => {
                            const caps = getModelCapabilities(selectedModel.id);
                            return (
                              <div className="flex items-center gap-0.5 shrink-0">
                                {caps.supportsVision && !isImageGenerationModel(selectedModel.id) && (
                                  <Eye className="h-3 w-3 text-sky-500" />
                                )}
                                {caps.supportsReasoning && <Brain className="h-3 w-3 text-purple-500" />}
                                {caps.supportsTools && <Wrench className="h-3 w-3 text-amber-500" />}
                              </div>
                            );
                          })()}
                          <span className="text-xs text-muted-foreground shrink-0">{selectedModel.provider}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Select a model...</span>
                      )}
                      <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] p-0" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder="Search models..."
                        value={modelSearch}
                        onValueChange={setModelSearch}
                      />
                      <CommandList className="max-h-[300px]">
                        <CommandEmpty>No models found.</CommandEmpty>
                        <CommandGroup>
                          {/* Default option */}
                          <CommandItem
                            value="__default__"
                            onSelect={() => {
                              setModelId("__default__");
                              setModelPickerOpen(false);
                            }}
                          >
                            <Check
                              className={`mr-2 h-4 w-4 ${modelId === "__default__" ? "opacity-100" : "opacity-0"}`}
                            />
                            <Sparkles className="h-4 w-4 mr-2 text-muted-foreground" />
                            <span>Use chat model</span>
                          </CommandItem>

                          {/* Model options */}
                          {filteredModels.map((m) => {
                            const capabilities = getModelCapabilities(m.id);
                            const isImageGen = isImageGenerationModel(m.id);
                            const costDisplay = formatModelCost(m.inputCost, m.outputCost);
                            const isFree = costDisplay === "Free";
                            return (
                              <CommandItem
                                key={m.id}
                                value={m.id}
                                onSelect={() => {
                                  setModelId(m.id);
                                  setModelPickerOpen(false);
                                }}
                              >
                                <Check
                                  className={`mr-2 h-4 w-4 shrink-0 ${modelId === m.id ? "opacity-100" : "opacity-0"}`}
                                />
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  {isImageGen && <Image className="h-4 w-4 text-pink-500 shrink-0" />}
                                  <span className="truncate">{m.name}</span>
                                  <div className="flex items-center gap-0.5 shrink-0">
                                    {capabilities.supportsVision && !isImageGen && (
                                      <Eye className="h-3 w-3 text-sky-500" />
                                    )}
                                    {capabilities.supportsReasoning && <Brain className="h-3 w-3 text-purple-500" />}
                                    {capabilities.supportsTools && <Wrench className="h-3 w-3 text-amber-500" />}
                                  </div>
                                  <span className={`text-xs shrink-0 ${isFree ? "text-green-500" : "text-muted-foreground"}`}>
                                    {costDisplay}
                                  </span>
                                  <span className="text-xs text-muted-foreground/70 shrink-0">{m.provider}</span>
                                </div>
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>

                {/* Legend */}
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground pt-2">
                  <span className="flex items-center gap-1">
                    <Image className="h-3 w-3 text-pink-500" /> Image Generation
                  </span>
                  <span className="flex items-center gap-1">
                    <Eye className="h-3 w-3 text-sky-500" /> Vision
                  </span>
                  <span className="flex items-center gap-1">
                    <Brain className="h-3 w-3 text-purple-500" /> Reasoning
                  </span>
                  <span className="flex items-center gap-1">
                    <Wrench className="h-3 w-3 text-amber-500" /> Tools
                  </span>
                </div>
              </div>
              )}
            </TabsContent>

            {/* Pipeline Tab */}
            <TabsContent value="pipeline" className="space-y-4 mt-0">
              <div className="space-y-3">
                <div>
                  <Label className="text-base">Execution Type</Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    How this agent processes requests
                  </p>
                </div>
                <Select
                  value={executionType}
                  onValueChange={(v) => setExecutionType(v as typeof executionType)}
                  disabled={isBuiltIn}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select execution type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="simple">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4" />
                        <span>Simple</span>
                        <span className="text-xs text-muted-foreground">- Single LLM call</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="pipeline">
                      <div className="flex items-center gap-2">
                        <Settings2 className="h-4 w-4" />
                        <span>Pipeline</span>
                        <span className="text-xs text-muted-foreground">- Multi-step workflow</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {executionType === "pipeline" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-base">Pipeline Steps</Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        Define the steps this agent will execute sequentially
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const newStep: PipelineStep = {
                          id: `step_${Date.now()}`,
                          name: `Step ${pipelineSteps.length + 1}`,
                          type: "llm",
                          inputTemplate: "{{userInput}}",
                          outputVariable: `step${pipelineSteps.length + 1}Output`,
                        };
                        setPipelineSteps([...pipelineSteps, newStep]);
                      }}
                      disabled={isBuiltIn}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Step
                    </Button>
                  </div>

                  {pipelineSteps.length === 0 ? (
                    <div className="rounded-lg border border-dashed p-6 text-center">
                      <Settings2 className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                      <p className="text-sm text-muted-foreground">No steps configured</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Add steps to create a multi-step workflow
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {pipelineSteps.map((step, index) => (
                        <div key={step.id} className="rounded-lg border p-3 space-y-3">
                          <div className="flex items-center gap-2">
                            <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                            <Badge variant="outline" className="shrink-0">
                              {index + 1}
                            </Badge>
                            <Input
                              value={step.name}
                              onChange={(e) => {
                                const updated = [...pipelineSteps];
                                updated[index] = { ...step, name: e.target.value };
                                setPipelineSteps(updated);
                              }}
                              placeholder="Step name"
                              className="flex-1 h-8"
                              disabled={isBuiltIn}
                            />
                            <Select
                              value={step.type}
                              onValueChange={(v) => {
                                const updated = [...pipelineSteps];
                                updated[index] = { ...step, type: v as PipelineStep["type"] };
                                setPipelineSteps(updated);
                              }}
                              disabled={isBuiltIn}
                            >
                              <SelectTrigger className="w-28 h-8">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="llm">
                                  <div className="flex items-center gap-1">
                                    <MessageSquare className="h-3 w-3" />
                                    LLM
                                  </div>
                                </SelectItem>
                                <SelectItem value="image">
                                  <div className="flex items-center gap-1">
                                    <ImageIcon className="h-3 w-3" />
                                    Image
                                  </div>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 shrink-0"
                              onClick={() => {
                                setPipelineSteps(pipelineSteps.filter((_, i) => i !== index));
                              }}
                              disabled={isBuiltIn}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label className="text-xs">Model</Label>
                              <Popover
                                open={stepModelPickerOpen === index}
                                onOpenChange={(open) => {
                                  setStepModelPickerOpen(open ? index : null);
                                  if (!open) setStepModelSearch("");
                                }}
                              >
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="outline"
                                    role="combobox"
                                    className="w-full justify-between h-8 text-xs font-normal"
                                  >
                                    {(() => {
                                      const currentModelId = step.type === "image" ? step.imageModelId : step.modelId;
                                      if (!currentModelId) return <span className="text-muted-foreground">Select model...</span>;
                                      const model = modelOptions.find((m) => m.id === currentModelId);
                                      return (
                                        <span className="truncate">
                                          {model?.name || currentModelId.split("/").pop()}
                                        </span>
                                      );
                                    })()}
                                    <Search className="ml-1 h-3 w-3 shrink-0 opacity-50" />
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[300px] p-0" align="start">
                                  <Command shouldFilter={false}>
                                    <CommandInput
                                      placeholder={step.type === "image" ? "Search image models..." : "Search models..."}
                                      value={stepModelSearch}
                                      onValueChange={setStepModelSearch}
                                    />
                                    <CommandList className="max-h-[200px]">
                                      <CommandEmpty>No models found.</CommandEmpty>
                                      <CommandGroup>
                                        {getFilteredModelsForStep(step.type).map((m) => {
                                          const currentModelId = step.type === "image" ? step.imageModelId : step.modelId;
                                          const isSelected = currentModelId === m.id;
                                          return (
                                            <CommandItem
                                              key={m.id}
                                              value={m.id}
                                              onSelect={() => {
                                                const updated = [...pipelineSteps];
                                                if (step.type === "image") {
                                                  updated[index] = { ...step, imageModelId: m.id };
                                                } else {
                                                  updated[index] = { ...step, modelId: m.id };
                                                }
                                                setPipelineSteps(updated);
                                                setStepModelPickerOpen(null);
                                                setStepModelSearch("");
                                              }}
                                            >
                                              <Check className={`mr-2 h-3 w-3 shrink-0 ${isSelected ? "opacity-100" : "opacity-0"}`} />
                                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                                {isImageGenerationModel(m.id) && <ImageIcon className="h-3 w-3 text-pink-500 shrink-0" />}
                                                <span className="truncate text-xs">{m.name}</span>
                                                <span className="text-[10px] text-muted-foreground/70 shrink-0">{m.provider}</span>
                                              </div>
                                            </CommandItem>
                                          );
                                        })}
                                      </CommandGroup>
                                    </CommandList>
                                  </Command>
                                </PopoverContent>
                              </Popover>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Output Variable</Label>
                              <Input
                                value={step.outputVariable}
                                onChange={(e) => {
                                  const updated = [...pipelineSteps];
                                  updated[index] = { ...step, outputVariable: e.target.value };
                                  setPipelineSteps(updated);
                                }}
                                placeholder="e.g., optimizedPrompt"
                                className="h-8"
                                disabled={isBuiltIn}
                              />
                            </div>
                          </div>

                          <div className="space-y-1">
                            <Label className="text-xs">Input Template</Label>
                            <Input
                              value={step.inputTemplate}
                              onChange={(e) => {
                                const updated = [...pipelineSteps];
                                updated[index] = { ...step, inputTemplate: e.target.value };
                                setPipelineSteps(updated);
                              }}
                              placeholder="e.g., {{userInput}} or {{step1Output}}"
                              className="h-8"
                              disabled={isBuiltIn}
                            />
                            <p className="text-xs text-muted-foreground">
                              Use {"{{userInput}}"} for user message, {"{{stepName}}"} for previous step output
                            </p>
                          </div>

                          {step.type === "llm" && (
                            <div className="space-y-1">
                              <Label className="text-xs">System Prompt</Label>
                              <Textarea
                                value={step.systemPrompt || ""}
                                onChange={(e) => {
                                  const updated = [...pipelineSteps];
                                  updated[index] = { ...step, systemPrompt: e.target.value || undefined };
                                  setPipelineSteps(updated);
                                }}
                                placeholder="Instructions for this step..."
                                className="min-h-[80px] text-sm"
                                disabled={isBuiltIn}
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {pipelineSteps.length > 0 && (
                    <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
                      <strong>Flow:</strong> {pipelineSteps.map((s, i) => (
                        <span key={s.id}>
                          {s.name} → {s.outputVariable}
                          {i < pipelineSteps.length - 1 && " → "}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
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
