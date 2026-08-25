"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, Play, Plus, TerminalSquare, Wrench } from "lucide-react";
import * as React from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  useExecuteTool,
  useStoreCredential,
  useToolCatalog,
  useToolHistory,
} from "@/hooks/use-api";
import { formatDuration, formatRelative } from "@/lib/format";

const credentialSchema = z.object({
  key: z.string().min(2, "Key identifier is required (e.g. SLACK_BOT_TOKEN)."),
  name: z.string().min(2, "Give the credential a display name."),
  value: z.string().min(4, "The secret value is required."),
});

type CredentialForm = z.infer<typeof credentialSchema>;

function CredentialDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const storeCredential = useStoreCredential();
  const form = useForm<CredentialForm>({
    defaultValues: { key: "", name: "", value: "" },
    resolver: zodResolver(credentialSchema),
  });

  const onSubmit = form.handleSubmit((values) => {
    storeCredential.mutate(values, {
      onSuccess: () => {
        onOpenChange(false);
        form.reset();
      },
    });
  });

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Store a credential</DialogTitle>
          <DialogDescription>
            Secrets are encrypted with the organization vault key before storage and injected into
            tools at execution time. Values are never displayed again.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              void onSubmit(event);
            }}
          >
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Display name</FormLabel>
                  <FormControl>
                    <Input placeholder="Slack Bot" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="key"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Key</FormLabel>
                  <FormControl>
                    <Input className="font-mono" placeholder="SLACK_BOT_TOKEN" {...field} />
                  </FormControl>
                  <FormDescription>
                    The identifier tools use to request this secret.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="value"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Secret value</FormLabel>
                  <FormControl>
                    <Input autoComplete="off" type="password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                onClick={() => {
                  onOpenChange(false);
                }}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button disabled={storeCredential.isPending} type="submit">
                <KeyRound /> {storeCredential.isPending ? "Encrypting…" : "Store securely"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function ToolRunner({ toolNames }: { toolNames: string[] }) {
  const executeTool = useExecuteTool();
  const [toolName, setToolName] = React.useState(toolNames[0] ?? "");
  const [argsText, setArgsText] = React.useState("{}");
  const [result, setResult] = React.useState<unknown>(null);

  const handleRun = () => {
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(argsText) as Record<string, unknown>;
    } catch {
      toast.error("Arguments must be valid JSON");
      return;
    }
    setResult(null);
    executeTool.mutate(
      { args, toolName },
      {
        onSuccess: (data) => {
          setResult(data);
          toast.success("Tool executed");
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Tool runner</CardTitle>
        <CardDescription>
          Execute a tool through the full production pipeline — policy checks, approval gates, and
          history logging all apply.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[240px_1fr]">
          <div className="space-y-1.5">
            <Label htmlFor="runner-tool">Tool</Label>
            <Select onValueChange={setToolName} value={toolName}>
              <SelectTrigger id="runner-tool">
                <SelectValue placeholder="Choose a tool" />
              </SelectTrigger>
              <SelectContent>
                {toolNames.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="runner-args">Arguments (JSON)</Label>
            <Textarea
              className="min-h-24 font-mono text-xs"
              id="runner-args"
              onChange={(event) => {
                setArgsText(event.target.value);
              }}
              spellCheck={false}
              value={argsText}
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button disabled={executeTool.isPending || !toolName} onClick={handleRun}>
            <Play /> {executeTool.isPending ? "Executing…" : "Execute"}
          </Button>
        </div>
        {result !== null ? <JsonBlock maxHeight={280} value={result} /> : null}
      </CardContent>
    </Card>
  );
}

export default function ToolsPage() {
  const catalogQuery = useToolCatalog();
  const historyQuery = useToolHistory();
  const [credentialOpen, setCredentialOpen] = React.useState(false);

  const catalog = catalogQuery.data ?? [];
  const history = historyQuery.data ?? [];

  return (
    <>
      <PageHeader
        actions={
          <Button
            onClick={() => {
              setCredentialOpen(true);
            }}
            variant="outline"
          >
            <Plus /> Store credential
          </Button>
        }
        description="The capability surface agents can act with: registered tools, execution history, and the encrypted credential vault."
        title="Tools"
      />

      <Tabs defaultValue="catalog">
        <TabsList>
          <TabsTrigger value="catalog">Catalog</TabsTrigger>
          <TabsTrigger value="runner">Runner</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="catalog">
          {catalogQuery.isError ? (
            <ErrorState error={catalogQuery.error} onRetry={() => void catalogQuery.refetch()} />
          ) : catalogQuery.isLoading ? (
            <TableSkeleton rows={4} />
          ) : catalog.length === 0 ? (
            <EmptyState
              description="Tools register at backend startup via the connector framework and MCP servers."
              icon={Wrench}
              title="No tools registered"
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {catalog.map((tool) => (
                <Card key={tool.name}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 font-mono text-[13px]">
                      <TerminalSquare aria-hidden className="size-4 text-muted-foreground" />
                      {tool.name}
                    </CardTitle>
                    <CardDescription className="line-clamp-2">{tool.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-1.5">
                    {tool.timeoutMs ? (
                      <Badge variant="secondary">timeout {formatDuration(tool.timeoutMs)}</Badge>
                    ) : null}
                    {tool.retryAttempts !== undefined ? (
                      <Badge variant="secondary">{tool.retryAttempts} retries</Badge>
                    ) : null}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="runner">
          {catalog.length > 0 ? (
            <ToolRunner toolNames={catalog.map((tool) => tool.name)} />
          ) : (
            <EmptyState icon={Wrench} title="No tools available to run" />
          )}
        </TabsContent>

        <TabsContent value="history">
          {historyQuery.isLoading ? (
            <TableSkeleton rows={6} />
          ) : history.length === 0 ? (
            <EmptyState
              description="Every tool invocation — manual or from a workflow — is recorded here."
              icon={TerminalSquare}
              title="No executions yet"
            />
          ) : (
            <div className="rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tool</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden sm:table-cell">Latency</TableHead>
                    <TableHead className="hidden md:table-cell">When</TableHead>
                    <TableHead className="hidden lg:table-cell">Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell className="font-mono text-xs font-medium">
                        {record.toolName}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={record.status} />
                      </TableCell>
                      <TableCell className="hidden text-sm tabular-nums sm:table-cell">
                        {formatDuration(record.latencyMs ?? null)}
                      </TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                        {formatRelative(record.createdAt)}
                      </TableCell>
                      <TableCell className="hidden max-w-[320px] lg:table-cell">
                        {record.error ? (
                          <span className="line-clamp-1 text-xs text-destructive">
                            {record.error}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <CredentialDialog onOpenChange={setCredentialOpen} open={credentialOpen} />
    </>
  );
}
