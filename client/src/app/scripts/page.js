import { PageHeader } from '@/components/page-header';
import { ScriptsView } from '@/components/scripts/scripts-view';

export const metadata = { title: 'Phone scripts' };

export default function ScriptsPage() {
  return (
    <>
      <PageHeader title="Phone scripts & Q&A" description="What to say on a call, and how to answer what they say back. Anyone on the team can add, edit and copy entries." />
      <ScriptsView />
    </>
  );
}
