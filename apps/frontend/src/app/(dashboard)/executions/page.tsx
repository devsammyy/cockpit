"use client";

import { ListTree, Play } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { EmptyState } from "@/components/patterns/empty-state";
import { ErrorState } from "@/components/patterns/error-state";
import { TableSkeleton } from "@/components/patterns/loading";
import { PageHeader } from "@/components/patterns/page-header";
import { StatusBadge } from "@/components/patterns/status-badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useExecutions } from "@/hooks/use-api";
import {
  formatCompact,
  formatCostMicroUsd,
  formatDuration,
  formatRelative,
  shortId,
} from "@/lib/format";

const STATUS_FILTERS = ["ALL", "RUNNING", "COMPLETED", "FAILED", "PENDING"] as const;

export default function ExecutionsPage() {
  const router = useRouter();
  const executionsQuery = useExecutions();
  const [statusFilter, setStatusFilter] = React.useState<(typeof STATUS_FILTERS)[number]>("ALL");

  const executions = (executionsQuery.data ?? []).filter(
    (execution) => statusFilter === "ALL" || execution.status === statusFilter,
  );

  return (
    <>
      <PageHeader
        actions={
          <Button asChild>
            <Link href="/workflows?run=1">
              <Play /> Run a goal
            </Link>
          </Button>
        }
        description="Every workflow run in this organization — live status, token consumption, and cost. Running executions refresh automatically."
        title="Executions"
      />

      <div className="flex items-center gap-2">
        <Select
          onValueChange={(value) => {
            setStatusFilter(value as (typeof STATUS_FILTERS)[number]);
          }}
          value={statusFilter}
        >
          <SelectTrigger aria-label="Filter by status" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((status) => (
              <SelectItem key={status} value={status}>
                {status === "ALL" ? "All statuses" : status.toLowerCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">
          {executions.length} execution{executions.length === 1 ? "" : "s"}
        </span>
      </div>

      {executionsQuery.isError ? (
        <ErrorState error={executionsQuery.error} onRetry={() => void executionsQuery.refetch()} />
      ) : executionsQuery.isLoading ? (
        <TableSkeleton rows={8} />
      ) : executions.length === 0 ? (
        <EmptyState
          action={
            <Button asChild size="sm">
              <Link href="/workflows?run=1">Run your first goal</Link>
            </Button>
          }
          description="Runs appear here the moment the engine starts executing a workflow."
          icon={ListTree}
          title="No executions found"
        />
      ) : (
        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Execution</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Started</TableHead>
                <TableHead className="hidden lg:table-cell">Duration</TableHead>
                <TableHead className="hidden sm:table-cell">Tokens</TableHead>
                <TableHead className="hidden sm:table-cell">Cost</TableHead>
                <TableHead className="hidden xl:table-cell">Trigger</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {executions.map((execution) => (
                <TableRow
                  className="cursor-pointer"
                  key={execution.id}
                  onClick={() => {
                    router.push(`/executions/${execution.id}`);
                  }}
                >
                  <TableCell>
                    <Link
                      className="font-mono text-xs font-medium text-primary underline-offset-2 hover:underline"
                      href={`/executions/${execution.id}`}
                      onClick={(event) => {
                        event.stopPropagation();
                      }}
                    >
                      {shortId(execution.id, 12)}
                    </Link>
                    {typeof execution.input["goal"] === "string" ? (
                      <p className="mt-0.5 max-w-md truncate text-xs text-muted-foreground">
                        {execution.input["goal"]}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={execution.status} />
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                    {formatRelative(execution.startedAt ?? execution.createdAt)}
                  </TableCell>
                  <TableCell className="hidden text-sm tabular-nums lg:table-cell">
                    {formatDuration(execution.totalDurationMs)}
                  </TableCell>
                  <TableCell className="hidden text-sm tabular-nums sm:table-cell">
                    {formatCompact(execution.totalTokensUsed)}
                  </TableCell>
                  <TableCell className="hidden text-sm tabular-nums sm:table-cell">
                    {formatCostMicroUsd(execution.totalCostEstimate)}
                  </TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground xl:table-cell">
                    {execution.triggerType.toLowerCase()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
