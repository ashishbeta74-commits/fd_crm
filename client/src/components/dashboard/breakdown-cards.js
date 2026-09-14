import Link from 'next/link';
import { STAGES, STAGE_STYLES } from '@/lib/constants';
import { BarList } from '@/components/dashboard/bar-list';
import { EmptyState, SectionCard } from '@/components/dashboard/section-card';

export function PipelineCard({ total, byStage }) {
  return (
    <SectionCard title="Pipeline" footer={{ href: '/contacts', label: 'All contacts' }}>
      {total ? (
        <BarList
          total={total}
          rows={STAGES.map((s) => ({
            key: s.key,
            label: s.label,
            count: byStage[s.key],
            href: `/contacts?stage=${s.key}`,
            dot: STAGE_STYLES[s.key].dot,
            fill: STAGE_STYLES[s.key].dot,
            hint: s.description,
          }))}
        />
      ) : (
        <EmptyState>
          <p>No contacts yet.</p>
          <Link href="/import" className="font-medium text-primary hover:underline">
            Import a spreadsheet
          </Link>
        </EmptyState>
      )}
    </SectionCard>
  );
}

