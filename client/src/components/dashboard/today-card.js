'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Bell, CalendarClock, CheckCircle2 } from 'lucide-react';
import { api, qk } from '@/lib/api';
import { daysFromToday, formatDate, formatDateTime, relativeDay, timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import { PriorityBadge } from '@/components/badges';
import { ReminderActions } from '@/components/reminders/reminder-actions';
import { EmptyState, LIST_ROW, SectionCard } from '@/components/dashboard/section-card';

const MAX = 7;

/**
 * "Today": due reminders (most urgent first) and follow-ups that are overdue or due today,
 * so the first thing on the dashboard is the list of people to call now.
 */
export function TodayCard({ followUps }) {
  const { data: due } = useQuery({ queryKey: qk.remindersDue, queryFn: api.reminders.due, refetchInterval: 15_000 });
  const reminders = (due?.items || []).map((r) => ({
    key: `r-${r._id}`,
    kind: 'reminder',
    at: r.at,
    overdue: r.overdue,
    priority: r.priority,
    priorityRank: { urgent: 4, high: 3, medium: 2, low: 1 }[r.priority] || 0,
    note: r.note,
    contact: r.contact,
    reminder: r,
  }));
  const followups = (followUps || [])
    .filter((c) => daysFromToday(c.followUp) <= 0)
    .map((c) => ({ key: `f-${c._id}`, kind: 'followUp', at: c.followUp, overdue: daysFromToday(c.followUp) < 0, priority: c.priority, priorityRank: c.priorityRank || 0, note: c.followUpNote, contact: c }));
  const items = [...reminders, ...followups].sort((a, b) => b.priorityRank - a.priorityRank || new Date(a.at) - new Date(b.at)).slice(0, MAX);

  return (
    <SectionCard title="Today" footer={{ href: '/follow-ups', label: 'Open follow-ups' }} className="border-primary/20 md:col-span-2 xl:col-span-1">
      {items.length ? (
        <ul className="-my-2 divide-y">
          {items.map((it) => {
            const c = it.contact || {};
            const Icon = it.kind === 'reminder' ? Bell : CalendarClock;
            return (
              <li key={it.key}>
                <div className={cn(LIST_ROW, 'flex items-start gap-3')}>
                  <span className={cn('mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full', it.overdue ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground')}>
                    <Icon className="size-3.5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <Link href={`/contacts/${c._id}`} className="truncate text-sm font-medium hover:underline">
                        {c.name || 'Unnamed contact'}
                      </Link>
                      <PriorityBadge priority={it.priority} size="xs" />
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{[c.title, c.companyName].filter(Boolean).join(' · ')}</p>
                    <p className={cn('text-xs', it.overdue ? 'text-destructive' : 'text-muted-foreground')} suppressHydrationWarning>
                      {it.kind === 'reminder' ? (it.overdue ? `Reminder · ${timeAgo(it.at)}` : `Reminder · ${formatDateTime(it.at)}`) : `Follow-up · ${relativeDay(it.at)} (${formatDate(it.at)})`}
                      {it.note ? ` · ${it.note}` : ''}
                    </p>
                    {it.kind === 'reminder' ? (
                      <div className="mt-1">
                        <ReminderActions reminder={it.reminder} contact={c} compact showEdit={false} showDelete={false} />
                      </div>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState>
          <CheckCircle2 className="size-6 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          <p>Nothing due right now. Nice.</p>
        </EmptyState>
      )}
    </SectionCard>
  );
}
