"use client";

import {
  CheckCircle2,
  ChevronRight,
  Loader2,
  Paperclip,
  PencilRuler,
  Play,
  ShieldCheck,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { deriveWorkflowInputs } from "@/components/workflow/derive-inputs";
import { summarizeStepConfig } from "@/components/workflow/step-summary";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { extractFileText } from "@/lib/text/extract-file-text";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useStartWorkflow } from "@/hooks/use-api";
import type { Workflow } from "@/lib/api/types";

const MAX_FILE_BYTES = 15_000_000; // 15 MB — resumes as PDFs can be a few MB each
const ACCEPTED_FILES = ".pdf,.txt,.md,.csv,.json,.yaml,.yml,.log,.html,.xml,.rtf";

/** Per-field record of what files contributed and what the filter removed. */
interface AttachState {
  fileNames: string[];
  removed: string[];
}

interface RunWorkflowDialogProps {
  workflow: Workflow | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * "Run workflow" for everyday operators: the dialog reads the workflow's
 * definition, figures out which inputs its prompts reference, and presents one
 * friendly field per input — paste text or attach a file. No JSON required.
 * A "what this workflow will do" disclosure lists every step's configuration
 * so nothing is hidden at run time.
 */
export function RunWorkflowDialog({ workflow, onOpenChange }: RunWorkflowDialogProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={Boolean(workflow)}>
      <DialogContent className="max-w-xl">
        {workflow ? (
          // Keyed by workflow so switching targets remounts with fresh state.
          <RunWorkflowForm key={workflow.id} onOpenChange={onOpenChange} workflow={workflow} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function RunWorkflowForm({
  workflow,
  onOpenChange,
}: {
  workflow: Workflow;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const startWorkflow = useStartWorkflow();
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [attached, setAttached] = React.useState<Record<string, AttachState>>({});
  const [extracting, setExtracting] = React.useState<Record<string, boolean>>({});
  const fileInputs = React.useRef<Record<string, HTMLInputElement | null>>({});

  const fields = React.useMemo(() => deriveWorkflowInputs(workflow.definition), [workflow]);
  const visibleSteps = workflow.definition.steps.filter(
    (step) => step.type !== "START" && step.type !== "END",
  );

  const missing = fields.filter((field) => !(values[field.key] ?? "").trim());
  const isExtracting = Object.values(extracting).some(Boolean);
  const canRun = missing.length === 0 && !startWorkflow.isPending && !isExtracting;

  // Extract text from one or more attached files, sanitize each, and merge them
  // into the field — separated by a per-file heading so the AI can tell
  // candidates apart. Multiple selections append to what's already there.
  const handleAttach = async (key: string, label: string, files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    const tooBig = list.find((file) => file.size > MAX_FILE_BYTES);
    if (tooBig) {
      toast.error("File too large", { description: `"${tooBig.name}" exceeds 15 MB.` });
      return;
    }

    setExtracting((prev) => ({ ...prev, [key]: true }));
    try {
      const results = await Promise.allSettled(list.map((file) => extractFileText(file)));
      const ok = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
      const failed = results.flatMap((r) => (r.status === "rejected" ? [r.reason as Error] : []));
      for (const error of failed) {
        toast.error(error.message);
      }
      if (ok.length === 0) return;

      // One heading per file when several are attached, so candidates are
      // clearly delimited in a single field.
      const merged = ok
        .map((file) =>
          list.length > 1 || ok.length > 1 ? `=== ${file.name} ===\n${file.text}` : file.text,
        )
        .join("\n\n");

      setValues((prev) => {
        const existing = (prev[key] ?? "").trim();
        return { ...prev, [key]: existing ? `${existing}\n\n${merged}` : merged };
      });
      setAttached((prev) => {
        const current = prev[key] ?? { fileNames: [], removed: [] };
        return {
          ...prev,
          [key]: {
            fileNames: [...current.fileNames, ...ok.map((file) => file.name)],
            removed: [...current.removed, ...ok.flatMap((file) => file.removed)],
          },
        };
      });

      const filteredCount = ok.reduce((sum, file) => sum + file.removed.length, 0);
      toast.success(
        `Added ${String(ok.length)} file${ok.length === 1 ? "" : "s"} to ${label}`,
        filteredCount > 0
          ? { description: "Hidden keyword-stuffing / instruction text was filtered out." }
          : undefined,
      );
    } finally {
      setExtracting((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleRun = () => {
    const input = Object.fromEntries(fields.map((field) => [field.key, values[field.key] ?? ""]));
    startWorkflow.mutate(
      { input, workflowId: workflow.id },
      {
        onSuccess: (result) => {
          toast.success("Workflow started", { description: workflow.name });
          onOpenChange(false);
          router.push(`/executions/${result.executionId}`);
        },
      },
    );
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Play aria-hidden className="size-4 text-primary" /> Run “{workflow.name}”
        </DialogTitle>
        <DialogDescription>
          {fields.length > 0
            ? "Fill in what this workflow needs — paste text or attach a file — and it runs immediately."
            : "This workflow needs no input. Start it and watch every step live."}
        </DialogDescription>
      </DialogHeader>

      {fields.length > 0 ? (
        <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1">
          {fields.map((field) => {
            const state = attached[field.key];
            const busy = extracting[field.key];
            return (
              <div className="space-y-1.5" key={field.key}>
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor={`run-input-${field.key}`}>{field.label}</Label>
                  <input
                    accept={ACCEPTED_FILES}
                    className="hidden"
                    multiple
                    onChange={(event) => {
                      void handleAttach(field.key, field.label, event.target.files);
                      event.target.value = "";
                    }}
                    ref={(el) => {
                      fileInputs.current[field.key] = el;
                    }}
                    type="file"
                  />
                  <Button
                    disabled={busy}
                    onClick={() => fileInputs.current[field.key]?.click()}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    {busy ? <Loader2 className="animate-spin" /> : <Paperclip />}
                    {busy ? "Reading…" : "Attach files (PDF/text)"}
                  </Button>
                </div>
                <Textarea
                  className="min-h-24"
                  id={`run-input-${field.key}`}
                  onChange={(event) => {
                    setValues((prev) => ({ ...prev, [field.key]: event.target.value }));
                    // Manual edits invalidate the attachment provenance.
                    setAttached((prev) =>
                      field.key in prev
                        ? Object.fromEntries(
                            Object.entries(prev).filter(([name]) => name !== field.key),
                          )
                        : prev,
                    );
                  }}
                  placeholder={`Paste ${field.label.toLowerCase()} here, or attach PDF / text files…`}
                  value={values[field.key] ?? ""}
                />
                {state && state.fileNames.length > 0 ? (
                  <div className="space-y-1">
                    <p className="inline-flex flex-wrap items-center gap-1 text-xs text-primary">
                      <CheckCircle2 className="size-3" />
                      {state.fileNames.length} file{state.fileNames.length === 1 ? "" : "s"}:{" "}
                      {state.fileNames.join(", ")}
                    </p>
                    {state.removed.length > 0 ? (
                      <p className="inline-flex items-start gap-1 text-xs text-muted-foreground">
                        <ShieldCheck className="mt-0.5 size-3 shrink-0 text-warning" />
                        Filtered for safety: {Array.from(new Set(state.removed)).join("; ")}.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Used by {field.usedBy.join(", ")}</p>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          <Zap aria-hidden className="size-4 shrink-0 text-primary" />
          Everything this workflow needs is already in its definition.
        </div>
      )}

      <details className="group rounded-lg border border-border bg-muted/20">
        <summary className="flex cursor-pointer select-none items-center gap-2 px-3 py-2.5 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
          <ChevronRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90" />
          What this workflow will do
          <span className="text-xs font-normal text-muted-foreground">
            ({String(visibleSteps.length)} steps — full configuration, nothing hidden)
          </span>
        </summary>
        <div className="space-y-2.5 border-t border-border px-3 py-3">
          {visibleSteps.map((step, index) => {
            const facts = summarizeStepConfig(step);
            return (
              <div className="flex items-start gap-2.5" key={step.id}>
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[0.65rem] font-semibold text-muted-foreground">
                  {index + 1}
                </span>
                <div className="min-w-0 space-y-1">
                  <p className="text-sm leading-tight">
                    <span className="font-medium">{step.name}</span>{" "}
                    <Badge className="ml-1 align-middle" variant="secondary">
                      {step.type.replaceAll("_", " ").toLowerCase()}
                    </Badge>
                  </p>
                  {facts.length > 0 ? (
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {facts.join(" · ")}
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
          <div className="pt-1">
            <Button asChild size="sm" variant="outline">
              <Link href={`/workflows/builder?id=${workflow.id}`}>
                <PencilRuler /> Edit configuration in builder
              </Link>
            </Button>
          </div>
        </div>
      </details>

      <DialogFooter className="gap-2 sm:gap-0">
        <Button
          onClick={() => {
            onOpenChange(false);
          }}
          type="button"
          variant="outline"
        >
          Cancel
        </Button>
        <Button disabled={!canRun} onClick={handleRun} type="button">
          <Play />
          {startWorkflow.isPending
            ? "Starting…"
            : missing.length > 0
              ? `Fill ${String(missing.length)} field${missing.length === 1 ? "" : "s"} to run`
              : "Run workflow"}
        </Button>
      </DialogFooter>
    </>
  );
}
