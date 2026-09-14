import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toQuery } from '@/lib/api';
import { formatDateTime, pluralize } from '@/lib/format';
import { cn } from '@/lib/utils';
import { formatCount } from '@/components/dashboard/stat-tile';
import { EmptyState, LIST_ROW, SectionCard } from '@/components/dashboard/section-card';

function totalsSummary(t = {}) {
  const parts = [`${t.created || 0} created`, `${t.updated || 0} updated`, `${t.skipped || 0} skipped`];
  if (t.errorCount) parts.push(pluralize(t.errorCount, 'error'));
  return parts.join(' · ');
}

// GET /api/stats buckets hand-created contacts (empty source.sheetName) under a '(manual)'
// sentinel. It is not a real sheet name, so ?sheet=(manual) would match nothing.
export const isManualSheet = (row) => !row.sheet || row.sheet === '(manual)';

// min-h-9 keeps the linked rows a comfortable touch target.
const SHEET_ROW = '-mx-2 flex min-h-9 items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm';

function SheetRow({ row }) {
  const count = <span className="shrink-0 font-medium tabular-nums">{formatCount(row.count)}</span>;
  if (isManualSheet(row)) {
    return (
      <div className={SHEET_ROW}>
        <span className="min-w-0 truncate text-muted-foreground">Added manually</span>
        {count}
      </div>
    );
  }
  return (
    <Link
      href={`/contacts${toQuery({ sheet: row.sheet })}`}
      className={cn(SHEET_ROW, 'transition-colors duration-200 hover:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50')}
    >
      <span className="min-w-0 truncate" title={row.sheet}>
        {row.sheet}
      </span>
      {count}
    </Link>
  );
}

export function ImportsCard({ imports, bySheet }) {
  return (
    <SectionCard title="Imports" footer={{ href: '/import', label: 'Import more' }}>
      {imports.length ? (
        <ul className="-my-2 divide-y">
          {imports.map((b) => (
            <li key={b._id}>
              <div className={LIST_ROW}>
                <div className="flex items-center justify-between gap-2">
                  <p className={cn('min-w-0 truncate text-sm font-medium', b.undoneAt && 'text-muted-foreground line-through')} title={b.fileName}>
                    {b.fileName}
                  </p>
                  {b.undoneAt ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="secondary">Undone</Badge>
                      </TooltipTrigger>
                      <TooltipContent>Undone on {formatDateTime(b.undoneAt)} - its contacts were removed</TooltipContent>
                    </Tooltip>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">{formatDateTime(b.createdAt)}</p>
                <p className="text-xs text-muted-foreground">{totalsSummary(b.totals)}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState>
          <p>No imports yet.</p>
        </EmptyState>
      )}

      {bySheet.length ? (
        <div className="mt-4 border-t pt-3">
          <h3 className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">By sheet</h3>
          <ul className="flex flex-col">
            {bySheet.map((s) => (
              <li key={s.sheet}>
                <SheetRow row={s} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </SectionCard>
  );
}
