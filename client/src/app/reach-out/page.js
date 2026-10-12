import { Suspense } from 'react';
import { PageHeader } from '@/components/page-header';
import { WorkspaceView, WorkspaceViewFallback } from '@/components/workspace/workspace-view';

export const metadata = { title: 'Client Reach Out' };

export default function ReachOutPage() {
  return (
    <>
      <PageHeader title="Client Reach Out" description="Client accounts from the reach-out sheet: contact details, account notes and where each outreach stands. Change a status in the table and its status date is set to today." />
      <Suspense fallback={<WorkspaceViewFallback />}>
        <WorkspaceView workspace="reachout" href="/reach-out" />
      </Suspense>
    </>
  );
}
