import { Suspense } from 'react';
import { PageHeader } from '@/components/page-header';
import { LinkedinView, LinkedinViewFallback } from '@/components/linkedin/linkedin-view';

export const metadata = { title: 'LinkedIn CRM' };

export default function LinkedinPage() {
  return (
    <>
      <PageHeader
        title="LinkedIn CRM"
        description="The same contacts, worked the LinkedIn way: follow, engage, connect, converse, convert. Log each playbook step and the stage updates itself."
      />
      <Suspense fallback={<LinkedinViewFallback />}>
        <LinkedinView />
      </Suspense>
    </>
  );
}
