import { Sparkles } from "lucide-react";
import type { ReactNode } from "react";

/** Split auth layout: brand panel on desktop, form on the right. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-10 text-sidebar-foreground lg:flex">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-md bg-sidebar-primary/15 text-sidebar-primary">
            <Sparkles aria-hidden className="size-4" />
          </span>
          <span className="text-sm font-semibold text-sidebar-accent-foreground">
            Qwen Autopilot
          </span>
        </div>
        <div className="max-w-md space-y-4">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight text-sidebar-accent-foreground">
            The operations console for autonomous business agents.
          </h1>
          <p className="text-sm leading-relaxed text-sidebar-muted">
            Plan workflows from plain-language goals, watch every execution live, gate risky actions
            behind human approval, and give agents organizational memory — all powered by Qwen on
            Alibaba Cloud.
          </p>
        </div>
        <p className="text-xs text-sidebar-muted">
          © {new Date().getFullYear()} Qwen Autopilot Platform
        </p>
        <div
          aria-hidden
          className="pointer-events-none absolute -right-32 -top-32 size-96 rounded-full bg-sidebar-primary/10 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-40 -left-24 size-96 rounded-full bg-sidebar-primary/5 blur-3xl"
        />
      </div>
      <div className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
