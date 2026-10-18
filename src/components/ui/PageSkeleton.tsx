export function PageSkeleton() {
  return (
    <div className="animate-pulse space-y-6" aria-hidden>
      <div className="border-b border-border pb-4">
        <div className="h-7 w-64 rounded bg-border/60" />
        <div className="mt-2 h-3 w-96 max-w-full rounded bg-border/40" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="rounded-xl border border-border bg-surface p-5">
            <div className="h-3 w-24 rounded bg-border/40" />
            <div className="mt-3 h-6 w-16 rounded bg-border/60" />
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-surface p-5">
        <div className="h-4 w-40 rounded bg-border/50" />
        <div className="mt-4 space-y-2">
          <div className="h-3 w-full rounded bg-border/30" />
          <div className="h-3 w-5/6 rounded bg-border/30" />
          <div className="h-3 w-2/3 rounded bg-border/30" />
        </div>
      </div>
    </div>
  );
}
