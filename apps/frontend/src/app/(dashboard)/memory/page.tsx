"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { BookOpen, BrainCircuit, Lightbulb, Plus, Search } from "lucide-react";
import * as React from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { EmptyState } from "@/components/patterns/empty-state";
import { ErrorState } from "@/components/patterns/error-state";
import { TableSkeleton } from "@/components/patterns/loading";
import { PageHeader } from "@/components/patterns/page-header";
import { StatCard } from "@/components/patterns/stat-card";
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  useAddKnowledge,
  useKnowledge,
  useMemoryExplore,
  useMemorySearch,
  useReflections,
} from "@/hooks/use-api";
import type { SemanticSearchResult } from "@/lib/api/types";
import { formatRelative } from "@/lib/format";

const knowledgeSchema = z.object({
  content: z.string().min(20, "Provide at least 20 characters of content to index."),
  source: z.string().optional(),
  tags: z.string().optional(),
  title: z.string().min(3, "Give the document a title."),
});

type KnowledgeForm = z.infer<typeof knowledgeSchema>;

function AddKnowledgeDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const addKnowledge = useAddKnowledge();
  const form = useForm<KnowledgeForm>({
    defaultValues: { content: "", source: "", tags: "", title: "" },
    resolver: zodResolver(knowledgeSchema),
  });

  const onSubmit = form.handleSubmit((values) => {
    addKnowledge.mutate(
      {
        content: values.content,
        source: values.source || undefined,
        tags: values.tags
          ? values.tags
              .split(",")
              .map((tag) => tag.trim())
              .filter(Boolean)
          : undefined,
        title: values.title,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          form.reset();
        },
      },
    );
  });

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Index a knowledge document</DialogTitle>
          <DialogDescription>
            Documents are embedded and become retrievable context for every agent in this
            organization.
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
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input placeholder="Q3 Refund Policy" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="content"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Content</FormLabel>
                  <FormControl>
                    <Textarea
                      className="min-h-[140px]"
                      placeholder="Paste the document content…"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="tags"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tags (comma separated)</FormLabel>
                    <FormControl>
                      <Input placeholder="policy, billing" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="source"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Source (optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="confluence://billing/policies" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
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
              <Button disabled={addKnowledge.isPending} type="submit">
                {addKnowledge.isPending ? "Indexing…" : "Index document"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function SemanticSearchPanel() {
  const search = useMemorySearch();
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SemanticSearchResult[] | null>(null);

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    if (query.trim().length === 0) return;
    search.mutate(query, {
      onSuccess: (data) => {
        setResults(data);
      },
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Semantic search</CardTitle>
        <CardDescription>
          Vector-similarity retrieval over the organization&apos;s semantic memory — the same recall
          agents use when building context.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form className="flex gap-2" onSubmit={handleSearch}>
          <div className="relative flex-1">
            <Search
              aria-hidden
              className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              aria-label="Semantic search query"
              className="pl-8"
              onChange={(event) => {
                setQuery(event.target.value);
              }}
              placeholder="e.g. what is our refund policy?"
              value={query}
            />
          </div>
          <Button disabled={search.isPending || query.trim().length === 0} type="submit">
            {search.isPending ? "Searching…" : "Search"}
          </Button>
        </form>

        {search.isPending ? <TableSkeleton rows={3} /> : null}

        {results !== null && !search.isPending ? (
          results.length === 0 ? (
            <EmptyState
              className="py-8"
              description="Nothing similar found — index more knowledge or refine the query."
              icon={Search}
              title="No matches"
            />
          ) : (
            <ul className="space-y-2">
              {results.map((result, index) => (
                <li className="rounded-md border p-3" key={index}>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      {typeof result.metadata["title"] === "string"
                        ? result.metadata["title"]
                        : ((result.metadata["category"] as string | undefined) ?? "memory")}
                    </span>
                    <Badge variant="info">similarity {(result.score * 100).toFixed(0)}%</Badge>
                  </div>
                  <p className="line-clamp-3 text-sm">{result.text}</p>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function MemoryPage() {
  const knowledgeQuery = useKnowledge();
  const reflectionsQuery = useReflections();
  const exploreQuery = useMemoryExplore();
  const [addOpen, setAddOpen] = React.useState(false);

  const knowledge = knowledgeQuery.data ?? [];
  const reflections = reflectionsQuery.data ?? [];

  return (
    <>
      <PageHeader
        actions={
          <Button
            onClick={() => {
              setAddOpen(true);
            }}
          >
            <Plus /> Index document
          </Button>
        }
        description="Everything your agents know: indexed knowledge, execution reflections, and semantic recall over organizational memory."
        title="Memory"
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={BookOpen}
          isLoading={knowledgeQuery.isLoading}
          label="Knowledge documents"
          value={knowledge.length}
        />
        <StatCard
          icon={Lightbulb}
          isLoading={reflectionsQuery.isLoading}
          label="Reflections"
          value={reflections.length}
        />
        <StatCard
          icon={BrainCircuit}
          isLoading={exploreQuery.isLoading}
          label="Memory entries"
          value={exploreQuery.data?.totalMemories ?? 0}
        />
        <StatCard
          hint={
            reflections.length > 0
              ? `${String(Math.round((reflections.filter((r) => r.succeeded).length / reflections.length) * 100))}% succeeded`
              : undefined
          }
          icon={Lightbulb}
          isLoading={reflectionsQuery.isLoading}
          label="Learning signals"
          value={reflections.filter((r) => r.succeeded).length}
        />
      </div>

      <Tabs defaultValue="knowledge">
        <TabsList>
          <TabsTrigger value="knowledge">Knowledge base</TabsTrigger>
          <TabsTrigger value="search">Semantic search</TabsTrigger>
          <TabsTrigger value="reflections">Reflections</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
        </TabsList>

        <TabsContent value="knowledge">
          {knowledgeQuery.isError ? (
            <ErrorState
              error={knowledgeQuery.error}
              onRetry={() => void knowledgeQuery.refetch()}
            />
          ) : knowledgeQuery.isLoading ? (
            <TableSkeleton rows={5} />
          ) : knowledge.length === 0 ? (
            <EmptyState
              action={
                <Button
                  onClick={() => {
                    setAddOpen(true);
                  }}
                  size="sm"
                >
                  <Plus /> Index your first document
                </Button>
              }
              description="Indexed documents give agents organizational context via retrieval-augmented generation."
              icon={BookOpen}
              title="Knowledge base is empty"
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {knowledge.map((item) => (
                <Card key={item.id}>
                  <CardHeader>
                    <CardTitle className="leading-snug">{item.title}</CardTitle>
                    <CardDescription>
                      {formatRelative(item.createdAt)}
                      {item.source ? ` · ${item.source}` : ""}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="line-clamp-3 text-sm text-muted-foreground">{item.content}</p>
                    {item.tags.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {item.tags.map((tag) => (
                          <Badge key={tag} variant="secondary">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="search">
          <SemanticSearchPanel />
        </TabsContent>

        <TabsContent value="reflections">
          {reflectionsQuery.isLoading ? (
            <TableSkeleton rows={4} />
          ) : reflections.length === 0 ? (
            <EmptyState
              description="After each execution, agents record what worked and what didn't. Those learnings appear here and feed future planning."
              icon={Lightbulb}
              title="No reflections yet"
            />
          ) : (
            <div className="space-y-3">
              {reflections.map((reflection) => (
                <Card key={reflection.id}>
                  <CardContent className="flex items-start gap-3 p-4">
                    <Badge variant={reflection.succeeded ? "success" : "destructive"}>
                      {reflection.succeeded ? "succeeded" : "failed"}
                    </Badge>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">{reflection.reflectionText}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatRelative(reflection.createdAt)}
                        {reflection.toolsUsed.length > 0
                          ? ` · tools: ${reflection.toolsUsed.join(", ")}`
                          : ""}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="categories">
          <Card>
            <CardHeader>
              <CardTitle>Memory by category</CardTitle>
              <CardDescription>
                Distribution of long-term memory entries across system categories.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {exploreQuery.isLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : (exploreQuery.data?.categories.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No categorized memory entries yet — they accumulate as agents run.
                </p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {exploreQuery.data?.categories.map((category) => (
                    <li
                      className="flex items-center justify-between rounded-md border px-3 py-2"
                      key={category.category}
                    >
                      <span className="text-sm font-medium">{category.category.toLowerCase()}</span>
                      <Badge variant="secondary">{category.count}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AddKnowledgeDialog onOpenChange={setAddOpen} open={addOpen} />
    </>
  );
}
