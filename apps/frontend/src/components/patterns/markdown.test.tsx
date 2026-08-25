import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { Markdown } from "./markdown";

function html(content: string): string {
  return renderToStaticMarkup(<Markdown content={content} />);
}

describe("Markdown", () => {
  test("renders bold and italic emphasis", () => {
    const out = html("This is **bold** and *italic* text.");
    expect(out).toContain("<strong");
    expect(out).toContain("bold");
    expect(out).toContain("<em>italic</em>");
  });

  test("renders inline code", () => {
    const out = html("Run `pnpm test` now.");
    expect(out).toContain("<code");
    expect(out).toContain("pnpm test");
  });

  test("renders a fenced code block as <pre>", () => {
    const out = html('```json\n{ "a": 1 }\n```');
    expect(out).toContain("<pre");
    expect(out).toContain("{ &quot;a&quot;: 1 }");
  });

  test("renders unordered lists", () => {
    const out = html("- one\n- two\n• three");
    expect(out).toContain("<ul");
    expect((out.match(/<li>/g) ?? []).length).toBe(3);
  });

  test("renders ordered lists", () => {
    const out = html("1. first\n2. second");
    expect(out).toContain("<ol");
    expect((out.match(/<li>/g) ?? []).length).toBe(2);
  });

  test("renders headings as emphasized text", () => {
    const out = html("## Section title");
    expect(out).toContain("Section title");
    expect(out).toContain("font-semibold");
  });

  test("renders a safe https link with noopener", () => {
    const out = html("See [docs](https://example.com/guide).");
    expect(out).toContain('href="https://example.com/guide"');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  test("strips javascript: URLs but keeps the link text", () => {
    const out = html("[click me](javascript:alert(1))");
    expect(out).not.toContain("javascript:");
    expect(out).not.toContain("<a");
    expect(out).toContain("click me");
  });

  test("strips data: URLs", () => {
    const out = html("[x](data:text/html,<script>alert(1)</script>)");
    expect(out).not.toContain("<a");
    expect(out).not.toContain("data:text/html");
  });

  test("escapes raw HTML in the source (no injection)", () => {
    const out = html("Hello <script>alert('xss')</script> world");
    expect(out).not.toContain("<script>");
    expect(out).toContain("&lt;script&gt;");
  });
});
