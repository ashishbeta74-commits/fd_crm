import { Suspense } from 'react';
import { PageHeader } from '@/components/page-header';
import { WorkspaceView, WorkspaceViewFallback } from '@/components/workspace/workspace-view';

export const metadata = { title: 'BMC Price Checks' };

export default function PriceChecksPage() {
  return (
    <>
      <PageHeader title="BMC Price Checks" description="Every price check on the BookMyCar website: who checked, the trip, the prices shown and whether they booked. Set the Follow-up as you reach out; filter by New, Booked?, phone / email or date." />
      <Suspense fallback={<WorkspaceViewFallback />}>
        <WorkspaceView workspace="pricechecks" href="/price-checks" />
      </Suspense>
    </>
  );
}
