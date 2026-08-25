"use client";

import { Handle, Position } from "@xyflow/react";
import type { NodeProps } from "@xyflow/react";
import {
  Bot,
  CheckSquare,
  CircleDot,
  Clock,
  Database,
  Flag,
  GitBranch,
  Webhook,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import * as React from "react";

import { STEP_TYPE_MAP } from "@/components/workflow/definition-io";
import type { StepNodeData } from "@/components/workflow/definition-io";
import { cn } from "@/lib/utils";

const STEP_ICONS: Record<string, LucideIcon> = {
  AGENT_TASK: Bot,
  APPROVAL: CheckSquare,
  CONDITION: GitBranch,
  DELAY: Clock,
  END: Flag,
  MEMORY: Database,
  START: CircleDot,
  TOOL_CALL: Wrench,
  WEBHOOK: Webhook,
};

/** Single generic node renderer — styled by step type via design tokens. */
export const StepNodeComponent = React.memo(function StepNodeComponent({
  data,
  selected,
}: NodeProps & { data: StepNodeData }) {
  const step = data.step;
  const meta = STEP_TYPE_MAP.get(step.type);
  const Icon = STEP_ICONS[step.type] ?? Wrench;
  const accent = `hsl(var(${meta?.colorVar ?? "--chart-1"}))`;

  const configText = (key: string): string => {
    const value = step.config[key];
    return typeof value === "string" ? value : "";
  };

  const subtitle =
    step.type === "TOOL_CALL"
      ? configText("toolName")
      : step.type === "CONDITION"
        ? configText("expression")
        : step.type === "AGENT_TASK"
          ? configText("promptTemplate")
          : (meta?.label ?? step.type);

  return (
    <div
      className={cn(
        "w-56 rounded-lg border bg-card shadow-sm transition-shadow",
        selected && "ring-2 ring-ring",
      )}
    >
      {step.type !== "START" ? (
        <Handle className="!size-2.5 !bg-muted-foreground" position={Position.Left} type="target" />
      ) : null}
      <div className="flex items-center gap-2 px-3 py-2">
        <span
          className="flex size-7 shrink-0 items-center justify-center rounded-md"
          style={{
            backgroundColor: `color-mix(in srgb, ${accent} 15%, transparent)`,
            color: accent,
          }}
        >
          <Icon aria-hidden className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold">{step.name}</p>
          <p className="truncate text-[10px] text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {step.type !== "END" ? (
        <Handle
          className="!size-2.5 !bg-muted-foreground"
          position={Position.Right}
          type="source"
        />
      ) : null}
    </div>
  );
});
