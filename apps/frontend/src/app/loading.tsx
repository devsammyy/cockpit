export default function Loading(): React.ReactElement {
  return (
    <main className="grid min-h-screen place-items-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
    </main>
  );
}
