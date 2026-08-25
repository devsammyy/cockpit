"use client";

import { ChevronRight, Trash2 } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { STEP_TYPE_MAP } from "@/components/workflow/definition-io";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useModels, useToolCatalog } from "@/hooks/use-api";
import type { WorkflowStep } from "@/lib/api/types";
import { cn } from "@/lib/utils";

const DEFAULT_MODEL = "__default__";
const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const MEMORY_OPERATIONS = ["retrieve", "store"];

interface StepConfigSheetProps {
  step: WorkflowStep | null;
  onSave: (updated: { name: string; config: Record<string, unknown> }) => void;
  onDelete: () => void;
  onClose: () => void;
}

function readString(config: Record<string, unknown>, key: string): string {
  const value = config[key];
  return typeof value === "string" ? value : "";
}

function readNumber(config: Record<string, unknown>, key: string): number | "" {
  const value = config[key];
  return typeof value === "number" ? value : "";
}

function readStringArray(config: Record<string, unknown>, key: string): string[] {
  const value = config[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="text-xs leading-relaxed text-muted-foreground">{children}</p>;
}

/**
 * Form state initializes from the step via useState initializers; the parent
 * remounts it per step (key={step.id}) so no prop-sync effect is needed.
 * Typed fields merge into the existing config on save, so keys the form does
 * not know about (retry policies, custom fields) are preserved — and the
 * "Advanced" section always shows the complete raw JSON, nothing hidden.
 */
function StepConfigForm({
  step,
  onSave,
  onDelete,
  onClose,
}: {
  step: WorkflowStep;
  onSave: StepConfigSheetProps["onSave"];
  onDelete: () => void;
  onClose: () => void;
}) {
  const [name, setName] = React.useState(step.name);
  const [config, setConfig] = React.useState<Record<string, unknown>>(step.config);
  const [argsDraft, setArgsDraft] = React.useState(() =>
    JSON.stringify(step.config["arguments"] ?? {}, null, 2),
  );
  const [jsonDraft, setJsonDraft] = React.useState<string | null>(null);

  const modelsQuery = useModels();
  const toolsQuery = useToolCatalog();

  const patch = (key: string, value: unknown) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setJsonDraft(null);
  };
  const unset = (key: string) => {
    setConfig((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => k !== key)));
    setJsonDraft(null);
  };

  const handleSave = () => {
    let next = config;
    if (step.type === "TOOL_CALL") {
      try {
        next = { ...next, arguments: JSON.parse(argsDraft) as Record<string, unknown> };
      } catch {
        toast.error("Tool arguments must be valid JSON");
        return;
      }
    }
    onSave({ config: next, name: name.trim() || step.name });
  };

  const applyJsonDraft = () => {
    if (jsonDraft === null) return;
    try {
      const parsed = JSON.parse(jsonDraft) as Record<string, unknown>;
      setConfig(parsed);
      setArgsDraft(JSON.stringify(parsed["arguments"] ?? {}, null, 2));
      setJsonDraft(null);
      toast.success("Raw configuration applied");
    } catch {
      toast.error("Raw configuration must be valid JSON");
    }
  };

  const selectedTools = readStringArray(config, "tools");
  const catalogTools = toolsQuery.data ?? [];
  // Show tools referenced by the step even if the catalog doesn't list them,
  // so nothing silently disappears from view.
  const extraTools = selectedTools.filter(
    (tool) => !catalogTools.some((item) => item.name === tool),
  );

  const toggleTool = (toolName: string) => {
    const next = selectedTools.includes(toolName)
      ? selectedTools.filter((item) => item !== toolName)
      : [...selectedTools, toolName];
    if (next.length === 0) unset("tools");
    else patch("tools", next);
  };

  const hasTypedFields = !["START", "END"].includes(step.type);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto py-2 pr-1">
      <div className="space-y-1.5">
        <Label htmlFor="step-name">Step name</Label>
        <Input
          id="step-name"
          onChange={(event) => {
            setName(event.target.value);
          }}
          value={name}
        />
      </div>

      {step.type === "AGENT_TASK" ? (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="agent-prompt">What should the agent do?</Label>
            <Textarea
              className="min-h-28"
              id="agent-prompt"
              onChange={(event) => {
                patch("promptTemplate", event.target.value);
              }}
              placeholder="e.g. Evaluate each candidate in {{ input.candidates }} against {{ input.requirements }}."
              value={readString(config, "promptTemplate")}
            />
            <FieldHint>
              Use <code>{"{{ input.yourField }}"}</code> to ask the operator for that value when the
              workflow runs, and <code>{"{{ stepId.output }}"}</code> to reuse an earlier step's
              result.
            </FieldHint>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="agent-system">Agent persona (optional)</Label>
            <Textarea
              id="agent-system"
              onChange={(event) => {
                patch("systemPrompt", event.target.value);
              }}
              placeholder="You are an impartial technical recruiter."
              value={readString(config, "systemPrompt")}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Model</Label>
            <Select
              onValueChange={(value) => {
                if (value === DEFAULT_MODEL) unset("model");
                else patch("model", value);
              }}
              value={readString(config, "model") || DEFAULT_MODEL}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={DEFAULT_MODEL}>Workspace default (qwen-plus)</SelectItem>
                {(modelsQuery.data ?? []).map((model) => (
                  <SelectItem key={model.modelId} value={model.modelId}>
                    {model.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Tools the agent may use</Label>
            <div className="flex flex-wrap gap-1.5">
              {catalogTools.map((tool) => {
                const active = selectedTools.includes(tool.name);
                return (
                  <button
                    className={cn(
                      "rounded-md border px-2 py-1 text-xs font-medium transition-colors",
                      active
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "border-border bg-muted/40 text-muted-foreground hover:text-foreground",
                    )}
                    key={tool.name}
                    onClick={() => {
                      toggleTool(tool.name);
                    }}
                    title={tool.description}
                    type="button"
                  >
                    {tool.name}
                  </button>
                );
              })}
              {extraTools.map((tool) => (
                <button
                  className="rounded-md border border-warning/50 bg-warning/10 px-2 py-1 text-xs font-medium text-warning"
                  key={tool}
                  onClick={() => {
                    toggleTool(tool);
                  }}
                  title="Referenced by this step but not in the tool catalog"
                  type="button"
                >
                  {tool} ⚠
                </button>
              ))}
              {catalogTools.length === 0 && extraTools.length === 0 ? (
                <FieldHint>
                  No tools registered yet — the agent will answer with text only.
                </FieldHint>
              ) : null}
            </div>
          </div>
        </>
      ) : null}

      {step.type === "TOOL_CALL" ? (
        <>
          <div className="space-y-1.5">
            <Label>Tool</Label>
            <Select
              onValueChange={(value) => {
                patch("toolName", value);
              }}
              value={readString(config, "toolName") || undefined}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose a tool…" />
              </SelectTrigger>
              <SelectContent>
                {catalogTools.map((tool) => (
                  <SelectItem key={tool.name} value={tool.name}>
                    {tool.name}
                  </SelectItem>
                ))}
                {readString(config, "toolName") &&
                !catalogTools.some((tool) => tool.name === readString(config, "toolName")) ? (
                  <SelectItem value={readString(config, "toolName")}>
                    {readString(config, "toolName")} (not in catalog)
                  </SelectItem>
                ) : null}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tool-args">Arguments (JSON)</Label>
            <Textarea
              className="min-h-28 font-mono text-xs"
              id="tool-args"
              onChange={(event) => {
                setArgsDraft(event.target.value);
              }}
              spellCheck={false}
              value={argsDraft}
            />
            <FieldHint>
              Values support templates too — e.g.{" "}
              <code>{'{ "entry": "{{ extract.output }}" }'}</code>.
            </FieldHint>
          </div>
        </>
      ) : null}

      {step.type === "CONDITION" ? (
        <div className="space-y-1.5">
          <Label htmlFor="condition-expression">Branch expression</Label>
          <Textarea
            className="font-mono text-xs"
            id="condition-expression"
            onChange={(event) => {
              patch("expression", event.target.value);
            }}
            placeholder="evaluate.output.includes('yes')"
            value={readString(config, "expression")}
          />
          <FieldHint>
            Evaluates to true or false — connect one outgoing edge labelled “true” and one labelled
            “false”. Examples: <code>review.output.includes(&apos;APPROVED&apos;)</code>,{" "}
            <code>input.amount &gt; 1000</code>.
          </FieldHint>
        </div>
      ) : null}

      {step.type === "APPROVAL" ? (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="approval-message">Message shown to the approver</Label>
            <Textarea
              id="approval-message"
              onChange={(event) => {
                patch("message", event.target.value);
              }}
              placeholder="Approve payment for invoice {{ extract.output }}"
              value={readString(config, "message")}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="approval-role">Approver role</Label>
              <Input
                id="approval-role"
                onChange={(event) => {
                  patch("approverRole", event.target.value);
                }}
                placeholder="ADMIN"
                value={readString(config, "approverRole")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="approval-sla">SLA (minutes)</Label>
              <Input
                id="approval-sla"
                min={1}
                onChange={(event) => {
                  const parsed = Number(event.target.value);
                  if (event.target.value === "") unset("slaMinutes");
                  else if (!Number.isNaN(parsed)) patch("slaMinutes", parsed);
                }}
                placeholder="480"
                type="number"
                value={readNumber(config, "slaMinutes")}
              />
            </div>
          </div>
        </>
      ) : null}

      {step.type === "DELAY" ? (
        <div className="space-y-1.5">
          <Label htmlFor="delay-seconds">Wait duration (seconds)</Label>
          <Input
            id="delay-seconds"
            min={1}
            onChange={(event) => {
              const parsed = Number(event.target.value);
              if (!Number.isNaN(parsed)) patch("durationMs", Math.round(parsed * 1000));
            }}
            type="number"
            value={
              typeof config["durationMs"] === "number"
                ? Math.round(config["durationMs"] / 1000)
                : ""
            }
          />
        </div>
      ) : null}

      {step.type === "WEBHOOK" ? (
        <div className="grid grid-cols-[110px_1fr] gap-3">
          <div className="space-y-1.5">
            <Label>Method</Label>
            <Select
              onValueChange={(value) => {
                patch("method", value);
              }}
              value={readString(config, "method") || "POST"}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HTTP_METHODS.map((method) => (
                  <SelectItem key={method} value={method}>
                    {method}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="webhook-url">URL</Label>
            <Input
              id="webhook-url"
              onChange={(event) => {
                patch("url", event.target.value);
              }}
              placeholder="https://api.example.com/hooks/notify"
              value={readString(config, "url")}
            />
          </div>
        </div>
      ) : null}

      {step.type === "MEMORY" ? (
        <div className="grid grid-cols-[140px_1fr] gap-3">
          <div className="space-y-1.5">
            <Label>Operation</Label>
            <Select
              onValueChange={(value) => {
                patch("operation", value);
              }}
              value={readString(config, "operation") || "retrieve"}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MEMORY_OPERATIONS.map((operation) => (
                  <SelectItem key={operation} value={operation}>
                    {operation}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="memory-query">Query</Label>
            <Input
              id="memory-query"
              onChange={(event) => {
                patch("query", event.target.value);
              }}
              placeholder="What to look up or store"
              value={readString(config, "query")}
            />
          </div>
        </div>
      ) : null}

      {!hasTypedFields ? <FieldHint>This step needs no configuration.</FieldHint> : null}

      <details className="group rounded-lg border border-border bg-muted/20">
        <summary className="flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground [&::-webkit-details-marker]:hidden">
          <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
          Advanced: raw configuration (JSON) — everything the engine sees
        </summary>
        <div className="space-y-2 border-t border-border p-3">
          <Textarea
            className="min-h-36 font-mono text-xs"
            onChange={(event) => {
              setJsonDraft(event.target.value);
            }}
            spellCheck={false}
            value={jsonDraft ?? JSON.stringify(config, null, 2)}
          />
          {jsonDraft !== null ? (
            <div className="flex gap-2">
              <Button onClick={applyJsonDraft} size="sm" variant="outline">
                Apply JSON
              </Button>
              <Button
                onClick={() => {
                  setJsonDraft(null);
                }}
                size="sm"
                variant="ghost"
              >
                Discard edits
              </Button>
            </div>
          ) : null}
        </div>
      </details>

      <div className="flex items-center justify-between gap-2 border-t pt-4">
        <Button onClick={onDelete} size="sm" variant="destructive">
          <Trash2 /> Delete step
        </Button>
        <div className="flex gap-2">
          <Button onClick={onClose} size="sm" variant="outline">
            Cancel
          </Button>
          <Button onClick={handleSave} size="sm">
            Apply
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Node inspector: friendly, type-aware fields with a transparent raw-JSON view. */
export function StepConfigSheet({ step, onSave, onDelete, onClose }: StepConfigSheetProps) {
  const meta = step ? STEP_TYPE_MAP.get(step.type) : undefined;

  return (
    <Sheet
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      open={Boolean(step)}
    >
      <SheetContent className="flex w-full flex-col sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {meta?.label ?? step?.type}
            {meta && !meta.native ? <Badge variant="muted">pass-through in engine</Badge> : null}
          </SheetTitle>
          <SheetDescription>{meta?.description}</SheetDescription>
        </SheetHeader>

        {step ? (
          <StepConfigForm
            key={step.id}
            onClose={onClose}
            onDelete={onDelete}
            onSave={onSave}
            step={step}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
