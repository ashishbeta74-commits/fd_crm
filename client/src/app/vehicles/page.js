import { Suspense } from 'react';
import { PageHeader } from '@/components/page-header';
import { WorkspaceView, WorkspaceViewFallback } from '@/components/workspace/workspace-view';

export const metadata = { title: 'Vehicles' };

export default function VehiclesPage() {
  return (
    <>
      <PageHeader title="Vehicles" description="The fleet register: each vehicle's plate and VIN, registration, insurance and inspection expiries, EZ Pass, battery and oil-change history. Expired dates show in red, ones due within a month in amber." />
      <Suspense fallback={<WorkspaceViewFallback />}>
        <WorkspaceView workspace="vehicles" href="/vehicles" />
      </Suspense>
    </>
  );
}
