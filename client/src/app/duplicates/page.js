import { Suspense } from 'react';
import { PageHeader } from '@/components/page-header';
import { DuplicatesView, DuplicatesViewFallback } from '@/components/duplicates/duplicates-view';

export const metadata = { title: 'Duplicates' };

export default function DuplicatesPage() {
  return (
    <>
      <PageHeader
        title="Duplicates"
        description="Contacts that look like the same person - same email, same phone with a matching name, or same name and company. Merge them into one record or mark them as different people."
      />
      <Suspense fallback={<DuplicatesViewFallback />}>
        <DuplicatesView />
      </Suspense>
    </>
  );
}
