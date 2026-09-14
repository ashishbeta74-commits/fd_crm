import { Suspense } from 'react';
import { PageHeader } from '@/components/page-header';
import { TemplatesView, TemplatesViewFallback } from '@/components/templates/templates-view';

export const metadata = { title: 'Email templates' };

export default function TemplatesPage() {
  return (
    <>
      <PageHeader
        title="Email templates"
        description="Reusable emails with merge fields such as {{firstName}} and {{company}}. Pick one from the Email button on a follow-up or a contact page and it is filled in with that contact's details."
      />
      <Suspense fallback={<TemplatesViewFallback />}>
        <TemplatesView />
      </Suspense>
    </>
  );
}
