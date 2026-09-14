'use client';

import Link from 'next/link';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { daysFromToday, formatDate, formatDateWithDay, formatTime, relativeDay } from '@/lib/format';
import { cn } from '@/lib/utils';
import { EmptyState, LIST_ROW, SectionCard, TruncatedText } from '@/components/dashboard/section-card';

function ContactLine({ contact }) {
  const name = contact.name || 'Unnamed contact';
  return (
    <div className="min-w-0">
      <Link href={`/contacts/${contact._id}`} title={name} className="block truncate text-sm font-medium hover:underline">
        {name}
      </Link>
      {contact.companyName ? (
        <p className="truncate text-xs text-muted-foreground" title={contact.companyName}>
          {contact.companyName}
        </p>
      ) : null}
    </div>
  );
}

export function FollowUpsCard({ items }) {
  return (
    <SectionCard title="Follow-ups due" footer={{ href: '/follow-ups', label: 'View all' }}>
      {items.length ? (
        <ul className="-my-2 divide-y">
          {items.map((c) => {
            const overdue = daysFromToday(c.followUp) < 0;
            return (
              <li key={c._id}>
                <div className={cn(LIST_ROW, 'flex items-start justify-between gap-3')}>
                  <div className="min-w-0 flex-1">
                    <ContactLine contact={c} />
                    <TruncatedText text={c.followUpNote} className="text-xs text-muted-foreground" />
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span suppressHydrationWarning className={cn('shrink-0 text-xs font-medium', overdue ? 'text-destructive' : 'text-muted-foreground')}>
                        {relativeDay(c.followUp)}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>Follow-up on {formatDate(c.followUp)}</TooltipContent>
                  </Tooltip>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState>
          <p>Nothing due this week.</p>
        </EmptyState>
      )}
    </SectionCard>
  );
}

export function BookingsCard({ items }) {
  return (
    <SectionCard title="Upcoming bookings" footer={{ href: '/follow-ups?tab=week', label: 'View all' }}>
      {items.length ? (
        <ul className="-my-2 divide-y">
          {items.map((c) => (
            <li key={c._id}>
              <div className={cn(LIST_ROW, 'flex gap-3')}>
                <div className="w-28 shrink-0 text-xs">
                  <p className="font-medium">{formatDateWithDay(c.booking?.date)}</p>
                  {c.booking?.time ? <p className="text-muted-foreground">{formatTime(c.booking.time)}</p> : null}
                  {c.booking?.bookedAt ? <p className="text-muted-foreground">Booked {formatDate(c.booking.bookedAt)}</p> : null}
                </div>
                <div className="min-w-0 flex-1">
                  <ContactLine contact={c} />
                  <TruncatedText text={c.booking?.note} className="text-xs text-muted-foreground" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState>
          <p>No upcoming bookings.</p>
        </EmptyState>
      )}
    </SectionCard>
  );
}
