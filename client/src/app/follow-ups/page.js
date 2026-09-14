import { Suspense } from 'react';
import { FollowupsView } from '@/components/followups/followups-view';
import { FollowupsSkeleton } from '@/components/followups/followups-skeleton';

export const metadata = { title: 'Follow-ups' };

// FollowupsView reads ?tab= with useSearchParams, so it needs a Suspense boundary from the page.
export default function FollowUpsPage() {
  return (
    <Suspense fallback={<FollowupsSkeleton />}>
      <FollowupsView />
    </Suspense>
  );
}
