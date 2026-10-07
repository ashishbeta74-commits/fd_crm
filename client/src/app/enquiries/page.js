import { Suspense } from 'react';
import { PageHeader } from '@/components/page-header';
import { WorkspaceView, WorkspaceViewFallback } from '@/components/workspace/workspace-view';

export const metadata = { title: 'Daily Enquiries' };

export default function EnquiriesPage() {
  return (
    <>
      <PageHeader title="Daily Enquiries" description="Every enquiry from the Daily Enquiry Sheet: who asked, through which channel and source, for what service and vehicle, who handled it, what was quoted and how it ended. Edit here; the sheet is re-read on sync." />
      <Suspense fallback={<WorkspaceViewFallback />}>
        <WorkspaceView workspace="enquiries" href="/enquiries" />
      </Suspense>
    </>
  );
}
