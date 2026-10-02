'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, RotateCw } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { REPEATABLE_STAGES, STAGES, STAGE_STYLES, stageAttempt, stageLabel, stageWithAttempt } from '@/lib/constants';
import { formatDateTime, isoDate, weekdayName } from '@/lib/format';
import { useLogActivity, useUpdateContact } from '@/hooks/use-contact-mutations';
import { cn } from '@/lib/utils';

// Select items cannot share the current stage's value, so "called again" gets its own.
const AGAIN = '__again__';

/** Small attempt number after a stage name ("Voice Mail ³"-style pill); nothing for a first attempt. */
export function AttemptPill({ attempt, className }) {
  if (!(attempt > 1)) return null;
  return (
    <span className={cn('rounded-full bg-foreground/10 px-1.5 text-[11px] leading-4 font-semibold tabular-nums', className)} title={`Attempt ${attempt}`} aria-label={`attempt ${attempt}`}>
      {attempt}
    </span>
  );
}

/**
 * Record the contact's current call result once more ("Voice Mail" -> "Voice Mail 2"): logs a call with that
 * result, which the API counts as another attempt and dates today.
 */
export function useCallAgain() {
  const log = useLogActivity();
  return (contact) => {
    const next = stageAttempt(contact) + 1;
    return log
      .mutateAsync({ id: contact._id, data: { type: 'call', stage: contact.stage } })
      .then(() => toast.success(`${contact.name || 'Contact'}: ${stageWithAttempt(contact.stage, next)} logged`));
  };
}

/**
 * Compact stage dropdown showing the stage colour dot and, after repeated calls, the attempt number.
 * Given the `contact`, a call result offers "<result> again" on top, which records another attempt.
 */
export function StageSelect({ value, onChange, disabled, className, size = 'sm', contact }) {
  const callAgain = useCallAgain();
  const attempt = contact ? stageAttempt(contact) : 1;
  const canRepeat = Boolean(contact) && REPEATABLE_STAGES.has(value);
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        if (v === AGAIN) callAgain(contact).catch(() => {});
        else onChange(v);
      }}
      disabled={disabled}
    >
      <SelectTrigger size={size} className={cn('h-8 gap-1.5', className)} aria-label={attempt > 1 ? `Stage: ${stageWithAttempt(value, attempt)}` : 'Stage'}>
        <SelectValue placeholder="Stage">
          {value ? (
            <>
              <span className={cn('size-2 shrink-0 rounded-full', STAGE_STYLES[value]?.dot)} aria-hidden="true" />
              <span className="truncate">{stageLabel(value)}</span>
              <AttemptPill attempt={attempt} />
            </>
          ) : undefined}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {canRepeat ? (
          <>
            <SelectItem value={AGAIN}>
              <RotateCw className="size-3.5" aria-hidden="true" />
              {stageLabel(value)} again
              <span className="text-xs text-muted-foreground">→ {stageWithAttempt(value, attempt + 1)}</span>
            </SelectItem>
            <SelectSeparator />
          </>
        ) : null}
        {STAGES.map((s) => (
          <SelectItem key={s.key} value={s.key}>
            <span className={cn('size-2 shrink-0 rounded-full', STAGE_STYLES[s.key].dot)} aria-hidden="true" />
            {s.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Ask for booking date / time / note (used when a contact moves to Future Booking). */
export function BookingDialog({ open, onOpenChange, title = 'Future booking', description, initial, onConfirm, submitting }) {
  const [date, setDate] = useState(() => isoDate(initial?.date) || '');
  const [time, setTime] = useState(initial?.time || '');
  const [note, setNote] = useState(initial?.note || '');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onConfirm({ date: date || null, time, note });
          }}
          className="grid gap-4"
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription className="wrap-break-word">{description}</DialogDescription> : null}
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="bk-date">Date of booking</Label>
              <Input id="bk-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              <p className="min-h-4 text-xs text-muted-foreground" aria-live="polite">
                {date ? `Day: ${weekdayName(date)}` : 'Pick a date to see the day'}
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="bk-time">Time</Label>
              <Input id="bk-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
              <p className="min-h-4 text-xs text-muted-foreground">{initial?.bookedAt ? `Booked on ${formatDateTime(initial.bookedAt)}` : 'New booking - "booked on" is set when you save'}</p>
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="bk-note">Note</Label>
              <Input id="bk-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What is booked?" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} aria-busy={submitting || undefined}>
              {submitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              {submitting ? 'Saving…' : 'Save booking'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Stage changes with the "Future Booking asks for date/time/note" rule built in.
 * Usage:
 *   const { changeStage, stageDialog, pending } = useStageChange();
 *   <StageSelect value={c.stage} onChange={(s) => changeStage(c, s)} />
 *   {stageDialog}
 */
export function useStageChange() {
  const update = useUpdateContact();
  const [prompt, setPrompt] = useState(null); // { contact, stage }

  const apply = async (contact, stage, booking) => {
    const data = { stage };
    if (booking) data.booking = booking;
    await update.mutateAsync({ id: contact._id, data });
    toast.success(`${contact.name || 'Contact'} moved to ${stageLabel(stage)}`);
  };

  const changeStage = (contact, stage) => {
    if (!contact || stage === contact.stage) return Promise.resolve(false);
    if (stage === 'future_booking' && !contact.booking?.date) {
      setPrompt({ contact, stage });
      return Promise.resolve(false);
    }
    return apply(contact, stage).then(() => true);
  };

  const stageDialog = prompt ? (
    <BookingDialog
      key={prompt.contact._id}
      open
      onOpenChange={(v) => !v && setPrompt(null)}
      description={`${prompt.contact.name || 'This contact'} will move to Future Booking.`}
      initial={prompt.contact.booking}
      submitting={update.isPending}
      onConfirm={async (booking) => {
        await apply(prompt.contact, prompt.stage, booking);
        setPrompt(null);
      }}
    />
  ) : null;

  return { changeStage, stageDialog, pending: update.isPending };
}
