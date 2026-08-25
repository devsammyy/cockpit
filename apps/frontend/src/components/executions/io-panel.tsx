"use client";

import { Braces, FileText, Sparkles, Target } from "lucide-react";
import * as React from "react";

import { JsonBlock } from "@/components/patterns/code-block";
import { Markdown } from "@/components/patterns/markdown";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface NarrativeSection {
  label: string;
  text: string;
}

/** A string is "narrative" (worth rendering as prose) if it's long or multiline. */
function isNarrative(text: string): boolean {
  return text.trim().length > 40 || text.includes("\n");
}

/**
 * Walk an input/output object and pull out the human-readable prose — agent
 * steps store their result under an `output` key, so a workflow's variables map
 * nests the interesting text a few levels deep. Bookkeeping keys (cost, engine
 * internals) are skipped.
 */
const PRIMARY_TEXT_KEYS = ["output", "message", "result", "text", "content"];

export function collectNarrative(value: unknown, keyHint: string): NarrativeSection[] {
  if (typeof value === "string") {
    return isNarrative(value) ? [{ label: keyHint, text: value }] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      collectNarrative(item, `${keyHint} ${String(index + 1)}`),
    );
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    // A step result wraps its prose under `output`/`message`/etc. Label that
    // section with the step key (the parent) rather than the inner field name,
    // so readers see "Rank", "Evaluate" — not five sections all called "Output".
    const primaryKey = PRIMARY_TEXT_KEYS.find((key) => {
      const candidate = record[key];
      return typeof candidate === "string" && isNarrative(candidate);
    });
    if (primaryKey) {
      return [{ label: keyHint, text: record[primaryKey] as string }];
    }
    return Object.entries(record).flatMap(([key, child]) =>
      key === "cost" || key.startsWith("__") ? [] : collectNarrative(child, key),
    );
  }
  return [];
}

export function prettifyLabel(label: string): string {
  return label
    .replace(/[-_]/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

type ViewMode = "formatted" | "json";

function SegmentedToggle({
  mode,
  onChange,
}: {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}) {
  const options: { value: ViewMode; label: string; icon: typeof FileText }[] = [
    { value: "formatted", label: "Formatted", icon: FileText },
    { value: "json", label: "JSON", icon: Braces },
  ];
  return (
    <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5">
      {options.map((option) => {
        const Icon = option.icon;
        const active = mode === option.value;
        return (
          <button
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            key={option.value}
            onClick={() => {
              onChange(option.value);
            }}
            type="button"
          >
            <Icon className="size-3.5" /> {option.label}
          </button>
        );
      })}
    </div>
  );
}

function DataPanel({
  title,
  icon: Icon,
  accent,
  value,
  emptyLabel,
}: {
  title: string;
  icon: typeof Sparkles;
  accent: "brand" | "muted";
  value: unknown;
  emptyLabel?: string;
}) {
  const sections = React.useMemo(() => collectNarrative(value, title), [value, title]);
  const hasNarrative = sections.length > 0;
  const [mode, setMode] = React.useState<ViewMode>(hasNarrative ? "formatted" : "json");

  const isEmpty =
    value === null ||
    value === undefined ||
    (typeof value === "object" && Object.keys(value).length === 0);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <span
            className={cn(
              "flex size-7 items-center justify-center rounded-md",
              accent === "brand" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
            )}
          >
            <Icon className="size-4" />
          </span>
          {title}
        </CardTitle>
        {!isEmpty ? <SegmentedToggle mode={mode} onChange={setMode} /> : null}
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <p className="text-sm text-muted-foreground">{emptyLabel ?? "Nothing recorded."}</p>
        ) : mode === "json" || !hasNarrative ? (
          <JsonBlock maxHeight={420} value={value} />
        ) : (
          <div className="space-y-5">
            {sections.map((section, index) => (
              <section key={`${section.label}-${String(index)}`}>
                {sections.length > 1 ? (
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {prettifyLabel(section.label)}
                  </p>
                ) : null}
                <div className="max-h-112 overflow-y-auto rounded-lg border border-border bg-muted/20 px-4 py-3">
                  <Markdown content={section.text} />
                </div>
              </section>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface IoPanelProps {
  input: unknown;
  output: unknown;
  isLive: boolean;
}

/** The Input / Output tab: readable prose by default, raw JSON on demand. */
export function IoPanel({ input, output, isLive }: IoPanelProps): React.ReactElement {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <DataPanel
        accent="muted"
        emptyLabel="No input recorded."
        icon={Target}
        title="Input"
        value={input}
      />
      <DataPanel
        accent="brand"
        emptyLabel={`No terminal output ${isLive ? "yet" : "recorded"}.`}
        icon={Sparkles}
        title="Output"
        value={output}
      />
    </div>
  );
}
