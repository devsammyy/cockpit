"use client";

import { Check, Copy } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CodeBlockProps {
  code: string;
  language?: string;
  className?: string;
  maxHeight?: number;
}

/**
 * Lightweight monospace block with copy-to-clipboard. Used for JSON payloads,
 * prompts, and log lines where a full Monaco instance would be overkill.
 */
export function CodeBlock({ code, language, className, maxHeight = 320 }: CodeBlockProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 1500);
    });
  };

  return (
    <div className={cn("group relative rounded-md border bg-muted/40", className)}>
      {language ? (
        <span className="absolute right-10 top-2 text-[10px] uppercase tracking-wider text-muted-foreground">
          {language}
        </span>
      ) : null}
      <Button
        aria-label="Copy to clipboard"
        className="absolute right-1.5 top-1.5 size-7 opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
        onClick={handleCopy}
        size="icon"
        variant="ghost"
      >
        {copied ? <Check className="text-success" /> : <Copy />}
      </Button>
      <pre
        className="overflow-auto p-3 font-mono text-xs leading-relaxed scrollbar-thin"
        style={{ maxHeight }}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}

/** Pretty-printed JSON convenience wrapper. */
export function JsonBlock({
  value,
  className,
  maxHeight,
}: {
  value: unknown;
  className?: string;
  maxHeight?: number;
}) {
  const code = React.useMemo(() => {
    if (value === undefined) return "undefined";
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return "[unserializable value]";
    }
  }, [value]);

  return <CodeBlock className={className} code={code} language="json" maxHeight={maxHeight} />;
}
