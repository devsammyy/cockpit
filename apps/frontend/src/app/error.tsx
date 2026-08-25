"use client";

import { RotateCcw } from "lucide-react";

import { Button } from "@qwen-autopilot/ui";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorPage({ error, reset }: ErrorPageProps): React.ReactElement {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-6">
      <section className="max-w-md rounded-md border bg-background p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Application error</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <Button className="mt-6" onClick={reset} variant="outline">
          <RotateCcw aria-hidden className="h-4 w-4" />
          Retry
        </Button>
      </section>
    </main>
  );
}
