import { AlertCircle, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

// Shared so the skeleton lays out exactly like the loaded dashboard (no jump on swap).
export const TILE_GRID = 'grid grid-cols-2 gap-3 lg:grid-cols-4';
export const CARD_GRID = 'grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3';

export function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading dashboard">
      <Skeleton className="h-36 rounded-2xl" />
      <div className={TILE_GRID}>
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-[118px] rounded-xl" />
        ))}
      </div>
      <div className={CARD_GRID}>
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-64 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

/** `busy` disables Retry and spins its icon while a retry is in flight. */
export function DashboardError({ title = "Couldn't load the dashboard", message, onRetry, busy = false }) {
  return (
    <Alert variant="destructive" className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
      <AlertCircle />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p>{message || 'Something went wrong'}</p>
        <Button size="sm" variant="outline" onClick={onRetry} disabled={busy}>
          <RefreshCw className={cn(busy && 'animate-spin')} aria-hidden="true" />
          Retry
        </Button>
      </AlertDescription>
    </Alert>
  );
}
