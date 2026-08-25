"use client";

import { Download, PencilRuler, Play, Plus, Search, Workflow as WorkflowIcon } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import * as React from "react";

import { EmptyState } from "@/components/patterns/empty-state";
import { ErrorState } from "@/components/patterns/error-state";
import { PageHeader } from "@/components/patterns/page-header";
import { StatusBadge } from "@/components/patterns/status-badge";
import { RunGoalDialog } from "@/components/workflow/run-goal-dialog";
import { RunWorkflowDialog } from "@/components/workflow/run-workflow-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useSeedTemplates, useWorkflows } from "@/hooks/use-api";
import type { Workflow } from "@/lib/api/types";
import { formatRelative } from "@/lib/format";

function WorkflowsContent() {
  const searchParams = useSearchParams();
  const workflowsQuery = useWorkflows();
  const seedTemplates = useSeedTemplates();
  const [runOpen, setRunOpen] = React.useState(searchParams.get("run") === "1");
  const [filter, setFilter] = React.useState("");
  // Which workflow the "Run workflow" dialog is collecting inputs for.
  const [runTarget, setRunTarget] = React.useState<Workflow | null>(null);

  const workflows = (workflowsQuery.data ?? []).filter(
    (workflow) =>
      workflow.name.toLowerCase().includes(filter.toLowerCase()) ||
      workflow.description.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <>
      <PageHeader
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/workflows/builder">
                <PencilRuler /> Open builder
              </Link>
            </Button>
            <Button
              onClick={() => {
                setRunOpen(true);
              }}
            >
              <Plus /> Run a goal
            </Button>
          </>
        }
        description="Reusable automation blueprints. Run one-off goals with the AI planner, or design workflows visually in the builder."
        title="Workflows"
      />

      <div className="relative max-w-sm">
        <Search
          aria-hidden
          className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          aria-label="Filter workflows"
          className="pl-8"
          onChange={(event) => {
            setFilter(event.target.value);
          }}
          placeholder="Filter workflows…"
          value={filter}
        />
      </div>

      {workflowsQuery.isError ? (
        <ErrorState error={workflowsQuery.error} onRetry={() => void workflowsQuery.refetch()} />
      ) : workflowsQuery.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton className="h-44 w-full" key={index} />
          ))}
        </div>
      ) : workflows.length === 0 ? (
        <EmptyState
          action={
            (workflowsQuery.data ?? []).length === 0 ? (
              <Button
                disabled={seedTemplates.isPending}
                onClick={() => {
                  seedTemplates.mutate();
                }}
                size="sm"
              >
                <Download />
                {seedTemplates.isPending ? "Seeding…" : "Seed enterprise templates"}
              </Button>
            ) : undefined
          }
          description={
            (workflowsQuery.data ?? []).length === 0
              ? "Seed the built-in enterprise template library to get started, or run a goal and let the planner create one."
              : "No workflows match your filter."
          }
          icon={WorkflowIcon}
          title={(workflowsQuery.data ?? []).length === 0 ? "No workflows yet" : "No matches"}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {workflows.map((workflow) => {
            const stepTypes = new Set(workflow.definition.steps.map((step) => step.type));
            return (
              <Card className="flex flex-col" key={workflow.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="leading-snug">{workflow.name}</CardTitle>
                    <StatusBadge status={workflow.status} />
                  </div>
                  <CardDescription className="line-clamp-2">{workflow.description}</CardDescription>
                </CardHeader>
                <CardContent className="mt-auto space-y-3">
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from(stepTypes)
                      .filter((type) => type !== "START" && type !== "END")
                      .map((type) => (
                        <Badge key={type} variant="secondary">
                          {type.replaceAll("_", " ").toLowerCase()}
                        </Badge>
                      ))}
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="min-w-0 truncate">
                      {workflow.definition.steps.length} steps · updated{" "}
                      {formatRelative(workflow.updatedAt)}
                    </span>
                    <div className="flex shrink-0 gap-1.5">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/workflows/builder?id=${workflow.id}`}>Open</Link>
                      </Button>
                      <Button
                        onClick={() => {
                          setRunTarget(workflow);
                        }}
                        size="sm"
                      >
                        <Play /> Run
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <RunGoalDialog onOpenChange={setRunOpen} open={runOpen} />
      <RunWorkflowDialog
        onOpenChange={(open) => {
          if (!open) setRunTarget(null);
        }}
        workflow={runTarget}
      />
    </>
  );
}

export default function WorkflowsPage() {
  return (
    <React.Suspense>
      <WorkflowsContent />
    </React.Suspense>
  );
}
