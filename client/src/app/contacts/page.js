import { Suspense } from 'react';
import { PageHeader } from '@/components/page-header';
import { ContactsView, ContactsViewFallback } from '@/components/contacts/list/contacts-view';

export const metadata = { title: 'Contacts' };

export default function ContactsPage() {
  return (
    <>
      <PageHeader title="Contacts" description="Search, filter and work your pipeline. Filters are kept in the URL, so views can be bookmarked and shared." />
      {/* useSearchParams inside the view needs a Suspense boundary above it */}
      <Suspense fallback={<ContactsViewFallback />}>
        <ContactsView />
      </Suspense>
    </>
  );
}
