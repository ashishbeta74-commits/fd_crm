import { Suspense } from 'react';
import { PageHeader } from '@/components/page-header';
import { WorkspaceView, WorkspaceViewFallback } from '@/components/workspace/workspace-view';

export const metadata = { title: 'Reservations' };

export default function ReservationsPage() {
  return (
    <>
      <PageHeader title="Reservations" description="Every trip from the Limo Anywhere reservation exports, one tab per year. Turn on Merge duplicates to see one row per passenger with their trip count, total and first / last trip; click a passenger to see their trips." />
      <Suspense fallback={<WorkspaceViewFallback />}>
        <WorkspaceView workspace="reservations" href="/reservations" />
      </Suspense>
    </>
  );
}
