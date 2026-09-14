'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Bell, CalendarCheck, CalendarClock, Check, Mail, Phone } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { PriorityBadge, StageBadge, TagList } from '@/components/badges';
import { ReminderActions } from '@/components/reminders/reminder-actions';
import { SendEmailDialog } from '@/components/email/send-email-dialog';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ContactActionsMenu } from '@/components/contacts/contact-actions-menu';
import { LinkedInIconLink } from '@/components/contacts/list/linkedin-link';
import { LogCallDialog } from '@/components/contacts/log-call-dialog';
import { useStageChange } from '@/components/contacts/stage-controls';
import { ReschedulePopover } from '@/components/followups/reschedule-popover';
import { AddFollowUpButton, RemoveFollowUpButton } from '@/components/followups/add-followup-dialog';
import { RoundSelect } from '@/components/followups/round-select';
import { useUpdateContact } from '@/hooks/use-contact-mutations';
import { formatDate, formatDateWithDay, formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';

const KINDS = {
  followUp: { label: 'Follow-up', icon: CalendarClock, iconClass: 'text-sky-600 dark:text-sky-400' },
  booking: { label: 'Booking', icon: CalendarCheck, iconClass: 'text-pink-600 dark:text-pink-400' },
  reminder: { label: 'Reminder', icon: Bell, iconClass: 'text-amber-600 dark:text-amber-400' },
};

function KindCell({ entry }) {
  const kind = KINDS[entry.kind] || KINDS.followUp;
  const Icon = kind.icon;
  const showTime = (entry.kind === 'booking' || entry.kind === 'reminder') && entry.time;
  const bookedAt = entry.kind === 'booking' ? entry.contact.booking?.bookedAt : null;
  return (
    <div className="flex items-center gap-2 text-xs lg:w-40 lg:shrink-0 lg:pt-0.5">
      <Icon className={cn('size-4 shrink-0', kind.iconClass)} aria-hidden="true" />
      <div className="leading-tight">
        {entry.kind === 'followUp' ? <RoundSelect contact={entry.contact} className="h-7 px-2" /> : <div className="font-medium">{kind.label}</div>}
        {entry.kind === 'booking' ? <div className="text-muted-foreground">{formatDateWithDay(entry.date)}</div> : null}
        {showTime ? <div className={cn('text-muted-foreground', entry.overdue && 'text-destructive')}>{formatTime(entry.time)}</div> : null}
        {bookedAt ? <div className="text-muted-foreground">Booked on {formatDate(bookedAt)}</div> : null}
        {entry.kind === 'followUp' ? <div className="mt-0.5 text-muted-foreground">{entry.contact.followUpCount ? `${entry.contact.followUpCount} done` : 'none done yet'}</div> : null}
        {entry.priority ? <PriorityBadge priority={entry.priority} size="xs" className="mt-0.5" /> : null}
      </div>
    </div>
  );
}

function ContactCell({ contact, note }) {
  // contactL1 is the LinkedIn URL, not a phone: fall back to the company number instead.
  const phone = contact.contactMain || contact.companyNo;
  return (
    <div className="min-w-0 flex-1 space-y-1 lg:min-w-48">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
        <Link href={`/contacts/${contact._id}`} className="max-w-full truncate font-medium hover:underline">
          {contact.name || contact.email || '(no name)'}
        </Link>
        {contact.title || contact.companyName ? (
          <span className="max-w-full truncate text-muted-foreground">{[contact.title, contact.companyName].filter(Boolean).join(' · ')}</span>
        ) : null}
        {phone ? (
          <a href={`tel:${phone.replace(/\s+/g, '')}`} className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground hover:underline">
            <Phone className="size-3" aria-hidden="true" />
            {phone}
          </a>
        ) : null}
        <LinkedInIconLink url={contact.contactL1} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <StageBadge stage={contact.stage} />
        <TagList tags={contact.tags} max={2} size="xs" />
      </div>
      {note ? (
        <p className="truncate text-sm text-muted-foreground" title={note}>
          {note}
        </p>
      ) : null}
    </div>
  );
}

/** Clears the follow-up date + note after confirmation. */
function FollowUpDone({ contact }) {
  const update = useUpdateContact();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Check /> Done
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Clear this follow-up?"
        description={`${contact.name || 'This contact'} will be removed from the follow-up list. Log a call first if you want a record of it.`}
        confirmLabel="Clear follow-up"
        pending={update.isPending}
        onConfirm={() =>
          update.mutate(
            { id: contact._id, data: { followUp: null, followUpNote: '' } },
            {
              onSuccess: () => {
                toast.success('Follow-up cleared');
                setOpen(false);
              },
            },
          )
        }
      />
    </>
  );
}

/** Moves the contact to Done (the booking date stays as history). */
function BookingDone({ contact }) {
  const { changeStage, stageDialog, pending } = useStageChange();
  const alreadyDone = contact.stage === 'done';
  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        disabled={pending || alreadyDone}
        title={alreadyDone ? 'Already marked done' : undefined}
        // errors are toasted by the mutation hook; swallow the rejection so it is not reported twice
        onClick={() => changeStage(contact, 'done').catch(() => {})}
      >
        <Check /> Mark done
      </Button>
      {stageDialog}
    </>
  );
}

export function FollowupRow({ entry }) {
  const { contact } = entry;
  const [callOpen, setCallOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const isReminder = entry.kind === 'reminder';
  return (
    <li className="flex flex-col gap-3 py-3 lg:flex-row lg:items-start lg:gap-4">
      <KindCell entry={entry} />
      <ContactCell contact={contact} note={entry.note} />
      {/* Not shrink-0: when the contact cell hits its width floor the buttons wrap instead of overflowing the page. */}
      <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">
        <Button size="sm" variant="outline" onClick={() => setCallOpen(true)}>
          <Phone /> Log call
        </Button>
        <Button size="sm" variant="outline" onClick={() => setEmailOpen(true)} title="Email with a template">
          <Mail /> Email
        </Button>
        {isReminder ? (
          // Done / Snooze / Edit / Delete for the reminder itself
          <ReminderActions reminder={{ _id: entry.reminderId, at: entry.at, note: entry.note, priority: entry.priority, done: false, contactId: contact._id }} contact={contact} />
        ) : (
          <>
            {entry.kind === 'followUp' ? (
              <>
                <AddFollowUpButton contact={contact} />
                <RemoveFollowUpButton contact={contact} />
              </>
            ) : null}
            <ReschedulePopover entry={entry} />
            {entry.kind === 'booking' ? <BookingDone contact={contact} /> : <FollowUpDone contact={contact} />}
          </>
        )}
        <ContactActionsMenu contact={contact} />
      </div>
      {callOpen ? <LogCallDialog key={contact._id} contact={contact} open onOpenChange={(v) => !v && setCallOpen(false)} /> : null}
      {emailOpen ? <SendEmailDialog key={`email-${contact._id}`} contact={contact} open onOpenChange={(v) => !v && setEmailOpen(false)} /> : null}
    </li>
  );
}
