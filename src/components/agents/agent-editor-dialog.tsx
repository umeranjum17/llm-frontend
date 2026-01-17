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
import { addAgent, updateAgent, getAllMcpServers, getAllAgents, resetAgentToDefault } from "@/lib/db/queries";
import { toast } from "sonner";
import { Server, Loader2, AlertCircle, Search, Check, Plus, Trash2, GripVertical, MessageSquare, ImageIcon, Bot, Settings2, LayoutGrid, List, ChevronDown, ChevronRight, RotateCcw, Wrench } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { isImageGenerationModel } from "@/lib/constants/model-capabilities";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PipelineCanvas } from "./pipeline";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface AgentEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent?: Agent | null;
  onSaved?: (agentId: string) => void;
  onReset?: (agentId: string, newModelId: string | undefined) => void;
}

interface PipelineValidationError {
  stepIndex: number;
  stepName: string;
  message: string;
}

/**
 * Validate pipeline steps - mirrors backend validation
 */
function validatePipelineSteps(steps: PipelineStep[]): PipelineValidationError[] {
  const errors: PipelineValidationError[] = [];
  const definedVariables = new Set(["userInput", "userImages", "chatId"]);
  const outputVariables = new Set<string>();

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];

    // Check for duplicate output variables
    if (outputVariables.has(step.outputVariable)) {
      errors.push({
        stepIndex: i,
        stepName: step.name || `Step ${i + 1}`,
        message: `Duplicate output variable "${step.outputVariable}"`,
      });
    }
    outputVariables.add(step.outputVariable);

    if (step.type === "subagent") {
      if (!step.agentId || step.agentId.trim() === "") {
        errors.push({
          stepIndex: i,
          stepName: step.name || `Step ${i + 1}`,
          message: "Agent step requires an agent to be selected",
        });
      }
    }

    // Check for unresolved variable references in inputTemplate
    const varRefs = step.inputTemplate.match(/\{\{(\w+)\}\}/g) || [];
    for (const ref of varRefs) {
      const varName = ref.slice(2, -2);
      if (!definedVariables.has(varName)) {
        errors.push({
          stepIndex: i,
          stepName: step.name || `Step ${i + 1}`,
          message: `References undefined variable "{{${varName}}}"`,
        });
      }
    }

    // Add this step's output variable for subsequent steps
    definedVariables.add(step.outputVariable);
  }

  return errors;
}

export function AgentEditorDialog({ open, onOpenChange, agent, onSaved, onReset }: AgentEditorDialogProps) {
  const isEditing = !!agent;
  const isBuiltIn = agent?.isBuiltIn ?? false;

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [avatar, setAvatar] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Pipeline state - agents are always pipelines now
  const [pipelineSteps, setPipelineSteps] = useState<PipelineStep[]>([]);
  const [pipelineViewMode, setPipelineViewMode] = useState<"visual" | "form">("visual");
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());

  // Pipeline step model picker state
  const [stepModelPickerOpen, setStepModelPickerOpen] = useState<number | null>(null);
  const [stepModelSearch, setStepModelSearch] = useState("");

  const { models, loadModels } = useModelsStore();

  // Load all MCP servers (show all, not just enabled ones)
  const allMcpServers = useLiveQuery(() => getAllMcpServers(), []) || [];

  // Load all agents for subagent selection
  const allAgents = useLiveQuery(() => getAllAgents(), []) || [];

  // Initialize form when dialog opens
  useEffect(() => {
    if (!open) return;
    loadModels().catch(() => {});
    setName(agent?.name || "");
    setDescription(agent?.description || "");
    setAvatar(agent?.avatar || "");
    setIsActive(agent?.isActive ?? true);
    // Pipeline state - ensure steps have default providerId values
    const existingSteps = agent?.pipeline?.steps || [];
    const stepsWithDefaults = existingSteps.map((step) => ({
      ...step,
      providerId: step.providerId || "openrouter",
      imageProviderId: step.type === "image" ? (step.imageProviderId || "openrouter") : step.imageProviderId,
    }));

    // For new agents, create a default first LLM step
    if (!agent && stepsWithDefaults.length === 0) {
      const defaultStep: PipelineStep = {
        id: `step_${Date.now()}`,
        name: "Step 1",
        type: "llm",
        providerId: "openrouter",
        inputTemplate: "{{userInput}}",
        outputVariable: "step1Output",
      };
      setPipelineSteps([defaultStep]);
    } else {
      setPipelineSteps(stepsWithDefaults);
    }
  }, [open, agent, loadModels]);

  const modelOptions = useMemo(() => (models.length > 0 ? models : MODELS), [models]);

  // Validate pipeline steps
  const pipelineValidationErrors = useMemo(() => {
    if (pipelineSteps.length === 0) {
      return [];
    }
    return validatePipelineSteps(pipelineSteps);
  }, [pipelineSteps]);

  const hasPipelineErrors = pipelineValidationErrors.length > 0;

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

  const handleSave = async () => {
    if (!isBuiltIn) {
      if (!name.trim()) {
        toast.error("Name is required");
        return;
      }
      if (pipelineSteps.length === 0) {
        toast.error("Pipeline requires at least one step");
        return;
      }
    }

    // Check for pipeline validation errors
    if (hasPipelineErrors) {
      toast.error(`Pipeline has ${pipelineValidationErrors.length} configuration error(s)`);
      return;
    }

    setSaving(true);
    try {
      // Build pipeline config - agents are always pipelines
      const pipelineConfig = pipelineSteps.length > 0
        ? { steps: pipelineSteps }
        : undefined;

      if (agent) {
        // For built-in agents, only update specific fields
        if (isBuiltIn) {
          await updateAgent(agent.id, {
            isActive,
            executionType: "pipeline",
            pipeline: pipelineConfig,
          });
          toast.success("Agent settings updated");
        } else {
          await updateAgent(agent.id, {
            name: name.trim(),
            description: description.trim() || undefined,
            avatar: avatar.trim() || undefined,
            systemPrompt: "", // System prompts are per-step now
            isActive,
            executionType: "pipeline",
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
          systemPrompt: "", // System prompts are per-step now
          enabledTools: [], // Tools are configured per-step
          mcpServerIds: [], // MCP servers are configured per-step
          knowledgeBaseIds: [],
          parameters: undefined,
          isBuiltIn: false,
          isActive,
          executionType: "pipeline",
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

  const handleReset = async () => {
    if (!agent || !isBuiltIn) return;

    setResetting(true);
    try {
      const newModelId = await resetAgentToDefault(agent.id);
      onReset?.(agent.id, newModelId);
      toast.success("Agent reset to default settings");
      onOpenChange(false);
    } catch (e) {
      console.error("Failed to reset agent:", e);
      toast.error("Failed to reset agent");
    } finally {
      setResetting(false);
    }
  };

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

        <Tabs defaultValue="overview" className="flex-1 min-h-0">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="pipeline">
              Pipeline
              {pipelineSteps.length > 0 && (
                <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-xs">
                  {pipelineSteps.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 mt-4 pr-4" style={{ maxHeight: "calc(90vh - 220px)" }}>
            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-4 mt-0">
              {/* Basic Info */}
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
              </div>

              {/* Pipeline Summary */}
              {pipelineSteps.length > 0 && (
                <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Pipeline Summary</Label>
                    <Badge variant="outline" className="text-xs">
                      {pipelineSteps.length} step{pipelineSteps.length !== 1 ? "s" : ""}
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    {pipelineSteps.map((step, i) => {
                      const stepModelId = step.type === "image" ? step.imageModelId : step.modelId;
                      const model = modelOptions.find((m) => m.id === stepModelId);
                      const StepIcon = step.type === "llm" ? MessageSquare : step.type === "image" ? ImageIcon : step.type === "subagent" ? Bot : Server;
                      const stepColor = step.type === "llm" ? "text-blue-500" : step.type === "image" ? "text-pink-500" : step.type === "subagent" ? "text-purple-500" : "text-amber-500";
                      const toolCount = step.mcpServerIds?.length || 0;

                      return (
                        <div key={step.id} className="flex items-center gap-3 p-2 rounded-md bg-background/50">
                          <div className="flex items-center justify-center h-6 w-6 rounded-full bg-muted text-xs font-medium">
                            {i + 1}
                          </div>
                          <StepIcon className={cn("h-4 w-4", stepColor)} />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{step.name}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              {model?.name || stepModelId || "No model"}
                              {toolCount > 0 && ` • ${toolCount} tool source${toolCount !== 1 ? "s" : ""}`}
                            </div>
                          </div>
                          <Badge variant="secondary" className="text-[10px] shrink-0">
                            {step.type.toUpperCase()}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Status */}
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <Label htmlFor="agent-active" className="text-sm cursor-pointer">
                  Agent Enabled
                </Label>
                <Switch
                  id="agent-active"
                  checked={isActive}
                  onCheckedChange={setIsActive}
                />
              </div>
            </TabsContent>

            {/* Pipeline Tab */}
            <TabsContent value="pipeline" className="space-y-4 mt-0">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-base">Pipeline Steps</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Define the steps this agent will execute sequentially
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* View mode toggle */}
                    <div className="flex items-center border rounded-lg p-0.5">
                      <Button
                        variant={pipelineViewMode === "visual" ? "secondary" : "ghost"}
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => setPipelineViewMode("visual")}
                      >
                        <LayoutGrid className="h-3.5 w-3.5 mr-1" />
                        Visual
                      </Button>
                      <Button
                        variant={pipelineViewMode === "form" ? "secondary" : "ghost"}
                        size="sm"
                        className="h-7 px-2"
                        onClick={() => setPipelineViewMode("form")}
                      >
                        <List className="h-3.5 w-3.5 mr-1" />
                        Form
                      </Button>
                    </div>
                  </div>
                </div>

                  {/* Visual Pipeline Editor */}
                  {pipelineViewMode === "visual" && (
                    <PipelineCanvas
                      steps={pipelineSteps}
                      onStepsChange={setPipelineSteps}
                      modelOptions={modelOptions}
                      mcpServers={allMcpServers}
                      agents={allAgents}
                      currentAgentId={agent?.id}
                      isBuiltIn={isBuiltIn}
                    />
                  )}

                  {/* Validation Errors */}
                  {hasPipelineErrors && (
                    <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-3 space-y-2">
                      <div className="flex items-center gap-2 text-destructive">
                        <AlertCircle className="h-4 w-4" />
                        <span className="text-sm font-medium">Pipeline Configuration Errors</span>
                      </div>
                      <ul className="space-y-1">
                        {pipelineValidationErrors.map((error, i) => (
                          <li key={i} className="text-xs text-destructive/80 flex items-start gap-1.5">
                            <span className="font-medium shrink-0">Step {error.stepIndex + 1}:</span>
                            <span>{error.message}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Form-based Pipeline Editor */}
                  {pipelineViewMode === "form" && (
                  <>
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const newStep: PipelineStep = {
                          id: `step_${Date.now()}`,
                          name: `Step ${pipelineSteps.length + 1}`,
                          type: "llm",
                          providerId: "openrouter",
                          inputTemplate: "{{userInput}}",
                          outputVariable: `step${pipelineSteps.length + 1}Output`,
                        };
                        setPipelineSteps([...pipelineSteps, newStep]);
                      }}
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
                    <div className="space-y-2">
                      {pipelineSteps.map((step, index) => {
                        const isExpanded = expandedSteps.has(step.id);
                        const StepIcon = step.type === "llm" ? MessageSquare : step.type === "image" ? ImageIcon : step.type === "tool" ? Wrench : Bot;
                        const stepColor = step.type === "llm" ? "text-blue-500" : step.type === "image" ? "text-pink-500" : step.type === "tool" ? "text-amber-500" : "text-purple-500";

                        return (
                        <div key={step.id} className="rounded-lg border overflow-hidden">
                          {/* Compact header - always visible */}
                          <div
                            className="flex items-center gap-2 p-2 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                            onClick={() => {
                              const newExpanded = new Set(expandedSteps);
                              if (isExpanded) {
                                newExpanded.delete(step.id);
                              } else {
                                newExpanded.add(step.id);
                              }
                              setExpandedSteps(newExpanded);
                            }}
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                            )}
                            <Badge variant="outline" className="shrink-0 h-5 w-5 p-0 flex items-center justify-center text-[10px]">
                              {index + 1}
                            </Badge>
                            <StepIcon className={`h-3.5 w-3.5 shrink-0 ${stepColor}`} />
                            <span className="font-medium text-sm truncate flex-1">{step.name || `Step ${index + 1}`}</span>
                            <Badge variant="secondary" className="text-[10px] h-5 shrink-0">
                              {step.type.toUpperCase()}
                            </Badge>
                            <span className="text-xs text-muted-foreground truncate max-w-[100px]">
                              → {step.outputVariable}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 shrink-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPipelineSteps(pipelineSteps.filter((_, i) => i !== index));
                              }}
                                      >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>

                          {/* Expanded content */}
                          {isExpanded && (
                          <div className="p-3 space-y-3 border-t">
                          <div className="flex items-center gap-2">
                            <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                            <Input
                              value={step.name}
                              onChange={(e) => {
                                const updated = [...pipelineSteps];
                                updated[index] = { ...step, name: e.target.value };
                                setPipelineSteps(updated);
                              }}
                              placeholder="Step name"
                              className="flex-1 h-8"
                                      />
                            <Select
                              value={step.type}
                              onValueChange={(v) => {
                                const updated = [...pipelineSteps];
                                updated[index] = { ...step, type: v as PipelineStep["type"] };
                                setPipelineSteps(updated);
                              }}
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
                              <SelectItem value="tool" disabled>
                                <div className="flex items-center gap-1">
                                  <Wrench className="h-3 w-3" />
                                  Tool (deprecated)
                                </div>
                              </SelectItem>
                                <SelectItem value="subagent">
                                  <div className="flex items-center gap-1">
                                    <Bot className="h-3 w-3" />
                                    Agent
                                  </div>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Model and Provider selection - only for LLM and Image steps */}
                          {(step.type === "llm" || step.type === "image") && (
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
                              <Label className="text-xs">Provider</Label>
                              <Select
                                value={step.type === "image" ? (step.imageProviderId || "openrouter") : (step.providerId || "openrouter")}
                                onValueChange={(v) => {
                                  const updated = [...pipelineSteps];
                                  if (step.type === "image") {
                                    updated[index] = { ...step, imageProviderId: v };
                                  } else {
                                    updated[index] = { ...step, providerId: v };
                                  }
                                  setPipelineSteps(updated);
                                }}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue placeholder="Select provider" />
                                </SelectTrigger>
                                <SelectContent>
                                  {PROVIDERS.filter(p => p.apiKeyRequired).map((provider) => (
                                    <SelectItem key={provider.id} value={provider.id}>
                                      {provider.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          )}

                          {/* Tool step configuration (deprecated) */}
                          {step.type === "tool" && (
                            <div className="space-y-2 rounded-md border border-dashed p-3">
                              <p className="text-xs text-muted-foreground">
                                Tool steps are deprecated. Use an LLM step with MCP tools enabled instead.
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                Delete this step and add an LLM step to continue.
                              </p>
                            </div>
                          )}

                          {/* Subagent step configuration */}
                          {step.type === "subagent" && (
                          <div className="space-y-1">
                            <Label className="text-xs">Agent ID</Label>
                            <Input
                              value={step.agentId || ""}
                              onChange={(e) => {
                                const updated = [...pipelineSteps];
                                updated[index] = { ...step, agentId: e.target.value || undefined };
                                setPipelineSteps(updated);
                              }}
                              placeholder="e.g., agent_builtin_summarizer"
                              className="h-8 text-xs"
                                      />
                            <p className="text-xs text-muted-foreground">
                              The ID of another agent to invoke (check Agents page for available agents)
                            </p>
                          </div>
                          )}

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
                                      />
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
                                      />
                            <p className="text-xs text-muted-foreground">
                              Use {"{{userInput}}"} for user message, {"{{stepName}}"} for previous step output
                            </p>
                          </div>

                          {step.type === "llm" && (
                            <>
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
                                />
                              </div>
                              {allMcpServers.length > 0 && (
                                <div className="space-y-2">
                                  <Label className="text-xs flex items-center gap-1.5">
                                    <Server className="h-3 w-3" />
                                    MCP Tools
                                  </Label>
                                  <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
                                    {allMcpServers.map((server) => {
                                      const isEnabled = step.mcpServerIds?.includes(server.id);
                                      const toolCount = server.tools?.length || 0;
                                      const serverTools = (server.tools || []) as Array<{ name: string; description?: string }>;
                                      const composioToolkits = server.id === "composio-consolidated"
                                        ? (server.composioToolkits || [])
                                        : [];
                                      const enabledTools = step.enabledTools || [];
                                      const isAllowlistActive = enabledTools.length > 0;
                                      return (
                                        <div
                                          key={server.id}
                                          className={cn(
                                            "rounded-md border transition-colors",
                                            isEnabled ? "bg-primary/5 border-primary/20" : "bg-muted/30"
                                          )}
                                        >
                                          <div className="flex items-center justify-between p-2">
                                            <div className="min-w-0 flex-1">
                                              <div className="text-xs font-medium truncate">{server.name}</div>
                                              {toolCount > 0 && (
                                                <div className="text-[10px] text-muted-foreground">
                                                  {toolCount} tool{toolCount !== 1 ? "s" : ""}
                                                </div>
                                              )}
                                            </div>
                                            <Switch
                                              checked={!!isEnabled}
                                              onCheckedChange={() => {
                                                const updated = [...pipelineSteps];
                                                const currentIds = step.mcpServerIds || [];
                                                const nextIds = currentIds.includes(server.id)
                                                  ? currentIds.filter((id) => id !== server.id)
                                                  : [...currentIds, server.id];

                                                let nextEnabledTools = step.enabledTools;
                                                if (currentIds.includes(server.id) && nextEnabledTools?.length) {
                                                  nextEnabledTools = nextEnabledTools.filter((toolId) => !toolId.startsWith(`${server.id}/`));
                                                  if (nextEnabledTools.length === 0) nextEnabledTools = undefined;
                                                }

                                                updated[index] = { ...step, mcpServerIds: nextIds, enabledTools: nextEnabledTools };
                                                setPipelineSteps(updated);
                                              }}
                                              className="scale-75"
                                            />
                                          </div>

                                          {isEnabled && (
                                            <div className="border-t px-2 py-2 space-y-1.5">
                                              {toolCount === 0 && composioToolkits.length === 0 ? (
                                                <div className="text-[10px] text-muted-foreground">
                                                  No tools loaded for this server yet.
                                                </div>
                                              ) : composioToolkits.length > 0 ? (
                                                composioToolkits.map((toolkit) => {
                                                  const stepOverrides = step.toolkitOverrides || {};
                                                  const effectiveEnabled = stepOverrides[toolkit.key] ?? toolkit.isEnabled;
                                                  const hasOverride = toolkit.key in stepOverrides;
                                                  return (
                                                    <div key={toolkit.key} className="flex items-center justify-between gap-2">
                                                      <div className="min-w-0 flex-1">
                                                        <div className="text-xs font-medium truncate flex items-center gap-1">
                                                          {toolkit.name}
                                                          {hasOverride && (
                                                            <span className="text-[9px] text-primary">(override)</span>
                                                          )}
                                                        </div>
                                                        <div className="text-[10px] text-muted-foreground">{toolkit.key}</div>
                                                      </div>
                                                      <Switch
                                                        checked={effectiveEnabled}
                                                        onCheckedChange={() => {
                                                          const updated = [...pipelineSteps];
                                                          const currentOverrides = step.toolkitOverrides || {};
                                                          const currentValue = currentOverrides[toolkit.key] ?? toolkit.isEnabled;
                                                          const newValue = !currentValue;

                                                          // If new value matches global, remove the override
                                                          if (newValue === toolkit.isEnabled) {
                                                            const { [toolkit.key]: _, ...rest } = currentOverrides;
                                                            updated[index] = {
                                                              ...step,
                                                              toolkitOverrides: Object.keys(rest).length > 0 ? rest : undefined,
                                                            };
                                                          } else {
                                                            updated[index] = {
                                                              ...step,
                                                              toolkitOverrides: { ...currentOverrides, [toolkit.key]: newValue },
                                                            };
                                                          }
                                                          setPipelineSteps(updated);
                                                        }}
                                                        className="scale-75"
                                                      />
                                                    </div>
                                                  );
                                                })
                                              ) : (
                                                serverTools.map((tool) => {
                                                  const toolId = `${server.id}/${tool.name}`;
                                                  const isChecked = isAllowlistActive
                                                    ? enabledTools.includes(toolId) || enabledTools.includes(tool.name)
                                                    : true;
                                                  return (
                                                    <div key={toolId} className="flex items-start gap-2">
                                                      <Checkbox
                                                        checked={isChecked}
                                                        onCheckedChange={() => {
                                                          const updated = [...pipelineSteps];
                                                          const currentTools = updated[index].enabledTools || [];
                                                          if (currentTools.length === 0) {
                                                            const enabledToolIds = (step.mcpServerIds || [])
                                                              .flatMap((serverId) => {
                                                                const serverEntry = allMcpServers.find((s) => s.id === serverId);
                                                                const tools = (serverEntry?.tools || []) as Array<{ name: string }>;
                                                                return tools.map((t) => `${serverId}/${t.name}`);
                                                              })
                                                              .filter((id) => id !== toolId);
                                                            updated[index] = {
                                                              ...step,
                                                              enabledTools: enabledToolIds.length > 0 ? enabledToolIds : undefined,
                                                            };
                                                          } else {
                                                            const hasTool = currentTools.includes(toolId);
                                                            const nextTools = hasTool
                                                              ? currentTools.filter((id) => id !== toolId)
                                                              : [...currentTools, toolId];
                                                            updated[index] = {
                                                              ...step,
                                                              enabledTools: nextTools.length > 0 ? nextTools : undefined,
                                                            };
                                                          }
                                                          setPipelineSteps(updated);
                                                        }}
                                                        className="mt-0.5"
                                                      />
                                                      <div className="min-w-0">
                                                        <div className="text-xs font-medium truncate">{tool.name}</div>
                                                        {tool.description && (
                                                          <div className="text-[10px] text-muted-foreground line-clamp-2">
                                                            {tool.description}
                                                          </div>
                                                        )}
                                                      </div>
                                                    </div>
                                                  );
                                                })
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                  {step.mcpServerIds?.length ? (
                                    <p className="text-[10px] text-muted-foreground">
                                      {step.enabledTools?.length
                                        ? `${step.enabledTools.length} tool${step.enabledTools.length !== 1 ? "s" : ""} enabled`
                                        : "All tools enabled"}
                                    </p>
                                  ) : null}
                                </div>
                              )}
                            </>
                          )}
                          </div>
                          )}
                        </div>
                        );
                      })}
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
                  </>
                  )}
              </div>
            </TabsContent>
          </ScrollArea>
        </Tabs>

        <div className="flex justify-between gap-2 pt-4 border-t mt-4">
          <div>
            {isBuiltIn && isEditing && (
              <Button
                variant="outline"
                onClick={handleReset}
                disabled={saving || resetting}
                className="text-muted-foreground hover:text-foreground"
              >
                {resetting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Resetting...
                  </>
                ) : (
                  <>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Reset to Default
                  </>
                )}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {hasPipelineErrors && (
              <span className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {pipelineValidationErrors.length} error{pipelineValidationErrors.length !== 1 ? "s" : ""}
              </span>
            )}
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving || resetting}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || resetting || hasPipelineErrors}>
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
