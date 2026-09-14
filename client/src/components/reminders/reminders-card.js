'use client';

import { useState } from 'react';
import { BellPlus, Flag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PriorityBadge } from '@/components/badges';
import { ReminderActions } from '@/components/reminders/reminder-actions';
import { ReminderDialog } from '@/components/reminders/reminder-dialog';
import { DetailCard, EmptyNote, TOUCH_SM } from '@/components/contacts/detail/detail-card';
import { formatDateTime, timeAgo } from '@/lib/format';
import { priorityLabel } from '@/lib/constants';
import { cn } from '@/lib/utils';

function ReminderRow({ reminder, contact }) {
  const overdue = !reminder.done && new Date(reminder.at) < new Date();
  return (
    <li className={cn('flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between', reminder.done && 'opacity-60')}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className={cn('font-medium', overdue && 'text-destructive', reminder.done && 'line-through')} suppressHydrationWarning>
            {formatDateTime(reminder.at)}
          </span>
          <span className={cn('text-xs', overdue ? 'text-destructive' : 'text-muted-foreground')} suppressHydrationWarning>
            {reminder.done ? `done ${timeAgo(reminder.doneAt)}` : overdue ? `${timeAgo(reminder.at)} - overdue` : timeAgo(reminder.at)}
          </span>
          <PriorityBadge priority={reminder.priority} size="xs" />
        </div>
        {reminder.note ? <p className="mt-0.5 text-sm text-muted-foreground wrap-break-word">{reminder.note}</p> : null}
      </div>
      <ReminderActions reminder={reminder} contact={contact} />
    </li>
  );
}

/**
 * Reminders on the contact page. High-priority contacts without an open reminder get a nudge to add one,
 * so "priority" always turns into a dated action.
 */
export function RemindersCard({ contact }) {
  const [adding, setAdding] = useState(false);
  const reminders = contact.reminders || [];
  const open = reminders.filter((r) => !r.done);
  const done = reminders.filter((r) => r.done);
  const needsOne = !open.length && (contact.priority === 'urgent' || contact.priority === 'high');

  return (
    <DetailCard title="Reminders">
      {needsOne ? (
        <div className="mb-4 flex flex-col gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm sm:flex-row sm:items-center sm:justify-between dark:border-amber-900 dark:bg-amber-950/30">
          <p className="flex items-center gap-2">
            <Flag className="size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            <span>
              This is a <strong>{priorityLabel(contact.priority)}</strong> priority contact with no reminder yet.
            </span>
          </p>
          <Button size="sm" className={TOUCH_SM} onClick={() => setAdding(true)}>
            <BellPlus /> Remind me
          </Button>
        </div>
      ) : null}

      {reminders.length ? (
        <ul className="divide-y">
          {open.map((r) => (
            <ReminderRow key={r._id} reminder={r} contact={contact} />
          ))}
          {done.map((r) => (
            <ReminderRow key={r._id} reminder={r} contact={contact} />
          ))}
        </ul>
      ) : (
        <EmptyNote>No reminders. Reminders ring in the bell at the top and show on the Follow-ups page.</EmptyNote>
      )}

      {!needsOne ? (
        <div className="mt-4">
          <Button size="sm" variant="outline" className={TOUCH_SM} onClick={() => setAdding(true)}>
            <BellPlus /> Add reminder
          </Button>
        </div>
      ) : null}

      {adding ? <ReminderDialog contact={contact} open onOpenChange={(v) => !v && setAdding(false)} /> : null}
    </DetailCard>
  );
}
