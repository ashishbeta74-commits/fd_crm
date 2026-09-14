'use client';

import { CalendarCheck2 } from 'lucide-react';
import { daysFromToday, formatDate, isoDate, relativeDay } from '@/lib/format';
import { FollowupRow } from '@/components/followups/followup-row';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Entries are already sorted by the API; grouping keeps that order per calendar day. */
function groupByDate(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const key = isoDate(entry.date);
    if (!groups.has(key)) groups.set(key, { key, date: entry.date, entries: [] });
    groups.get(key).entries.push(entry);
  }
  return [...groups.values()];
}

/** "Fri, 12 Sep 2026" - weekday from the UTC parts, like formatDate. */
function longDate(date) {
  const dt = new Date(date);
  if (Number.isNaN(dt.getTime())) return '';
  return `${WEEKDAYS[dt.getUTCDay()]}, ${formatDate(dt)}`;
}

// relativeDay() says "N days overdue" for any past date, which reads wrong for a booking that simply happened.
function describeDay(date, pastTense) {
  const n = daysFromToday(date);
  if (!pastTense || n === null || n >= -1) return relativeDay(date);
  return `${-n} days ago`;
}

function DateHeader({ date, pastTense }) {
  return (
    <h3 className="sticky top-0 z-10 flex flex-wrap items-baseline gap-x-2 border-b bg-background/95 py-2 text-sm font-semibold backdrop-blur">
      <span>{longDate(date)}</span>
      <span className="text-xs font-normal text-muted-foreground" suppressHydrationWarning>
        - {describeDay(date, pastTense)}
      </span>
    </h3>
  );
}

export function FollowupList({ entries, emptyText, pastTense = false }) {
  if (!entries.length) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-12 text-center">
        <CalendarCheck2 className="size-6 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      {groupByDate(entries).map((group) => (
        <section key={group.key} aria-label={longDate(group.date)}>
          <DateHeader date={group.date} pastTense={pastTense} />
          <ul className="divide-y divide-border">
            {group.entries.map((entry) => (
              <FollowupRow key={`${entry.kind}-${entry.reminderId || entry.contact._id}`} entry={entry} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
