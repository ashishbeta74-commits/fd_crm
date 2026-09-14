import { PageHeader } from '@/components/page-header';
import { ImportWizard } from '@/components/import/import-wizard';
import { LinkedSheets } from '@/components/import/linked-sheets';
import { ImportHistory } from '@/components/import/import-history';

export const metadata = { title: 'Import' };

export default function ImportPage() {
  return (
    <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
      <PageHeader
        title="Import contacts"
        description="Upload an Excel or CSV workbook or paste a Google Sheet link, map its columns to contact fields, name the list the contacts go into and review the result. Linked sheets can be re-synced any time."
      />
      {/* min-w-0 so wide children (tables) scroll inside their card instead of stretching the page */}
      <div className="grid min-w-0 grid-cols-1 gap-8">
        <ImportWizard />
        <LinkedSheets />
        <ImportHistory />
      </div>
    </div>
  );
}
