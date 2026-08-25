"use client";

import { Database, HeartPulse, Server, Timer, Zap } from "lucide-react";
import * as React from "react";

import { PageHeader } from "@/components/patterns/page-header";
import { StatCard } from "@/components/patterns/stat-card";
import { StatusBadge } from "@/components/patterns/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useExecutions, useHealth } from "@/hooks/use-api";
import { formatDuration } from "@/lib/format";
import { aggregateExecutions } from "@/lib/insights";

function DependencyRow({
  name,
  status,
  detail,
  icon: Icon,
}: {
  name: string;
  status: string;
  detail: string;
  icon: typeof Server;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="flex size-8 items-center justify-center rounded-md bg-muted">
          <Icon aria-hidden className="size-4 text-muted-foreground" />
        </span>
        <div>
          <p className="text-sm font-medium">{name}</p>
          <p className="text-xs text-muted-foreground">{detail}</p>
        </div>
      </div>
      <StatusBadge status={status} />
    </div>
  );
}

export default function HealthPage() {
  const healthQuery = useHealth();
  const executionsQuery = useExecutions({ live: false });

  const health = healthQuery.data;
  const aggregates = aggregateExecutions(executionsQuery.data ?? []);
  const isDegraded = health?.status === "error";
  const isUnreachable = healthQuery.isError;

  return (
    <>
      <PageHeader
        description="Live status of the platform and its dependencies, refreshed every 15 seconds from the backend health probes."
        title="System Health"
      />

      {isUnreachable ? (
        <Alert variant="destructive">
          <Zap aria-hidden />
          <AlertTitle>API unreachable</AlertTitle>
          <AlertDescription>
            The console cannot reach the backend health endpoint. Check that the API is running and
            the network path (reverse proxy) is healthy.
          </AlertDescription>
        </Alert>
      ) : isDegraded ? (
        <Alert variant="destructive">
          <Zap aria-hidden />
          <AlertTitle>Platform degraded</AlertTitle>
          <AlertDescription>
            One or more dependencies are failing — agents may be unable to execute workflows.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={HeartPulse}
          isLoading={healthQuery.isLoading}
          label="Platform status"
          value={isUnreachable ? "UNREACHABLE" : (health?.status.toUpperCase() ?? "…")}
        />
        <StatCard
          icon={Timer}
          isLoading={healthQuery.isLoading}
          label="API uptime"
          value={health ? formatDuration(health.uptimeSeconds * 1000) : "—"}
        />
        <StatCard
          hint={health?.service}
          icon={Server}
          isLoading={healthQuery.isLoading}
          label="API version"
          value={health?.version ?? "—"}
        />
        <StatCard
          hint="executions currently active"
          icon={Zap}
          isLoading={executionsQuery.isLoading}
          label="Active workload"
          value={aggregates.running + aggregates.pending}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dependencies</CardTitle>
          <CardDescription>
            Checked by the backend readiness probe (`/health/ready`) — the same probe the container
            orchestrator and load balancer use.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {healthQuery.isLoading ? (
            <>
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </>
          ) : (
            <>
              <DependencyRow
                detail="NestJS API service"
                icon={Server}
                name="Backend API"
                status={isUnreachable ? "ERROR" : (health?.status ?? "error")}
              />
              <DependencyRow
                detail="Primary datastore (Prisma / PostgreSQL)"
                icon={Database}
                name="PostgreSQL"
                status={health?.dependencies.postgres ?? "error"}
              />
              <DependencyRow
                detail="Cache, queues (BullMQ), and semantic memory indices"
                icon={Zap}
                name="Redis"
                status={health?.dependencies.redis ?? "error"}
              />
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Deeper observability</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>
            Infrastructure-level dashboards (host, containers, database internals, queue depth,
            request latency percentiles) live in Grafana at{" "}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">/grafana/</code> on the
            production deployment, fed by Prometheus metrics from this same backend.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
