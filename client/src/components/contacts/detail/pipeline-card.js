'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CategoryBadge, PriorityBadge, TagList } from '@/components/badges';
import { BookingDialog } from '@/components/contacts/stage-controls';
import { PrioritySelect } from '@/components/contacts/priority-select';
import { CategorySelect } from '@/components/contacts/category-select';
import { TagsInput } from '@/components/contacts/tags-input';
import { AddFollowUpButton, RemoveFollowUpButton } from '@/components/followups/add-followup-dialog';
import { RoundSelect } from '@/components/followups/round-select';
import { categoryLabel, priorityLabel } from '@/lib/constants';
import { useUpdateContact } from '@/hooks/use-contact-mutations';
import { daysFromToday, formatDate, formatDateTime, formatDateWithDay, formatTime, isoDate, pluralize, relativeDay } from '@/lib/format';
import { cn } from '@/lib/utils';
import { StageBadgeTip } from './badge-tips';
import { DetailCard, DetailRow, DetailRows, Muted, TOUCH_SM, TOUCH_XS } from './detail-card';

// Errors from useUpdateContact are toasted by the hook; only successes are toasted here.

export function PipelineCard({ contact }) {
  return (
    <DetailCard title="Pipeline">
      <DetailRows>
        <DetailRow label="Stage">
          <StageBadgeTip stage={contact.stage} />
        </DetailRow>
        <DetailRow label="Type">
          <CategoryField contact={contact} />
        </DetailRow>
        <DetailRow label="Priority">
          <PriorityField contact={contact} />
        </DetailRow>
        <DetailRow label="Tags">
          <TagsField contact={contact} />
        </DetailRow>
        <DetailRow label="Status">{contact.status || <Muted>—</Muted>}</DetailRow>
        <DetailRow label="Last contacted">{contact.lastContactedAt ? formatDateTime(contact.lastContactedAt) : <Muted>Never</Muted>}</DetailRow>
        <DetailRow label="Follow-up">
          <FollowUpField contact={contact} />
        </DetailRow>
        <DetailRow label="Booking">
          <BookingField contact={contact} />
        </DetailRow>
      </DetailRows>
    </DetailCard>
  );
}

function Spinner() {
  return <Loader2 className="animate-spin" aria-hidden="true" />;
}

/** Inline priority picker; saves on change. */
function PriorityField({ contact }) {
  const update = useUpdateContact();
  const save = (priority) =>
    update.mutate({ id: contact._id, data: { priority } }, { onSuccess: () => toast.success(priority ? `Priority set to ${priorityLabel(priority)}` : 'Priority cleared') });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <PrioritySelect value={contact.priority || ''} onChange={save} disabled={update.isPending} className="w-40" placeholder="No priority" />
      {update.isPending ? <Spinner /> : <PriorityBadge priority={contact.priority} withTooltip />}
    </div>
  );
}

/** Inline contact-type picker (travel advisor / executive assistant / other); saves on change. */
function CategoryField({ contact }) {
  const update = useUpdateContact();
  const save = (category) =>
    update.mutate({ id: contact._id, data: { category } }, { onSuccess: () => toast.success(category ? `Type set to ${categoryLabel(category)}` : 'Type cleared') });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <CategorySelect value={contact.category || ''} onChange={save} disabled={update.isPending} className="w-44" placeholder="Not set" />
      {update.isPending ? <Spinner /> : <CategoryBadge category={contact.category} withTooltip />}
    </div>
  );
}

/** Tag chips with an inline editor. */
function TagsField({ contact }) {
  const update = useUpdateContact();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(contact.tags || []);
  const tags = contact.tags || [];

  if (editing) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          update.mutate(
            { id: contact._id, data: { tags: draft } },
            {
              onSuccess: () => {
                toast.success('Tags updated');
                setEditing(false);
              },
            },
          );
        }}
        className="grid gap-2 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
      >
        <TagsInput value={draft} onChange={setDraft} autoFocus />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="sm" className={TOUCH_SM} disabled={update.isPending}>
            {update.isPending ? <Spinner /> : null}
            {update.isPending ? 'Saving…' : 'Save'}
          </Button>
          <Button type="button" size="sm" variant="ghost" className={TOUCH_SM} onClick={() => setEditing(false)} disabled={update.isPending}>
            Cancel
          </Button>
        </div>
      </form>
    );
  }
  return (
    <div className="grid gap-1.5">
      {tags.length ? <TagList tags={tags} max={0} /> : <Muted>No tags</Muted>}
      <div>
        <Button
          type="button"
          size="xs"
          variant="outline"
          className={TOUCH_XS}
          onClick={() => {
            setDraft(tags);
            setEditing(true);
          }}
        >
          {tags.length ? 'Edit tags' : 'Add tags'}
        </Button>
      </div>
    </div>
  );
}

function FollowUpField({ contact }) {
  const update = useUpdateContact();
  const [editing, setEditing] = useState(false);
  const hasFollowUp = Boolean(contact.followUp);
  const overdue = hasFollowUp && daysFromToday(contact.followUp) < 0;

  const save = (data, message) =>
    update.mutate(
      { id: contact._id, data },
      {
        onSuccess: () => {
          toast.success(message);
          setEditing(false);
        },
      },
    );

  if (editing) {
    return (
      <FollowUpEditor
        contact={contact}
        pending={update.isPending}
        onCancel={() => setEditing(false)}
        onSave={({ date, note }) => save({ followUp: date, followUpNote: note }, 'Follow-up updated')}
      />
    );
  }

  return (
    <div className="grid gap-1.5">
      {hasFollowUp ? (
        <>
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-medium">{formatDate(contact.followUp)}</span>
            <span suppressHydrationWarning className={cn('text-xs', overdue ? 'font-medium text-destructive' : 'text-muted-foreground')}>
              {relativeDay(contact.followUp)}
            </span>
          </div>
          {contact.followUpNote ? <p className="text-muted-foreground">{contact.followUpNote}</p> : null}
        </>
      ) : (
        <Muted>No follow-up scheduled</Muted>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <RoundSelect contact={contact} />
        <span className="text-xs text-muted-foreground">{contact.followUpCount ? `${pluralize(contact.followUpCount, 'follow-up')} done` : 'No follow-ups done yet'}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <AddFollowUpButton contact={contact} size="xs" className={TOUCH_XS} />
        <RemoveFollowUpButton contact={contact} size="xs" className={TOUCH_XS} />
        <Button type="button" size="xs" variant="outline" className={TOUCH_XS} onClick={() => setEditing(true)} disabled={update.isPending}>
          {hasFollowUp ? 'Edit' : 'Set follow-up'}
        </Button>
        {hasFollowUp ? (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className={TOUCH_XS}
            disabled={update.isPending}
            onClick={() => save({ followUp: null, followUpNote: '' }, 'Follow-up cleared')}
          >
            {update.isPending ? <Spinner /> : null}
            {update.isPending ? 'Clearing…' : 'Clear'}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function FollowUpEditor({ contact, pending, onSave, onCancel }) {
  const [date, setDate] = useState(() => isoDate(contact.followUp));
  const [note, setNote] = useState(contact.followUpNote || '');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ date, note: note.trim() });
      }}
      className="grid gap-3 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200"
    >
      <div className="grid gap-3 sm:grid-cols-[10rem_minmax(0,1fr)]">
        <div className="grid gap-1.5">
          <Label htmlFor="fu-date" className="text-xs text-muted-foreground">
            Date
          </Label>
          <Input id="fu-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="fu-note" className="text-xs text-muted-foreground">
            Note
          </Label>
          <Input id="fu-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What to follow up on" />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" className={TOUCH_SM} disabled={pending}>
          {pending ? <Spinner /> : null}
          {pending ? 'Saving…' : 'Save'}
        </Button>
        <Button type="button" size="sm" variant="ghost" className={TOUCH_SM} onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function BookingField({ contact }) {
  const update = useUpdateContact();
  const [open, setOpen] = useState(false);
  const booking = contact.booking || {};
  const hasBooking = Boolean(booking.date);
  const past = hasBooking && daysFromToday(booking.date) < 0;

  const save = (data, message) =>
    update.mutate(
      { id: contact._id, data },
      {
        onSuccess: () => {
          toast.success(message);
          setOpen(false);
        },
      },
    );

  return (
    <div className="grid gap-1.5">
      {hasBooking ? (
        <>
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-medium">
              {formatDateWithDay(booking.date)}
              {booking.time ? `, ${formatTime(booking.time)}` : ''}
            </span>
            <span suppressHydrationWarning className="text-xs text-muted-foreground">
              {past ? 'Past' : relativeDay(booking.date)}
            </span>
          </div>
          {booking.note ? <p className="text-muted-foreground">{booking.note}</p> : null}
          {booking.bookedAt ? <p className="text-xs text-muted-foreground">Booked on {formatDateTime(booking.bookedAt)}</p> : null}
        </>
      ) : (
        <Muted>No booking</Muted>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="xs" variant="outline" className={TOUCH_XS} onClick={() => setOpen(true)} disabled={update.isPending}>
          {hasBooking ? 'Edit booking' : 'Add booking'}
        </Button>
        {hasBooking ? (
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className={TOUCH_XS}
            disabled={update.isPending}
            onClick={() => save({ booking: { date: null, time: '', note: '' } }, 'Booking cleared')}
          >
            {update.isPending && !open ? <Spinner /> : null}
            {update.isPending && !open ? 'Clearing…' : 'Clear booking'}
          </Button>
        ) : null}
      </div>
      {open ? (
        <BookingDialog
          open
          onOpenChange={(v) => !v && setOpen(false)}
          title={hasBooking ? 'Edit booking' : 'Add booking'}
          description={`Booking for ${contact.name || 'this contact'}`}
          initial={booking}
          submitting={update.isPending}
          onConfirm={(next) => save({ booking: next }, 'Booking updated')}
        />
      ) : null}
    </div>
  );
}
