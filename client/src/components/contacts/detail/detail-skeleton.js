import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

// Mirrors the header's action row: stretched 36px buttons on phones, compact from `sm`.
const HEADER_BUTTONS = ['sm:w-24', 'sm:w-24', 'sm:w-16', 'sm:w-28', 'sm:w-8'];

function CardSkeleton({ rows }) {
  return (
    <Card className="gap-4 py-5">
      <CardHeader className="px-5">
        <Skeleton className="h-4 w-24" />
      </CardHeader>
      <CardContent className="grid gap-3 px-5">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="grid gap-1 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-3.5 w-full max-w-xs" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/** Mirrors the contact detail layout while the document loads. */
export function DetailSkeleton() {
  return (
    <div className="mx-auto max-w-6xl motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300" aria-busy="true" aria-label="Loading contact">
      <div className="mb-6 grid gap-4">
        <Skeleton className="h-4 w-32" />
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="grid gap-2">
            <Skeleton className="h-8 w-56 max-w-full" />
            <Skeleton className="h-4 w-40" />
            <div className="flex gap-1.5">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {HEADER_BUTTONS.map((w, i) => (
              <Skeleton key={i} className={`h-9 flex-1 sm:h-8 sm:flex-none ${w}`} />
            ))}
          </div>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid content-start gap-6 lg:col-span-2">
          <CardSkeleton rows={4} />
          <CardSkeleton rows={4} />
          <CardSkeleton rows={6} />
          <CardSkeleton rows={2} />
        </div>
        <div className="lg:col-span-1">
          <CardSkeleton rows={5} />
        </div>
      </div>
    </div>
  );
}
