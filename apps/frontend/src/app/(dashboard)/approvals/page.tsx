"use client";

import { Check, CheckSquare, Clock, GitPullRequestArrow, ShieldAlert, X } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { JsonBlock } from "@/components/patterns/code-block";
import { EmptyState } from "@/components/patterns/empty-state";
import { ErrorState } from "@/components/patterns/error-state";
import { TableSkeleton } from "@/components/patterns/loading";
import { PageHeader } from "@/components/patterns/page-header";
import { StatusBadge } from "@/components/patterns/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useApprovals,
  useDecideApproval,
  useDecideWorkflowApproval,
  useToolHistory,
  useWorkflowApprovals,
} from "@/hooks/use-api";
import { formatRelative, shortId } from "@/lib/format";

export default function ApprovalsPage() {
  const approvalsQuery = useApprovals();
  const historyQuery = useToolHistory();
  const decide = useDecideApproval();
  const workflowApprovalsQuery = useWorkflowApprovals();
  const decideWorkflow = useDecideWorkflowApproval();

  const approvals = approvalsQuery.data ?? [];
  const workflowApprovals = workflowApprovalsQuery.data ?? [];
  const recentDecisions = (historyQuery.data ?? [])
    .filter((record) => record.status === "REJECTED" || record.status === "COMPLETED")
    .slice(0, 10);

  return (
    <>
      <PageHeader
        description="Human-in-the-loop control point. Workflow approval steps and policy-gated tool executions pause here until someone decides."
        title="Approvals"
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitPullRequestArrow aria-hidden className="size-4" /> Workflow approvals
          </CardTitle>
          <CardDescription>
            Executions paused at an approval step. Approving resumes the run from its checkpoint;
            rejecting fails it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {workflowApprovalsQuery.isLoading ? (
            <TableSkeleton rows={2} />
          ) : workflowApprovals.length === 0 ? (
            <EmptyState
              className="border-0 py-8"
              description="Workflow runs that reach an approval node will appear here."
              icon={CheckSquare}
              title="No pending workflow approvals"
            />
          ) : (
            <div className="space-y-3">
              {workflowApprovals.map((approval) => (
                <div
                  className="flex flex-col gap-3 rounded-lg border border-warning/40 p-4 sm:flex-row sm:items-center sm:justify-between"
                  key={approval.id}
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">
                        {typeof approval.payload["message"] === "string"
                          ? approval.payload["message"]
                          : `Approval at step "${approval.stepId}"`}
                      </span>
                      {approval.status === "ESCALATED" ? (
                        <Badge variant="destructive">
                          <Clock /> SLA breached
                        </Badge>
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Requested {formatRelative(approval.requestedAt)} · execution{" "}
                      <Link
                        className="text-primary underline-offset-2 hover:underline"
                        href={`/executions/${approval.executionId}`}
                      >
                        {shortId(approval.executionId)}
                      </Link>{" "}
                      · SLA {String(approval.slaMinutes)}m
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      disabled={decideWorkflow.isPending}
                      onClick={() => {
                        decideWorkflow.mutate({ action: "REJECT", id: approval.id });
                      }}
                      size="sm"
                      variant="outline"
                    >
                      <X /> Reject
                    </Button>
                    <Button
                      disabled={decideWorkflow.isPending}
                      onClick={() => {
                        decideWorkflow.mutate({ action: "APPROVE", id: approval.id });
                      }}
                      size="sm"
                    >
                      <Check /> Approve
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <h2 className="pt-2 text-sm font-semibold text-muted-foreground">Tool approvals</h2>

      {approvalsQuery.isError ? (
        <ErrorState error={approvalsQuery.error} onRetry={() => void approvalsQuery.refetch()} />
      ) : approvalsQuery.isLoading ? (
        <TableSkeleton rows={3} />
      ) : approvals.length === 0 ? (
        <EmptyState
          description="Individual tool executions gated by policy pause here (separate from workflow approval steps above)."
          icon={CheckSquare}
          title="No pending tool approvals"
        />
      ) : (
        <div className="space-y-4">
          {approvals.map((approval) => (
            <Card className="border-warning/40" key={approval.id}>
              <CardHeader className="flex-row items-start justify-between space-y-0">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2">
                    <ShieldAlert aria-hidden className="size-4 text-warning" />
                    {approval.toolName}
                  </CardTitle>
                  <CardDescription>
                    Requested {formatRelative(approval.createdAt)} · execution{" "}
                    {shortId(approval.id)}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    disabled={decide.isPending}
                    onClick={() => {
                      decide.mutate({ action: "REJECT", id: approval.id });
                    }}
                    size="sm"
                    variant="outline"
                  >
                    <X /> Reject
                  </Button>
                  <Button
                    disabled={decide.isPending}
                    onClick={() => {
                      decide.mutate({ action: "APPROVE", id: approval.id });
                    }}
                    size="sm"
                  >
                    <Check /> Approve
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Requested arguments
                </p>
                <JsonBlock maxHeight={200} value={approval.arguments} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recent decisions</CardTitle>
          <CardDescription>
            Latest tool executions that passed through the approval pipeline.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {historyQuery.isLoading ? (
            <TableSkeleton rows={4} />
          ) : recentDecisions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No decided executions yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tool</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead className="hidden sm:table-cell">When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentDecisions.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="font-medium">{record.toolName}</TableCell>
                    <TableCell>
                      <StatusBadge status={record.status} />
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                      {formatRelative(record.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
