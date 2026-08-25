"use client";

import { Bot, Coins, Eye, Layers, Play, Braces, Waves, Wrench } from "lucide-react";
import * as React from "react";

import { CodeBlock } from "@/components/patterns/code-block";
import { EmptyState } from "@/components/patterns/empty-state";
import { ErrorState } from "@/components/patterns/error-state";
import { PageHeader } from "@/components/patterns/page-header";
import { StatCard } from "@/components/patterns/stat-card";
import { StatusBadge } from "@/components/patterns/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useModels, useQuotas, useSandbox } from "@/hooks/use-api";
import type { ModelMetadata, SandboxResult } from "@/lib/api/types";
import { formatCompact, formatDuration, formatPercent, percentOf } from "@/lib/format";

function CapabilityBadges({ model }: { model: ModelMetadata }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {model.supportsToolCalling ? (
        <Badge variant="secondary">
          <Wrench /> tools
        </Badge>
      ) : null}
      {model.supportsStreaming ? (
        <Badge variant="secondary">
          <Waves /> streaming
        </Badge>
      ) : null}
      {model.supportsStructured ? (
        <Badge variant="secondary">
          <Braces /> structured
        </Badge>
      ) : null}
      {model.supportsVision ? (
        <Badge variant="secondary">
          <Eye /> vision
        </Badge>
      ) : null}
    </div>
  );
}

function SandboxPanel({ models }: { models: ModelMetadata[] }) {
  const sandbox = useSandbox();
  const [modelId, setModelId] = React.useState(models[0]?.modelId ?? "qwen-plus");
  const [prompt, setPrompt] = React.useState("");
  const [result, setResult] = React.useState<SandboxResult | null>(null);

  const handleRun = () => {
    if (prompt.trim().length === 0) return;
    setResult(null);
    sandbox.mutate(
      { modelId, prompt },
      {
        onSuccess: (data) => {
          setResult(data);
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Agent sandbox</CardTitle>
        <CardDescription>
          Send a prompt straight to a Qwen model with your organization&apos;s quota and provider
          settings — the same path agents use in production.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
          <div className="space-y-1.5">
            <Label htmlFor="sandbox-model">Model</Label>
            <Select onValueChange={setModelId} value={modelId}>
              <SelectTrigger id="sandbox-model">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {models.map((model) => (
                  <SelectItem key={model.modelId} value={model.modelId}>
                    {model.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sandbox-prompt">Prompt</Label>
            <Textarea
              id="sandbox-prompt"
              onChange={(event) => {
                setPrompt(event.target.value);
              }}
              placeholder="Ask the agent anything…"
              value={prompt}
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Sandbox runs count toward the organization token quota.
          </p>
          <Button disabled={sandbox.isPending || prompt.trim().length === 0} onClick={handleRun}>
            <Play /> {sandbox.isPending ? "Running…" : "Run"}
          </Button>
        </div>

        {sandbox.isPending ? <Skeleton className="h-28 w-full" /> : null}

        {result ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {result.durationMs !== undefined ? (
                <Badge variant="muted">{formatDuration(result.durationMs)}</Badge>
              ) : null}
              {result.usage ? (
                <Badge variant="muted">{formatCompact(result.usage.totalTokens)} tokens</Badge>
              ) : null}
            </div>
            <CodeBlock code={result.output} maxHeight={280} />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function AgentsPage() {
  const modelsQuery = useModels();
  const quotasQuery = useQuotas();
  const models = modelsQuery.data ?? [];

  return (
    <>
      <PageHeader
        description="The Qwen model fleet powering every agent: capabilities, context windows, pricing, and a live sandbox."
        title="Agents & Models"
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Bot}
          isLoading={modelsQuery.isLoading}
          label="Active models"
          value={models.length}
        />
        <StatCard
          icon={Layers}
          isLoading={modelsQuery.isLoading}
          hint="largest available"
          label="Max context window"
          value={formatCompact(Math.max(0, ...models.map((model) => model.contextWindow)))}
        />
        <StatCard
          icon={Coins}
          isLoading={quotasQuery.isLoading}
          hint={
            quotasQuery.data
              ? `${formatPercent(quotasQuery.data.dailyUsed, quotasQuery.data.dailyLimit)} of daily limit`
              : undefined
          }
          label="Tokens today"
          value={formatCompact(quotasQuery.data?.dailyUsed ?? 0)}
        />
        <StatCard
          icon={Coins}
          isLoading={quotasQuery.isLoading}
          hint={
            quotasQuery.data
              ? `${formatPercent(quotasQuery.data.monthlyUsed, quotasQuery.data.monthlyLimit)} of monthly limit`
              : undefined
          }
          label="Tokens this month"
          value={formatCompact(quotasQuery.data?.monthlyUsed ?? 0)}
        />
      </div>

      <Tabs defaultValue="catalog">
        <TabsList>
          <TabsTrigger value="catalog">Model catalog</TabsTrigger>
          <TabsTrigger value="sandbox">Sandbox</TabsTrigger>
          <TabsTrigger value="quotas">Quotas</TabsTrigger>
        </TabsList>

        <TabsContent value="catalog">
          {modelsQuery.isError ? (
            <ErrorState error={modelsQuery.error} onRetry={() => void modelsQuery.refetch()} />
          ) : modelsQuery.isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton className="h-52 w-full" key={index} />
              ))}
            </div>
          ) : models.length === 0 ? (
            <EmptyState
              description="No active models are registered with the provider."
              icon={Bot}
              title="Model registry is empty"
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {models.map((model) => (
                <Card key={model.modelId}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle>{model.displayName}</CardTitle>
                      <StatusBadge status={model.status} />
                    </div>
                    <CardDescription className="font-mono text-[11px]">
                      {model.provider} / {model.modelId}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <CapabilityBadges model={model} />
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                      <dt className="text-muted-foreground">Context window</dt>
                      <dd className="text-right tabular-nums">
                        {formatCompact(model.contextWindow)}
                      </dd>
                      <dt className="text-muted-foreground">Max output</dt>
                      <dd className="text-right tabular-nums">
                        {formatCompact(model.maxOutputTokens)}
                      </dd>
                      <dt className="text-muted-foreground">Input / 1M tokens</dt>
                      <dd className="text-right tabular-nums">
                        ${model.inputPricePerMillion.toFixed(2)}
                      </dd>
                      <dt className="text-muted-foreground">Output / 1M tokens</dt>
                      <dd className="text-right tabular-nums">
                        ${model.outputPricePerMillion.toFixed(2)}
                      </dd>
                    </dl>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="sandbox">
          {models.length > 0 ? (
            <SandboxPanel models={models} />
          ) : (
            <EmptyState icon={Bot} title="No models available for the sandbox" />
          )}
        </TabsContent>

        <TabsContent value="quotas">
          <Card>
            <CardHeader>
              <CardTitle>Organization token quotas</CardTitle>
              <CardDescription>
                Hard limits enforced before every AI call. Contact a platform admin to raise them.
              </CardDescription>
            </CardHeader>
            <CardContent className="max-w-xl space-y-6">
              {quotasQuery.isLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : quotasQuery.data ? (
                <>
                  <div>
                    <div className="mb-1.5 flex items-baseline justify-between text-sm">
                      <span>Daily</span>
                      <span className="tabular-nums text-muted-foreground">
                        {formatCompact(quotasQuery.data.dailyUsed)} /{" "}
                        {formatCompact(quotasQuery.data.dailyLimit)} tokens
                      </span>
                    </div>
                    <Progress
                      value={percentOf(quotasQuery.data.dailyUsed, quotasQuery.data.dailyLimit)}
                    />
                  </div>
                  <div>
                    <div className="mb-1.5 flex items-baseline justify-between text-sm">
                      <span>Monthly</span>
                      <span className="tabular-nums text-muted-foreground">
                        {formatCompact(quotasQuery.data.monthlyUsed)} /{" "}
                        {formatCompact(quotasQuery.data.monthlyLimit)} tokens
                      </span>
                    </div>
                    <Progress
                      value={percentOf(quotasQuery.data.monthlyUsed, quotasQuery.data.monthlyLimit)}
                    />
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Quota data unavailable.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
