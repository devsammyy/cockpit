import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Minimal, dependency-free Markdown renderer for model-generated content
 * (approval messages, agent output, reflections). It emits only known React
 * elements — never `dangerouslySetInnerHTML` — so untrusted LLM text cannot
 * inject markup or scripts.
 *
 * Supported: headings, bold, italic, inline + fenced code, ordered/unordered
 * lists, links (safe schemes only), horizontal rules, and paragraphs. Nested
 * inline emphasis is intentionally not parsed — the goal is readable output,
 * not a spec-complete parser.
 */

const UNORDERED_ITEM = /^\s*[-*•]\s+(.*)$/;
const ORDERED_ITEM = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const HORIZONTAL_RULE = /^\s*([-*_])\1{2,}\s*$/;
const FENCE = /^\s*```/;

/** Allow only http(s), mailto, in-page anchors, and root/relative links. */
function safeHref(href: string): string | undefined {
  const trimmed = href.trim();
  if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed;
  if (/^(\/|\.\/|#)/.test(trimmed)) return trimmed;
  return undefined;
}

const INLINE_PATTERN =
  /(`[^`]+`)|(\[[^\]]+\]\([^)]+\))|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*\s][^*]*\*)|(_[^_\s][^_]*_)/;

/** Parse a single line of text into emphasis / code / link nodes. */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let remaining = text;
  let counter = 0;

  while (remaining.length > 0) {
    const match = INLINE_PATTERN.exec(remaining);
    if (!match) {
      nodes.push(remaining);
      break;
    }

    if (match.index > 0) nodes.push(remaining.slice(0, match.index));

    const token = match[0];
    counter += 1;
    const key = `${keyPrefix}-i${String(counter)}`;

    if (token.startsWith("`")) {
      nodes.push(
        <code
          className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground"
          key={key}
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("[")) {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      const href = link ? safeHref(link[2] ?? "") : undefined;
      if (link && href) {
        nodes.push(
          <a
            className="font-medium text-primary underline underline-offset-4 hover:text-primary/80"
            href={href}
            key={key}
            rel="noopener noreferrer"
            target="_blank"
          >
            {link[1]}
          </a>,
        );
      } else {
        nodes.push(link ? link[1] : token);
      }
    } else if (token.startsWith("**") || token.startsWith("__")) {
      nodes.push(
        <strong className="font-semibold text-foreground" key={key}>
          {token.slice(2, -2)}
        </strong>,
      );
    } else {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    }

    remaining = remaining.slice(match.index + token.length);
  }

  return nodes;
}

/** Group raw lines into block elements (paragraphs, lists, code, headings). */
function renderBlocks(content: string): React.ReactNode[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let index = 0;
  let key = 0;
  const nextKey = () => {
    key += 1;
    return `b${String(key)}`;
  };

  while (index < lines.length) {
    const line = lines[index];
    if (line === undefined) break;

    // Blank line — skip; block spacing is handled by the container.
    if (line.trim() === "") {
      index += 1;
      continue;
    }

    // Fenced code block.
    if (FENCE.test(line)) {
      const lang = line.replace(/^\s*```/, "").trim();
      const code: string[] = [];
      index += 1;
      for (let codeLine = lines[index]; codeLine !== undefined && !FENCE.test(codeLine);) {
        code.push(codeLine);
        index += 1;
        codeLine = lines[index];
      }
      index += 1; // consume the closing fence
      const k = nextKey();
      blocks.push(
        <pre
          className="overflow-x-auto rounded-lg border border-border bg-muted/50 p-3 text-xs leading-relaxed"
          key={k}
        >
          {lang ? (
            <div className="mb-1 font-mono text-[0.7rem] text-muted-foreground">{lang}</div>
          ) : null}
          <code className="font-mono text-foreground">{code.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    // Horizontal rule.
    if (HORIZONTAL_RULE.test(line)) {
      blocks.push(<hr className="border-border" key={nextKey()} />);
      index += 1;
      continue;
    }

    // Heading.
    const heading = HEADING.exec(line);
    if (heading) {
      const level = (heading[1] ?? "#").length;
      const k = nextKey();
      const text = renderInline(heading[2] ?? "", k);
      const sizes = ["text-lg", "text-base", "text-sm", "text-sm", "text-sm", "text-sm"];
      blocks.push(
        <p className={cn("font-semibold text-foreground", sizes[level - 1])} key={k}>
          {text}
        </p>,
      );
      index += 1;
      continue;
    }

    // Unordered list.
    if (UNORDERED_ITEM.test(line)) {
      const items: string[] = [];
      for (let listLine: string | undefined = line; listLine !== undefined;) {
        const match = UNORDERED_ITEM.exec(listLine);
        if (!match) break;
        items.push(match[1] ?? "");
        index += 1;
        listLine = lines[index];
      }
      const k = nextKey();
      blocks.push(
        <ul className="list-disc space-y-1 pl-5 marker:text-muted-foreground" key={k}>
          {items.map((item, i) => (
            <li key={`${k}-${String(i)}`}>{renderInline(item, `${k}-${String(i)}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    // Ordered list.
    if (ORDERED_ITEM.test(line)) {
      const items: string[] = [];
      for (let listLine: string | undefined = line; listLine !== undefined;) {
        const match = ORDERED_ITEM.exec(listLine);
        if (!match) break;
        items.push(match[1] ?? "");
        index += 1;
        listLine = lines[index];
      }
      const k = nextKey();
      blocks.push(
        <ol className="list-decimal space-y-1 pl-5 marker:text-muted-foreground" key={k}>
          {items.map((item, i) => (
            <li key={`${k}-${String(i)}`}>{renderInline(item, `${k}-${String(i)}`)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    // Paragraph — gather consecutive plain lines.
    const paragraph: string[] = [];
    while (index < lines.length) {
      const current = lines[index];
      if (
        current === undefined ||
        current.trim() === "" ||
        FENCE.test(current) ||
        HORIZONTAL_RULE.test(current) ||
        HEADING.test(current) ||
        UNORDERED_ITEM.test(current) ||
        ORDERED_ITEM.test(current)
      ) {
        break;
      }
      paragraph.push(current);
      index += 1;
    }
    const k = nextKey();
    blocks.push(
      <p className="leading-relaxed" key={k}>
        {renderInline(paragraph.join(" "), k)}
      </p>,
    );
  }

  return blocks;
}

interface MarkdownProps {
  content: string;
  className?: string;
}

/** Render trusted-structure Markdown text as safe, styled React elements. */
export function Markdown({ content, className }: MarkdownProps): React.ReactElement {
  return (
    <div className={cn("space-y-3 text-sm text-foreground/90", className)}>
      {renderBlocks(content)}
    </div>
  );
}
