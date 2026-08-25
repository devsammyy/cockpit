import Link from "next/link";

import { Button } from "@qwen-autopilot/ui";

export default function NotFound(): React.ReactElement {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-6">
      <section className="max-w-md rounded-md border bg-background p-6 shadow-sm">
        <h1 className="text-xl font-semibold">Page not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The requested workspace route does not exist.
        </p>
        <Button asChild className="mt-6" variant="outline">
          <Link href="/">Return home</Link>
        </Button>
      </section>
    </main>
  );
}
