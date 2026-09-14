'use client';

import Link from 'next/link';
import { Mail, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { daysFromToday, formatDate, formatTime, relativeDay, timeAgo } from '@/lib/format';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { CategoryBadge, PriorityBadge, TagList } from '@/components/badges';
import { AddFollowUpButton, RemoveFollowUpButton } from '@/components/followups/add-followup-dialog';
import { AddBookingButton } from '@/components/contacts/add-booking-button';
import { StageSelect } from '@/components/contacts/stage-controls';
import { ContactActionsMenu } from '@/components/contacts/contact-actions-menu';
import { LinkedInIconLink } from '@/components/contacts/list/linkedin-link';

const EMPTY_SET = new Set();

function CardSkeleton() {
  return (
    <div className="grid min-w-0 gap-3 rounded-lg border bg-card p-3">
      <div className="flex items-center gap-3">
        <Skeleton className="size-4" />
        <Skeleton className="h-4 w-40" />
      </div>
      <Skeleton className="h-3 w-56" />
      <Skeleton className="h-8 w-full" />
    </div>
  );
}

function ContactCard({ contact: c, selected, onToggle, onStageChange, stagePending }) {
  const email = c.email || c.primaryEmail;
  const phone = c.contactMain || c.companyNo;
  const overdue = Boolean(c.followUp) && daysFromToday(c.followUp) < 0;
  const subtitle = [c.title, c.companyName].filter(Boolean).join(' · ');
  return (
    <li className={cn('grid min-w-0 grid-cols-1 gap-2.5 rounded-lg border bg-card p-3 transition-colors', selected && 'border-primary/40 bg-accent/40')}>
      <div className="flex items-start gap-3">
        <Checkbox className="mt-1" checked={selected} onCheckedChange={(v) => onToggle(c._id, v === true)} aria-label={`Select ${c.name || 'contact'}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Link href={`/contacts/${c._id}`} className="min-w-0 truncate text-base font-semibold hover:underline">
              {c.name || '(no name)'}
            </Link>
            <LinkedInIconLink url={c.contactL1} />
          </div>
          {subtitle ? <p className="truncate text-sm text-muted-foreground">{subtitle}</p> : null}
          {c.location ? <p className="truncate text-xs text-muted-foreground">{c.location}</p> : null}
        </div>
        <ContactActionsMenu contact={c} />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <CategoryBadge category={c.category} size="xs" short />
        <PriorityBadge priority={c.priority} size="xs" />
        <TagList tags={c.tags} max={3} size="xs" />
      </div>

      {phone || email ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {phone ? (
            <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className="inline-flex min-h-8 items-center gap-1.5 text-primary">
              <Phone className="size-3.5" aria-hidden /> {phone}
            </a>
          ) : null}
          {email ? (
            <a href={`mailto:${email}`} className="inline-flex min-h-8 min-w-0 items-center gap-1.5 text-primary">
              <Mail className="size-3.5 shrink-0" aria-hidden /> <span className="truncate">{email}</span>
            </a>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <StageSelect value={c.stage} onChange={(stage) => onStageChange(c, stage)} disabled={stagePending} className="w-40" />
        <div className="grid justify-items-end gap-0.5">
          {c.followUp ? (
            <span className={cn(overdue && 'font-medium text-destructive')} suppressHydrationWarning>
              Follow-up {formatDate(c.followUp)} · {relativeDay(c.followUp)}
            </span>
          ) : null}
          {c.booking?.date ? (
            <span>
              Booking {formatDate(c.booking.date)}
              {c.booking.time ? ` ${formatTime(c.booking.time)}` : ''}
            </span>
          ) : null}
          <span suppressHydrationWarning>{c.lastContactedAt ? `Last contact ${timeAgo(c.lastContactedAt)}` : 'Never contacted'}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <AddFollowUpButton contact={c} size="sm" className="min-h-9" />
        <RemoveFollowUpButton contact={c} size="sm" className="min-h-9" />
        <AddBookingButton contact={c} size="sm" className="min-h-9" />
        <span>{c.followUpCount ? `${c.followUpCount} follow-up${c.followUpCount === 1 ? '' : 's'} done` : 'No follow-ups done yet'}</span>
      </div>
    </li>
  );
}

/** Phone / tablet layout of the contacts list: one card per contact instead of a 13-column table. */
export function ContactsCards({ items = [], loading = false, dimmed = false, selected = EMPTY_SET, onToggle, onStageChange, stagePending = false }) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-3" aria-busy>
        {[0, 1, 2, 3].map((i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    );
  }
  return (
    <ul className={cn('grid grid-cols-1 gap-3 transition-opacity duration-200', dimmed && 'opacity-60')} aria-busy={dimmed || undefined}>
      {items.map((c) => (
        <ContactCard key={c._id} contact={c} selected={selected.has(c._id)} onToggle={onToggle} onStageChange={onStageChange} stagePending={stagePending} />
      ))}
    </ul>
  );
}
