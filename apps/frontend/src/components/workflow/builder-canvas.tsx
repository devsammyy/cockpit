"use client";

import type { Connection, Edge, NodeTypes } from "@xyflow/react";
import {
  addEdge,
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AlertTriangle, Check, LayoutGrid, Plus } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { StepNode, ValidationIssue } from "@/components/workflow/definition-io";
import {
  createStep,
  definitionToFlow,
  flowToDefinition,
  layoutPositions,
  STEP_TYPES,
  validateDefinition,
} from "@/components/workflow/definition-io";
import { StepConfigSheet } from "@/components/workflow/step-config-sheet";
import { StepNodeComponent } from "@/components/workflow/step-node";
import type { WorkflowDefinition } from "@/lib/api/types";
import { cn } from "@/lib/utils";

const nodeTypes: NodeTypes = { step: StepNodeComponent as NodeTypes[string] };

interface BuilderCanvasProps {
  definition: WorkflowDefinition;
  /** notified on every structural change with the serialized definition */
  onChange?: (definition: WorkflowDefinition) => void;
  readOnly?: boolean;
  className?: string;
}

/**
 * Visual workflow editor on React Flow: drag nodes, connect edges (condition
 * edges get true/false labels), edit step config in a side sheet, validate
 * against engine rules, and re-run auto-layout.
 */
export function BuilderCanvas({ definition, onChange, readOnly, className }: BuilderCanvasProps) {
  const initial = React.useMemo(() => definitionToFlow(definition), [definition]);
  const [nodes, setNodes, onNodesChange] = useNodesState<StepNode>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const [selectedStepId, setSelectedStepId] = React.useState<string | null>(null);
  const [issues, setIssues] = React.useState<ValidationIssue[]>([]);

  // Reload the canvas when a different definition is supplied.
  React.useEffect(() => {
    const flow = definitionToFlow(definition);
    setNodes(flow.nodes);
    setEdges(flow.edges);
  }, [definition, setEdges, setNodes]);

  const emitChange = React.useCallback(
    (nextNodes: StepNode[], nextEdges: Edge[]) => {
      onChange?.(flowToDefinition(nextNodes, nextEdges));
    },
    [onChange],
  );

  const handleConnect = React.useCallback(
    (connection: Connection) => {
      const sourceNode = nodes.find((node) => node.id === connection.source);
      const isCondition = sourceNode?.data.step.type === "CONDITION";
      let label: string | undefined;

      if (isCondition) {
        const existingLabels = edges
          .filter((edge) => edge.source === connection.source)
          .map((edge) => edge.label);
        label = existingLabels.includes("true") ? "false" : "true";
      }

      setEdges((current) => {
        const next = addEdge({ ...connection, label }, current);
        emitChange(nodes, next);
        return next;
      });
    },
    [edges, emitChange, nodes, setEdges],
  );

  const handleAddStep = (type: string) => {
    const step = createStep(type);
    const maxX = nodes.reduce((max, node) => Math.max(max, node.position.x), 0);
    const newNode: StepNode = {
      data: { step },
      id: step.id,
      position: { x: maxX + 300, y: 80 },
      type: "step",
    };
    setNodes((current) => {
      const next = [...current, newNode];
      emitChange(next, edges);
      return next;
    });
    setSelectedStepId(step.id);
  };

  const handleAutoLayout = () => {
    const currentDefinition = flowToDefinition(nodes, edges);
    const positions = layoutPositions(currentDefinition);
    setNodes((current) =>
      current.map((node) => ({
        ...node,
        position: positions.get(node.id) ?? node.position,
      })),
    );
  };

  const handleValidate = () => {
    const currentDefinition = flowToDefinition(nodes, edges);
    const result = validateDefinition(currentDefinition);
    setIssues(result);
    if (result.length === 0) {
      toast.success("Workflow definition is valid");
    } else {
      toast.warning(
        `${String(result.filter((issue) => issue.severity === "error").length)} errors, ${String(result.filter((issue) => issue.severity === "warning").length)} warnings`,
      );
    }
  };

  const selectedStep = nodes.find((node) => node.id === selectedStepId)?.data.step ?? null;

  const handleStepSave = (updated: { name: string; config: Record<string, unknown> }) => {
    setNodes((current) => {
      const next = current.map((node) =>
        node.id === selectedStepId
          ? {
              ...node,
              data: { step: { ...node.data.step, config: updated.config, name: updated.name } },
            }
          : node,
      );
      emitChange(next, edges);
      return next;
    });
    setSelectedStepId(null);
  };

  const handleStepDelete = () => {
    if (!selectedStepId) return;
    setNodes((current) => {
      const nextNodes = current.filter((node) => node.id !== selectedStepId);
      setEdges((currentEdges) => {
        const nextEdges = currentEdges.filter(
          (edge) => edge.source !== selectedStepId && edge.target !== selectedStepId,
        );
        emitChange(nextNodes, nextEdges);
        return nextEdges;
      });
      return nextNodes;
    });
    setSelectedStepId(null);
  };

  return (
    <div className={cn("relative flex h-full min-h-[480px] flex-col rounded-lg border", className)}>
      <div className="flex flex-wrap items-center gap-2 border-b bg-card px-3 py-2">
        {!readOnly ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline">
                <Plus /> Add step
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
              <DropdownMenuLabel>Step types</DropdownMenuLabel>
              {STEP_TYPES.filter((meta) => meta.type !== "START").map((meta) => (
                <DropdownMenuItem
                  key={meta.type}
                  onClick={() => {
                    handleAddStep(meta.type);
                  }}
                >
                  <div className="flex flex-col">
                    <span className="flex items-center gap-2 font-medium">
                      {meta.label}
                      {!meta.native ? (
                        <Badge className="text-[9px]" variant="muted">
                          pass-through
                        </Badge>
                      ) : null}
                    </span>
                    <span className="text-xs text-muted-foreground">{meta.description}</span>
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button onClick={handleAutoLayout} size="sm" variant="outline">
              <LayoutGrid /> Auto layout
            </Button>
          </TooltipTrigger>
          <TooltipContent>Re-arrange nodes by execution order</TooltipContent>
        </Tooltip>
        <Button onClick={handleValidate} size="sm" variant="outline">
          <Check /> Validate
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">
          {nodes.length} steps · {edges.length} connections
        </span>
      </div>

      {issues.length > 0 ? (
        <div className="max-h-28 space-y-1 overflow-y-auto border-b bg-warning/5 px-3 py-2 scrollbar-thin">
          {issues.map((issue, index) => (
            <p
              className={cn(
                "flex items-center gap-1.5 text-xs",
                issue.severity === "error" ? "text-destructive" : "text-warning",
              )}
              key={index}
            >
              <AlertTriangle aria-hidden className="size-3 shrink-0" />
              {issue.message}
            </p>
          ))}
        </div>
      ) : null}

      <div className="min-h-0 flex-1">
        <ReactFlow
          edges={edges}
          fitView
          nodes={nodes}
          nodesConnectable={!readOnly}
          nodesDraggable={!readOnly}
          nodeTypes={nodeTypes}
          onConnect={readOnly ? undefined : handleConnect}
          onEdgesChange={(changes) => {
            onEdgesChange(changes);
          }}
          onNodeClick={(_event, node) => {
            if (!readOnly) setSelectedStepId(node.id);
          }}
          onNodesChange={(changes) => {
            onNodesChange(changes);
          }}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} size={1.2} />
          <Controls showInteractive={false} />
          <MiniMap
            className="!bg-card"
            maskColor="hsl(var(--muted) / 0.7)"
            nodeColor="hsl(var(--muted-foreground) / 0.4)"
            pannable
            zoomable
          />
        </ReactFlow>
      </div>

      <StepConfigSheet
        onClose={() => {
          setSelectedStepId(null);
        }}
        onDelete={handleStepDelete}
        onSave={handleStepSave}
        step={selectedStep}
      />
    </div>
  );
}
