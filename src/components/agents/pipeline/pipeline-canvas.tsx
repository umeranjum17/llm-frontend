"use client";

import { useCallback, useState, useEffect } from "react";
import ReactFlow, {
  Background,
  Controls,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type Connection,
  MarkerType,
  ReactFlowProvider,
  useReactFlow,
} from "reactflow";
import "reactflow/dist/style.css";
import { Plus, MessageSquare, ImageIcon, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { PipelineStep } from "@/lib/db/schema";
import { StartNode, LLMNode, ImageNode, ToolNode, SubagentNode } from "./nodes";
import { NodeConfigPanel } from "./node-config-panel";
import type { Model } from "@/lib/constants/models";
import type { McpServer, Agent } from "@/lib/db/schema";

// Register custom node types - MUST be defined outside component to prevent re-renders
const nodeTypes = {
  start: StartNode,
  llm: LLMNode,
  image: ImageNode,
  tool: ToolNode,
  subagent: SubagentNode,
};

interface PipelineCanvasProps {
  steps: PipelineStep[];
  onStepsChange: (steps: PipelineStep[]) => void;
  modelOptions: Model[];
  mcpServers?: McpServer[];
  agents?: Agent[];
  currentAgentId?: string; // To exclude current agent from subagent selection
  isBuiltIn?: boolean;
}

// Convert PipelineStep[] to React Flow nodes and edges
function stepsToFlow(steps: PipelineStep[]): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [
    {
      id: "start",
      type: "start",
      position: { x: 50, y: 150 },
      data: { label: "Start" },
      deletable: false,
    },
  ];

  // Add step nodes
  steps.forEach((step, i) => {
    nodes.push({
      id: step.id,
      type: step.type,
      position: { x: 280 + i * 250, y: 150 },
      data: step,
    });
  });

  // Create edges - connect sequentially
  const edges: Edge[] = [];

  if (steps.length > 0) {
    // Connect start to first step
    edges.push({
      id: `e-start-${steps[0].id}`,
      source: "start",
      target: steps[0].id,
      animated: true,
      markerEnd: { type: MarkerType.ArrowClosed },
      style: { strokeWidth: 2, stroke: "#888" },
    });

    // Connect each step to the next
    for (let i = 0; i < steps.length - 1; i++) {
      edges.push({
        id: `e-${steps[i].id}-${steps[i + 1].id}`,
        source: steps[i].id,
        target: steps[i + 1].id,
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { strokeWidth: 2, stroke: "#888" },
      });
    }
  }

  return { nodes, edges };
}

// Convert React Flow nodes back to PipelineStep[] using edge connections
// Also auto-updates input/output variables based on new order
function flowToSteps(nodes: Node[], edges: Edge[]): PipelineStep[] {
  // Build adjacency list from edges
  const adjacency = new Map<string, string>();
  edges.forEach((edge) => {
    adjacency.set(edge.source, edge.target);
  });

  // Find order starting from 'start' node
  const orderedIds: string[] = [];
  let current = adjacency.get("start");
  while (current) {
    orderedIds.push(current);
    current = adjacency.get(current);
  }

  // Extract step data from nodes in order and update input/output
  const steps: PipelineStep[] = [];
  orderedIds.forEach((id, index) => {
    const node = nodes.find((n) => n.id === id);
    if (node && node.type !== "start") {
      const step = node.data as PipelineStep;
      // Auto-update input based on position
      const inputTemplate = index === 0
        ? "{{userInput}}"
        : `{{step${index}Output}}`;
      // Auto-update output based on position
      const outputVariable = `step${index + 1}Output`;

      steps.push({
        ...step,
        inputTemplate,
        outputVariable,
      });
    }
  });

  return steps;
}

// Inner component that has access to ReactFlow instance
function PipelineCanvasInner({
  steps,
  onStepsChange,
  modelOptions,
  mcpServers = [],
  agents = [],
  currentAgentId,
  isBuiltIn = false,
}: PipelineCanvasProps) {
  const { fitView } = useReactFlow();
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [reactFlowReady, setReactFlowReady] = useState(false);

  // Initialize nodes from steps
  useEffect(() => {
    const { nodes: newNodes, edges: newEdges } = stepsToFlow(steps);
    setNodes(newNodes);
    setEdges(newEdges);
  }, [steps]);

  // Fit view after ReactFlow is ready and nodes are set
  useEffect(() => {
    if (reactFlowReady && nodes.length > 0) {
      // Small delay to ensure nodes are rendered in DOM
      const timer = setTimeout(() => {
        fitView({ padding: 0.3, duration: 200 });
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [reactFlowReady, nodes.length, fitView]);

  // Handle ReactFlow initialization
  const onInit = useCallback(() => {
    setReactFlowReady(true);
    // Delay fitView to ensure container has dimensions
    setTimeout(() => {
      fitView({ padding: 0.3, duration: 200 });
    }, 50);
  }, [fitView]);

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      setNodes((nds) => {
        const updatedNodes = applyNodeChanges(changes, nds);
        // Don't update steps on position changes only
        const hasDataChange = changes.some((c) => c.type !== "position" && c.type !== "select" && c.type !== "dimensions");
        if (hasDataChange) {
          // Defer the parent state update to avoid "Cannot update a component while rendering" error
          setTimeout(() => {
            const newSteps = flowToSteps(updatedNodes, edges);
            onStepsChange(newSteps);
          }, 0);
        }
        return updatedNodes;
      });
    },
    [edges, onStepsChange]
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      setEdges((eds) => {
        const updatedEdges = applyEdgeChanges(changes, eds);
        // Defer the parent state update to avoid "Cannot update a component while rendering" error
        setTimeout(() => {
          const newSteps = flowToSteps(nodes, updatedEdges);
          onStepsChange(newSteps);
        }, 0);
        return updatedEdges;
      });
    },
    [nodes, onStepsChange]
  );

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => {
        // Remove any existing edge from this source
        const filteredEdges = eds.filter((e) => e.source !== connection.source);
        const newEdge: Edge = {
          ...connection,
          id: `e-${connection.source}-${connection.target}`,
          animated: true,
          markerEnd: { type: MarkerType.ArrowClosed },
          style: { strokeWidth: 2, stroke: "#888" },
        } as Edge;
        const updatedEdges = addEdge(newEdge, filteredEdges);
        // Defer the parent state update
        setTimeout(() => {
          const newSteps = flowToSteps(nodes, updatedEdges);
          onStepsChange(newSteps);
        }, 0);
        return updatedEdges;
      });
    },
    [nodes, onStepsChange]
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.type !== "start") {
      setSelectedNodeId(node.id);
    } else {
      setSelectedNodeId(null);
    }
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  const addNode = useCallback(
    (type: PipelineStep["type"]) => {
      const newId = `step_${Date.now()}`;
      const stepNumber = nodes.filter((n) => n.type !== "start").length + 1;

      const newStep: PipelineStep = {
        id: newId,
        name: `Step ${stepNumber}`,
        type,
        providerId: "openrouter",
        inputTemplate: steps.length === 0 ? "{{userInput}}" : `{{${steps[steps.length - 1]?.outputVariable || "userInput"}}}`,
        outputVariable: `step${stepNumber}Output`,
        ...(type === "image" && { imageProviderId: "openrouter" }),
      };

      // Position new node
      const lastNode = nodes[nodes.length - 1];
      const newNode: Node = {
        id: newId,
        type,
        position: { x: (lastNode?.position.x || 50) + 250, y: 150 },
        data: newStep,
      };

      // Create edge from last node to new node
      const newEdge: Edge = {
        id: `e-${lastNode?.id || "start"}-${newId}`,
        source: lastNode?.id || "start",
        target: newId,
        animated: true,
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { strokeWidth: 2, stroke: "#888" },
      };

      setNodes((nds) => [...nds, newNode]);
      setEdges((eds) => [...eds, newEdge]);

      const newSteps = [...steps, newStep];
      onStepsChange(newSteps);
      setSelectedNodeId(newId);

      // Fit view after adding node
      setTimeout(() => fitView({ padding: 0.3, duration: 200 }), 50);
    },
    [nodes, steps, onStepsChange, fitView]
  );

  const updateSelectedNode = useCallback(
    (updates: Partial<PipelineStep>) => {
      if (!selectedNodeId) return;

      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === selectedNodeId) {
            return {
              ...node,
              data: { ...node.data, ...updates },
            };
          }
          return node;
        })
      );

      const newSteps = steps.map((step) =>
        step.id === selectedNodeId ? { ...step, ...updates } : step
      );
      onStepsChange(newSteps);
    },
    [selectedNodeId, steps, onStepsChange]
  );

  const deleteSelectedNode = useCallback(() => {
    if (!selectedNodeId) return;

    // Remove node
    const nodeToDelete = nodes.find((n) => n.id === selectedNodeId);
    if (!nodeToDelete) return;

    // Find incoming and outgoing edges
    const incomingEdge = edges.find((e) => e.target === selectedNodeId);
    const outgoingEdge = edges.find((e) => e.source === selectedNodeId);

    setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));

    setEdges((eds) => {
      // Remove edges connected to deleted node
      let newEdges = eds.filter(
        (e) => e.source !== selectedNodeId && e.target !== selectedNodeId
      );

      // If there was both incoming and outgoing, reconnect them
      if (incomingEdge && outgoingEdge) {
        newEdges.push({
          id: `e-${incomingEdge.source}-${outgoingEdge.target}`,
          source: incomingEdge.source,
          target: outgoingEdge.target,
          animated: true,
          markerEnd: { type: MarkerType.ArrowClosed },
          style: { strokeWidth: 2, stroke: "#888" },
        });
      }

      return newEdges;
    });

    const newSteps = steps.filter((s) => s.id !== selectedNodeId);
    onStepsChange(newSteps);
    setSelectedNodeId(null);
  }, [selectedNodeId, nodes, edges, steps, onStepsChange]);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const selectedStep = selectedNode?.data as PipelineStep | undefined;

  return (
    <div className="flex h-[400px] border rounded-lg overflow-hidden bg-background">
      <div className="flex-1 relative min-w-0">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onInit={onInit}
          nodeTypes={nodeTypes}
          defaultEdgeOptions={{
            type: "smoothstep",
            animated: true,
          }}
          proOptions={{ hideAttribution: true }}
          minZoom={0.5}
          maxZoom={2}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          className="bg-muted/20"
        >
          <Background gap={20} size={1} color="hsl(var(--muted-foreground) / 0.1)" />
          <Controls showInteractive={false} />
        </ReactFlow>

        {/* Add Node Button */}
        {!isBuiltIn && (
          <div className="absolute bottom-4 left-14 z-10">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="shadow-lg">
                  <Plus className="h-4 w-4 mr-1" />
                  Add Node
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => addNode("llm")}>
                  <MessageSquare className="h-4 w-4 mr-2 text-blue-500" />
                  LLM Step
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => addNode("image")}>
                  <ImageIcon className="h-4 w-4 mr-2 text-pink-500" />
                  Image Step
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => addNode("subagent")}>
                  <Bot className="h-4 w-4 mr-2 text-purple-500" />
                  Agent Step
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* Configuration Panel */}
      {selectedStep && (
        <NodeConfigPanel
          step={selectedStep}
          onUpdate={updateSelectedNode}
          onDelete={deleteSelectedNode}
          modelOptions={modelOptions}
          mcpServers={mcpServers}
          agents={agents}
          currentAgentId={currentAgentId}
          isBuiltIn={isBuiltIn}
        />
      )}
    </div>
  );
}

// Wrapper component that provides ReactFlow context
export function PipelineCanvas(props: PipelineCanvasProps) {
  return (
    <ReactFlowProvider>
      <PipelineCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
