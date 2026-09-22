'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api, qk } from '@/lib/api';
import { formatDateWithDay } from '@/lib/format';
import { zonedDateIso } from '@/lib/tz';
import { cn } from '@/lib/utils';
import { EmptyState, LIST_ROW, SectionCard } from '@/components/dashboard/section-card';

const STAGE = 'prospect';
const DAYS = 14;
const REFETCH_MS = 60_000;

// The Contacts list filtered to the prospects that entered the stage on that day (newest first).
const dayHref = (day) => `/contacts?stage=${STAGE}&stageFrom=${day}&stageTo=${day}&sort=stageChangedAt&dir=desc`;

/**
 * Prospects by the day they were moved to Prospect (New York calendar), newest day first. A contact
 * moved on again later leaves its day, like the "Prospects today" tile. Each row opens the filtered list.
 */
export function StageDaysCard() {
  const { data, isPending, isError, error } = useQuery({
    queryKey: qk.stageDays(STAGE, DAYS),
    queryFn: () => api.stageDays(STAGE, DAYS),
    refetchInterval: REFETCH_MS,
  });
  const items = data?.items || [];
  const total = items.reduce((n, d) => n + d.count, 0);
  const max = Math.max(1, ...items.map((d) => d.count));
  const today = zonedDateIso();
  const oldest = items.at(-1)?.day;

  return (
    <SectionCard title="Prospects by day" footer={oldest ? { href: `/contacts?stage=${STAGE}&stageFrom=${oldest}&sort=stageChangedAt&dir=desc`, label: `All ${total} from the last ${DAYS} days` } : undefined}>
      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : isError ? (
        <EmptyState>
          <p>{error?.message || "Couldn't load the prospects by day."}</p>
        </EmptyState>
      ) : !total ? (
        <EmptyState>
          <p>No contact was moved to Prospect in the last {DAYS} days.</p>
        </EmptyState>
      ) : (
        <ul className="-my-2 divide-y">
          {items.map((d) => {
            const label = d.day === today ? 'Today' : formatDateWithDay(d.day);
            const row = (
              <div className={cn(LIST_ROW, 'flex items-center gap-3', !d.count && 'hover:bg-transparent')}>
                <span className={cn('w-36 shrink-0 text-sm', d.count ? 'font-medium' : 'text-muted-foreground')} suppressHydrationWarning>
                  {label}
                </span>
                <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <span className="block h-full rounded-full bg-primary/70 transition-[width] duration-300" style={{ width: `${Math.round((d.count / max) * 100)}%` }} />
                </span>
                <span className={cn('w-8 shrink-0 text-right text-sm tabular-nums', d.count ? 'font-semibold' : 'text-muted-foreground')}>{d.count}</span>
              </div>
            );
            return (
              <li key={d.day}>
                {d.count ? (
                  <Link href={dayHref(d.day)} title={`Open the ${d.count} prospect${d.count === 1 ? '' : 's'} added on ${formatDateWithDay(d.day)}`} className="block">
                    {row}
                  </Link>
                ) : (
                  row
                )}
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
