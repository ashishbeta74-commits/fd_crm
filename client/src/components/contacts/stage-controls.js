'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { STAGES, STAGE_STYLES, stageLabel } from '@/lib/constants';
import { formatDateTime, isoDate, weekdayName } from '@/lib/format';
import { useUpdateContact } from '@/hooks/use-contact-mutations';
import { cn } from '@/lib/utils';

/** Compact stage dropdown showing the stage colour dot. */
export function StageSelect({ value, onChange, disabled, className, size = 'sm' }) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger size={size} className={cn('h-8 gap-1.5', className)} aria-label="Stage">
        <span className={cn('size-2 rounded-full transition-colors duration-200', STAGE_STYLES[value]?.dot)} aria-hidden="true" />
        <SelectValue placeholder="Stage" />
      </SelectTrigger>
      <SelectContent>
        {STAGES.map((s) => (
          <SelectItem key={s.key} value={s.key}>
            <span className={cn('size-2 rounded-full', STAGE_STYLES[s.key].dot)} aria-hidden="true" />
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
