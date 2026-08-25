"use client";

import { ChevronRight } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";

import { SEGMENT_LABELS } from "@/components/shell/nav-config";
import { shortId } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Path-derived breadcrumbs; UUID segments render as short ids. */
export function Breadcrumbs({ className }: { className?: string }) {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  if (segments.length === 0) return null;

  const crumbs = segments.map((segment, index) => {
    const href = `/${segments.slice(0, index + 1).join("/")}`;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}/i.test(segment);
    const label = isUuid ? shortId(segment) : (SEGMENT_LABELS[segment] ?? segment);
    return { href, isLast: index === segments.length - 1, label };
  });

  return (
    <nav aria-label="Breadcrumb" className={cn("min-w-0", className)}>
      <ol className="flex items-center gap-1 text-sm">
        {crumbs.map((crumb) => (
          <li className="flex min-w-0 items-center gap-1" key={crumb.href}>
            {crumb.isLast ? (
              <span aria-current="page" className="truncate font-medium text-foreground">
                {crumb.label}
              </span>
            ) : (
              <>
                <Link
                  className="truncate text-muted-foreground transition-colors hover:text-foreground"
                  href={crumb.href as Route}
                >
                  {crumb.label}
                </Link>
                <ChevronRight aria-hidden className="size-3.5 shrink-0 text-muted-foreground/60" />
              </>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
