import { PageHeader } from '@/components/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { PAGE_DESCRIPTION } from '@/components/followups/followups-config';

/** Loading state for /follow-ups; also the page's Suspense fallback, so it renders the real header. */
export function FollowupsSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-label="Loading follow-ups">
      <PageHeader title="Follow-ups" description={PAGE_DESCRIPTION} />
      <Skeleton className="h-9 w-full max-w-xl rounded-lg" />
      <div className="mt-6 space-y-3">
        <Skeleton className="h-5 w-56" />
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    </div>
  );
}
