'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api, qk } from '@/lib/api';
import { STAGES, STAGE_STYLES } from '@/lib/constants';
import { formatDateWithDay } from '@/lib/format';
import { zonedDateIso } from '@/lib/tz';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState, LIST_ROW, SectionCard } from '@/components/dashboard/section-card';

// The call-result stages the team reviews day by day (New is where contacts start, so it has no "moved to" day).
const PICKABLE = ['prospect', 'voicemail', 'not_interested', 'hung_up', 'started', 'connected', 'wrong_number', 'ready', 'converted', 'done', 'future_booking'];
const OPTIONS = PICKABLE.map((key) => STAGES.find((s) => s.key === key)).filter(Boolean);
const DAYS = 14;
const REFETCH_MS = 60_000;
const STORAGE_KEY = 'crm:stage-days-stage';

// The Contacts list filtered to the contacts that entered the stage on that day (newest first).
const dayHref = (stage, day) => `/contacts?stage=${stage}&stageFrom=${day}&stageTo=${day}&sort=stageChangedAt&dir=desc`;

const readStored = () => {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return PICKABLE.includes(v) ? v : 'prospect';
  } catch {
    return 'prospect';
  }
};

/**
 * Contacts moved to a stage per day (New York calendar), newest day first, for the stage picked in the
 * header (Prospect by default; the choice is remembered in this browser). A contact moved on again later
 * leaves its day, like the "… today" tiles. Each row opens the filtered Contacts list.
 */
export function StageDaysCard() {
  // The card only renders once the dashboard data is in (client side), so the stored choice can seed the state.
  const [stage, setStage] = useState(() => (typeof window === 'undefined' ? 'prospect' : readStored()));
  const pick = (key) => {
    setStage(key);
    try {
      localStorage.setItem(STORAGE_KEY, key);
    } catch {
      /* private window or storage blocked: the choice just is not remembered */
    }
  };

  const { data, isPending, isError, error } = useQuery({
    queryKey: qk.stageDays(stage, DAYS),
    queryFn: () => api.stageDays(stage, DAYS),
    refetchInterval: REFETCH_MS,
  });
  const items = data?.items || [];
  const total = items.reduce((n, d) => n + d.count, 0);
  const max = Math.max(1, ...items.map((d) => d.count));
  const today = zonedDateIso();
  const oldest = items.at(-1)?.day;
  const label = OPTIONS.find((o) => o.key === stage)?.label || stage;
  const bar = STAGE_STYLES[stage]?.dot || 'bg-primary/70';

  return (
    <SectionCard title="Moved to a stage, by day" footer={oldest ? { href: `/contacts?stage=${stage}&stageFrom=${oldest}&sort=stageChangedAt&dir=desc`, label: `All ${total} moved to ${label} in the last ${DAYS} days` } : undefined}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">Who was moved to the stage on which day.</p>
        <Select value={stage} onValueChange={pick}>
          <SelectTrigger className="h-8 w-44" aria-label="Stage to show by day">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OPTIONS.map((o) => (
              <SelectItem key={o.key} value={o.key}>
                <span className="flex items-center gap-2">
                  <span className={cn('size-2 rounded-full', STAGE_STYLES[o.key]?.dot)} aria-hidden="true" />
                  {o.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : isError ? (
        <EmptyState>
          <p>{error?.message || "Couldn't load the days."}</p>
        </EmptyState>
      ) : !total ? (
        <EmptyState>
          <p>
            No contact was moved to {label} in the last {DAYS} days.
          </p>
        </EmptyState>
      ) : (
        <ul className="-my-2 divide-y">
          {items.map((d) => {
            const dayLabel = d.day === today ? 'Today' : formatDateWithDay(d.day);
            const row = (
              <div className={cn(LIST_ROW, 'flex items-center gap-3', !d.count && 'hover:bg-transparent')}>
                <span className={cn('w-36 shrink-0 text-sm', d.count ? 'font-medium' : 'text-muted-foreground')} suppressHydrationWarning>
                  {dayLabel}
                </span>
                <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <span className={cn('block h-full rounded-full transition-[width] duration-300', bar)} style={{ width: `${Math.round((d.count / max) * 100)}%` }} />
                </span>
                <span className={cn('w-8 shrink-0 text-right text-sm tabular-nums', d.count ? 'font-semibold' : 'text-muted-foreground')}>{d.count}</span>
              </div>
            );
            return (
              <li key={d.day}>
                {d.count ? (
                  <Link href={dayHref(stage, d.day)} title={`Open the ${d.count} contact${d.count === 1 ? '' : 's'} moved to ${label} on ${formatDateWithDay(d.day)}`} className="block">
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
