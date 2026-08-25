"use client";

import { FileJson, History, Play, Save } from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { PageSpinner } from "@/components/patterns/loading";
import { PageHeader } from "@/components/patterns/page-header";
import { EMPTY_DEFINITION, validateDefinition } from "@/components/workflow/definition-io";
import { RunWorkflowDialog } from "@/components/workflow/run-workflow-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSaveWorkflow, useWorkflows } from "@/hooks/use-api";
import type { Workflow, WorkflowDefinition } from "@/lib/api/types";
import { formatDateTime } from "@/lib/format";

// React Flow + the canvas are heavy — load only on this route, client-side.
const BuilderCanvas = dynamic(
  () => import("@/components/workflow/builder-canvas").then((mod) => mod.BuilderCanvas),
  { loading: () => <PageSpinner />, ssr: false },
);

// Monaco is ~2 MB — only load when the JSON editor dialog opens.
const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  loading: () => <PageSpinner />,
  ssr: false,
});

interface VersionSnapshot {
  takenAt: string;
  label: string;
  definition: WorkflowDefinition;
}

function BuilderContent() {
  const searchParams = useSearchParams();
  const workflowId = searchParams.get("id");
  const workflowsQuery = useWorkflows();

  // Derive the template from the query — the keyed workspace below remounts
  // whenever a different template (or none) is selected, so no sync effect.
  const loadedWorkflow = workflowId
    ? (workflowsQuery.data ?? []).find((item) => item.id === workflowId)
    : undefined;

  if (workflowId && workflowsQuery.isLoading) {
    return <PageSpinner />;
  }

  return (
    <BuilderWorkspace
      initialDefinition={loadedWorkflow?.definition ?? EMPTY_DEFINITION}
      key={loadedWorkflow?.id ?? "blank"}
      loadedWorkflow={loadedWorkflow}
      workflowId={workflowId}
    />
  );
}

interface BuilderWorkspaceProps {
  initialDefinition: WorkflowDefinition;
  loadedWorkflow: Workflow | undefined;
  workflowId: string | null;
}

function BuilderWorkspace({
  initialDefinition,
  loadedWorkflow,
  workflowId,
}: BuilderWorkspaceProps) {
  const router = useRouter();
  const saveWorkflow = useSaveWorkflow();
  const loadedName = loadedWorkflow?.name ?? "Untitled workflow";
  const [definition, setDefinition] = React.useState<WorkflowDefinition>(initialDefinition);
  const [versions, setVersions] = React.useState<VersionSnapshot[]>([]);
  const [jsonOpen, setJsonOpen] = React.useState(false);
  const [jsonDraft, setJsonDraft] = React.useState("");
  const [saveOpen, setSaveOpen] = React.useState(false);
  const [saveName, setSaveName] = React.useState(loadedName);
  const [saveDescription, setSaveDescription] = React.useState(loadedWorkflow?.description ?? "");
  // Saved workflow the "Run" dialog is collecting inputs for (Save & run flow).
  const [runTarget, setRunTarget] = React.useState<Workflow | null>(null);
  const latestDefinition = React.useRef<WorkflowDefinition>(initialDefinition);

  const persist = (onSaved: (workflow: Workflow) => void) => {
    const current = latestDefinition.current;
    const errors = validateDefinition(current).filter((issue) => issue.severity === "error");
    if (errors.length > 0) {
      toast.error(
        `Cannot save: ${String(errors.length)} validation error(s). Run Validate to see them.`,
      );
      return;
    }
    saveWorkflow.mutate(
      {
        definition: current,
        description: saveDescription,
        id: workflowId ?? undefined,
        name: saveName.trim() || "Untitled workflow",
      },
      { onSuccess: onSaved },
    );
  };

  const handleSave = () => {
    persist((workflow) => {
      setSaveOpen(false);
      if (!workflowId) {
        router.push(`/workflows/builder?id=${workflow.id}`);
      }
    });
  };

  // Save & run: persist what's on the canvas, then collect inputs and execute
  // — so the run always matches exactly what the user sees.
  const handleSaveAndRun = () => {
    persist((workflow) => {
      setSaveOpen(false);
      setRunTarget(workflow);
    });
  };

  const handleChange = React.useCallback((next: WorkflowDefinition) => {
    latestDefinition.current = next;
  }, []);

  const handleSnapshot = () => {
    const current = latestDefinition.current;
    const issues = validateDefinition(current).filter((issue) => issue.severity === "error");
    setVersions((existing) => [
      {
        definition: current,
        label: `v${String(existing.length + 1)}${issues.length > 0 ? " (has errors)" : ""}`,
        takenAt: new Date().toISOString(),
      },
      ...existing,
    ]);
    toast.success("Snapshot saved to version history");
  };

  const handleRestore = (snapshot: VersionSnapshot) => {
    setDefinition(snapshot.definition);
    latestDefinition.current = snapshot.definition;
    toast.success(`Restored ${snapshot.label}`);
  };

  const openJsonEditor = () => {
    setJsonDraft(JSON.stringify(latestDefinition.current, null, 2));
    setJsonOpen(true);
  };

  const applyJson = () => {
    try {
      const parsed = JSON.parse(jsonDraft) as WorkflowDefinition;
      if (!Array.isArray(parsed.steps) || !Array.isArray(parsed.connections)) {
        throw new Error("Definition must contain steps[] and connections[]");
      }
      setDefinition(parsed);
      latestDefinition.current = parsed;
      setJsonOpen(false);
      toast.success("Definition imported");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invalid JSON definition");
    }
  };

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(latestDefinition.current, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${loadedName.toLowerCase().replaceAll(/\s+/g, "-")}.workflow.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        actions={
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <History /> Versions
                  {versions.length > 0 ? (
                    <Badge variant="secondary">{versions.length}</Badge>
                  ) : null}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>Local version history</DropdownMenuLabel>
                {versions.length === 0 ? (
                  <DropdownMenuItem disabled>No snapshots yet</DropdownMenuItem>
                ) : (
                  versions.map((snapshot) => (
                    <DropdownMenuItem
                      key={snapshot.takenAt}
                      onClick={() => {
                        handleRestore(snapshot);
                      }}
                    >
                      <span className="flex-1">{snapshot.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(snapshot.takenAt)}
                      </span>
                    </DropdownMenuItem>
                  ))
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSnapshot}>
                  <Save /> Snapshot current state
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button onClick={openJsonEditor} variant="outline">
              <FileJson /> Edit JSON
            </Button>
            <Button onClick={handleExport} variant="outline">
              Export
            </Button>
            <Button
              onClick={() => {
                setSaveName(loadedName);
                setSaveOpen(true);
              }}
              variant="outline"
            >
              <Save /> {workflowId ? "Save changes" : "Save workflow"}
            </Button>
            <Button disabled={saveWorkflow.isPending} onClick={handleSaveAndRun}>
              <Play /> {saveWorkflow.isPending ? "Saving…" : "Save & run"}
            </Button>
          </>
        }
        description={
          workflowId
            ? `Editing "${loadedName}". Click a step to edit its settings; Save & run executes exactly what you see.`
            : "Design a workflow visually: add steps, click one to configure it, connect them, then Save & run."
        }
        title="Workflow builder"
      />

      <div className="h-[calc(100vh-240px)] min-h-120">
        <BuilderCanvas className="h-full" definition={definition} onChange={handleChange} />
      </div>

      <RunWorkflowDialog
        onOpenChange={(open) => {
          if (open) return;
          // Dialog dismissed without running: keep editing the saved copy so
          // the URL reflects what was just persisted.
          if (!workflowId && runTarget) {
            router.push(`/workflows/builder?id=${runTarget.id}`);
          }
          setRunTarget(null);
        }}
        workflow={runTarget}
      />

      <Dialog onOpenChange={setJsonOpen} open={jsonOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Definition JSON</DialogTitle>
            <DialogDescription>
              The exact steps + connections document the execution engine consumes.
            </DialogDescription>
          </DialogHeader>
          <div className="h-105 overflow-hidden rounded-md border">
            <MonacoEditor
              defaultLanguage="json"
              onChange={(value) => {
                setJsonDraft(value ?? "");
              }}
              options={{
                fontSize: 12,
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                wordWrap: "on",
              }}
              theme="vs-dark"
              value={jsonDraft}
            />
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                setJsonOpen(false);
              }}
              variant="outline"
            >
              Cancel
            </Button>
            <Button onClick={applyJson}>Apply to canvas</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={setSaveOpen} open={saveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{workflowId ? "Save changes" : "Save workflow"}</DialogTitle>
            <DialogDescription>
              {workflowId
                ? "Saving creates a new immutable version of this workflow."
                : "Persist this workflow so it can be run, versioned, and shared across your organization."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="save-name">Name</Label>
              <Input
                id="save-name"
                onChange={(event) => {
                  setSaveName(event.target.value);
                }}
                value={saveName}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="save-description">Description</Label>
              <Textarea
                id="save-description"
                onChange={(event) => {
                  setSaveDescription(event.target.value);
                }}
                placeholder="What does this workflow automate?"
                value={saveDescription}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => {
                setSaveOpen(false);
              }}
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={saveWorkflow.isPending} onClick={handleSave}>
              {saveWorkflow.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function BuilderPage() {
  return (
    <React.Suspense fallback={<PageSpinner />}>
      <BuilderContent />
    </React.Suspense>
  );
}
