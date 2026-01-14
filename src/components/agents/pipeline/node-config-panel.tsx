"use client";

import { useMemo, useState } from "react";
import { Trash2, MessageSquare, ImageIcon, Wrench, Bot, Search, Check, Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import type { PipelineStep, McpServer, Agent } from "@/lib/db/schema";
import type { Model } from "@/lib/constants/models";
import { PROVIDERS } from "@/lib/providers/registry";
import { isImageGenerationModel } from "@/lib/constants/model-capabilities";
import { cn } from "@/lib/utils";

interface NodeConfigPanelProps {
  step: PipelineStep;
  onUpdate: (updates: Partial<PipelineStep>) => void;
  onDelete: () => void;
  modelOptions: Model[];
  mcpServers?: McpServer[];
  agents?: Agent[];
  currentAgentId?: string;
  isBuiltIn?: boolean;
}

const stepTypeConfig = {
  llm: { icon: MessageSquare, color: "text-blue-500", label: "LLM Step" },
  image: { icon: ImageIcon, color: "text-pink-500", label: "Image Step" },
  tool: { icon: Wrench, color: "text-amber-500", label: "Tool Step" },
  subagent: { icon: Bot, color: "text-purple-500", label: "Agent Step" },
};

export function NodeConfigPanel({
  step,
  onUpdate,
  onDelete,
  modelOptions,
  mcpServers = [],
  agents = [],
  currentAgentId,
  isBuiltIn = false,
}: NodeConfigPanelProps) {
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState("");

  // Filter out current agent from subagent options to prevent circular reference
  const availableAgents = useMemo(() => {
    return agents.filter((a) => a.id !== currentAgentId && a.isActive);
  }, [agents, currentAgentId]);

  // Get enabled MCP servers for this step
  const enabledMcpServerIds = step.mcpServerIds || [];

  // Toggle MCP server for this step
  const toggleMcpServer = (serverId: string) => {
    const current = step.mcpServerIds || [];
    const updated = current.includes(serverId)
      ? current.filter((id) => id !== serverId)
      : [...current, serverId];
    onUpdate({ mcpServerIds: updated });
  };

  const config = stepTypeConfig[step.type];
  const Icon = config.icon;

  // Filter models based on step type
  const filteredModels = useMemo(() => {
    let filtered = modelOptions;

    if (step.type === "image") {
      filtered = filtered.filter((m) => isImageGenerationModel(m.id));
    } else if (step.type === "llm") {
      filtered = filtered.filter((m) => !isImageGenerationModel(m.id));
    }

    if (modelSearch.trim()) {
      const q = modelSearch.toLowerCase();
      filtered = filtered.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.id.toLowerCase().includes(q) ||
          m.provider.toLowerCase().includes(q)
      );
    }

    return filtered.slice(0, 50);
  }, [modelOptions, step.type, modelSearch]);

  const currentModelId = step.type === "image" ? step.imageModelId : step.modelId;
  const currentModel = modelOptions.find((m) => m.id === currentModelId);
  const currentProviderId = step.type === "image" ? step.imageProviderId : step.providerId;

  return (
    <div className="w-[280px] border-l bg-muted/30 flex flex-col">
      <div className="p-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${config.color}`} />
          <span className="font-medium text-sm">{config.label}</span>
        </div>
        {!isBuiltIn && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1 p-3">
        <div className="space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <Label className="text-xs">Name</Label>
            <Input
              value={step.name}
              onChange={(e) => onUpdate({ name: e.target.value })}
              placeholder="Step name"
              className="h-8 text-sm"
            />
          </div>

          {/* Model selection for LLM and Image steps */}
          {(step.type === "llm" || step.type === "image") && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">Model</Label>
                <Popover open={modelPickerOpen} onOpenChange={setModelPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between h-8 text-xs font-normal"
                    >
                      <span className="truncate">
                        {currentModel?.name || currentModelId?.split("/").pop() || "Select model..."}
                      </span>
                      <Search className="ml-1 h-3 w-3 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[250px] p-0" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder="Search models..."
                        value={modelSearch}
                        onValueChange={setModelSearch}
                      />
                      <CommandList className="max-h-[200px]">
                        <CommandEmpty>No models found.</CommandEmpty>
                        <CommandGroup>
                          {filteredModels.map((m) => {
                            const isSelected = currentModelId === m.id;
                            return (
                              <CommandItem
                                key={m.id}
                                value={m.id}
                                onSelect={() => {
                                  if (step.type === "image") {
                                    onUpdate({ imageModelId: m.id });
                                  } else {
                                    onUpdate({ modelId: m.id });
                                  }
                                  setModelPickerOpen(false);
                                  setModelSearch("");
                                }}
                              >
                                <Check
                                  className={`mr-2 h-3 w-3 shrink-0 ${
                                    isSelected ? "opacity-100" : "opacity-0"
                                  }`}
                                />
                                <div className="flex flex-col min-w-0 flex-1">
                                  <span className="truncate text-xs">{m.name}</span>
                                  <span className="text-[10px] text-muted-foreground">
                                    {m.provider}
                                  </span>
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

              <div className="space-y-1.5">
                <Label className="text-xs">Provider</Label>
                <Select
                  value={currentProviderId || "openrouter"}
                  onValueChange={(v) => {
                    if (step.type === "image") {
                      onUpdate({ imageProviderId: v });
                    } else {
                      onUpdate({ providerId: v });
                    }
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDERS.filter((p) => p.apiKeyRequired).map((provider) => (
                      <SelectItem key={provider.id} value={provider.id}>
                        {provider.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {/* Image step configuration */}
          {step.type === "image" && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">Image Size</Label>
                <Select
                  value={step.imageSize || "1024x1024"}
                  onValueChange={(v) => onUpdate({ imageSize: v as PipelineStep["imageSize"] })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="256x256">256x256 (Small)</SelectItem>
                    <SelectItem value="512x512">512x512 (Medium)</SelectItem>
                    <SelectItem value="1024x1024">1024x1024 (Square)</SelectItem>
                    <SelectItem value="1024x1792">1024x1792 (Portrait)</SelectItem>
                    <SelectItem value="1792x1024">1792x1024 (Landscape)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Image Quality</Label>
                <Select
                  value={step.imageQuality || "hd"}
                  onValueChange={(v) => onUpdate({ imageQuality: v as PipelineStep["imageQuality"] })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="standard">Standard</SelectItem>
                    <SelectItem value="hd">HD (Higher quality)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Style</Label>
                <Select
                  value={step.imageStyle || "natural"}
                  onValueChange={(v) => onUpdate({ imageStyle: v as PipelineStep["imageStyle"] })}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="natural">Natural</SelectItem>
                    <SelectItem value="vivid">Vivid (More dramatic)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {/* Tool step configuration */}
          {step.type === "tool" && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">Tool Name</Label>
                <Input
                  value={step.toolName || ""}
                  onChange={(e) => onUpdate({ toolName: e.target.value || undefined })}
                  placeholder="mcp_xyz_search"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tool Arguments (JSON)</Label>
                <Textarea
                  value={step.toolArgs ? JSON.stringify(step.toolArgs, null, 2) : ""}
                  onChange={(e) => {
                    try {
                      const args = e.target.value ? JSON.parse(e.target.value) : undefined;
                      onUpdate({ toolArgs: args });
                    } catch {
                      // Keep current value if invalid JSON
                    }
                  }}
                  placeholder={'{"query": "{{userInput}}"}'}
                  className="min-h-[60px] text-xs font-mono"
                />
              </div>
            </>
          )}

          {/* Subagent step configuration */}
          {step.type === "subagent" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Agent</Label>
              {availableAgents.length > 0 ? (
                <Select
                  value={step.agentId || ""}
                  onValueChange={(v) => {
                    // Find selected agent to auto-populate fields
                    const selectedAgent = availableAgents.find((a) => a.id === v);
                    if (selectedAgent) {
                      // Auto-set output variable name based on agent
                      const outputVar = selectedAgent.name
                        .toLowerCase()
                        .replace(/[^a-z0-9]/g, "_")
                        .replace(/_+/g, "_")
                        .replace(/^_|_$/g, "") + "Output";
                      onUpdate({
                        agentId: v || undefined,
                        name: selectedAgent.name,
                        outputVariable: outputVar,
                      });
                    } else {
                      onUpdate({ agentId: v || undefined });
                    }
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select an agent..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableAgents.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        <div className="flex items-center gap-2">
                          {agent.avatar && <span className="text-sm">{agent.avatar}</span>}
                          <span>{agent.name}</span>
                          {agent.isBuiltIn && (
                            <Badge variant="secondary" className="text-[9px] px-1 py-0">
                              Built-in
                            </Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No other agents available. Create agents first.
                </p>
              )}
              {/* Show selected agent description */}
              {step.agentId && (() => {
                const selectedAgent = availableAgents.find((a) => a.id === step.agentId);
                return selectedAgent?.description ? (
                  <p className="text-[10px] text-muted-foreground">
                    {selectedAgent.description}
                  </p>
                ) : null;
              })()}
            </div>
          )}

          {/* System prompt for LLM steps */}
          {step.type === "llm" && (
            <div className="space-y-1.5">
              <Label className="text-xs">System Prompt</Label>
              <Textarea
                value={step.systemPrompt || ""}
                onChange={(e) => onUpdate({ systemPrompt: e.target.value || undefined })}
                placeholder="Instructions for this step..."
                className="min-h-[80px] text-xs"
                />
            </div>
          )}

          {/* MCP Tools for LLM steps */}
          {step.type === "llm" && mcpServers.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs flex items-center gap-1.5">
                <Plug className="h-3 w-3" />
                MCP Tools
              </Label>
              <div className="space-y-1.5 max-h-[150px] overflow-y-auto">
                {mcpServers.map((server) => {
                  const isEnabled = enabledMcpServerIds.includes(server.id);
                  const toolCount = server.tools?.length || 0;
                  return (
                    <div
                      key={server.id}
                      className={cn(
                        "flex items-center justify-between p-2 rounded-md border transition-colors",
                        isEnabled ? "bg-primary/5 border-primary/20" : "bg-muted/30"
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className={cn(
                          "h-5 w-5 rounded flex items-center justify-center shrink-0",
                          isEnabled ? "bg-primary/10" : "bg-muted"
                        )}>
                          <Plug className={cn(
                            "h-3 w-3",
                            isEnabled ? "text-primary" : "text-muted-foreground"
                          )} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-medium truncate">{server.name}</div>
                          {toolCount > 0 && (
                            <div className="text-[10px] text-muted-foreground">
                              {toolCount} tool{toolCount !== 1 ? "s" : ""}
                            </div>
                          )}
                        </div>
                      </div>
                      <Switch
                        checked={isEnabled}
                        onCheckedChange={() => toggleMcpServer(server.id)}
                              className="shrink-0 ml-2 scale-75"
                      />
                    </div>
                  );
                })}
              </div>
              {enabledMcpServerIds.length > 0 && (
                <p className="text-[10px] text-muted-foreground">
                  {enabledMcpServerIds.length} server{enabledMcpServerIds.length !== 1 ? "s" : ""} enabled
                </p>
              )}
            </div>
          )}

          {/* Input/Output - shown as read-only info */}
          <div className="space-y-2 p-2 bg-muted/30 rounded-md">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Input:</span>
              <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono">
                {step.inputTemplate || "{{userInput}}"}
              </code>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Output:</span>
              <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded font-mono">
                {step.outputVariable}
              </code>
            </div>
            <p className="text-[9px] text-muted-foreground">
              Connections are automatic based on step order
            </p>
          </div>

          {/* Error handling */}
          <div className="space-y-1.5">
            <Label className="text-xs">On Error</Label>
            <Select
              value={step.onError || "abort"}
              onValueChange={(v) => onUpdate({ onError: v as PipelineStep["onError"] })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="abort">Abort Pipeline</SelectItem>
                <SelectItem value="continue">Continue</SelectItem>
                <SelectItem value="retry">Retry</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {step.onError === "retry" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Max Retries</Label>
              <Input
                type="number"
                min={1}
                max={5}
                value={step.maxRetries || 3}
                onChange={(e) => onUpdate({ maxRetries: parseInt(e.target.value) || 3 })}
                className="h-8 text-xs"
                />
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
