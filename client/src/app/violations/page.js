import { Suspense } from 'react';
import { PageHeader } from '@/components/page-header';
import { WorkspaceView, WorkspaceViewFallback } from '@/components/workspace/workspace-view';

export const metadata = { title: 'Vehicle Violations' };

export default function ViolationsPage() {
  return (
    <>
      <PageHeader title="Vehicle Violations" description="Every ticket from the violations sheet: which vehicle and plate, what for, when, what it cost, who paid it and whether it was deducted from payroll. Edit here; the sheet is re-read on sync." />
      <Suspense fallback={<WorkspaceViewFallback />}>
        <WorkspaceView workspace="violations" href="/violations" />
      </Suspense>
    </>
  );
}
