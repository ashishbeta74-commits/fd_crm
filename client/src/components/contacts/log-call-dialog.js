'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { STAGES, STAGE_MAP, STAGE_STYLES } from '@/lib/constants';
import { isoDate, weekdayName } from '@/lib/format';
import { useLogActivity } from '@/hooks/use-contact-mutations';
import { cn } from '@/lib/utils';

const KEEP = 'keep';
// The call-result stages, offered as one-click buttons on top of the full stage list.
const CALL_RESULT_STAGES = ['connected', 'voicemail', 'wrong_number'];

// Conditional sections (follow-up note, booking) fade in where they appear.
const REVEAL = 'motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-200';

/**
 * "Log a call": pick how the call went (Connected / Voice Mail / Wrong Number, or any other stage),
 * add a note, set the next follow-up, and - when moving to Future Booking - the booking.
 */
export function LogCallDialog({ contact, open, onOpenChange, onSaved }) {
  const log = useLogActivity();
  const [stage, setStage] = useState(KEEP);
  const [message, setMessage] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [followUpNote, setFollowUpNote] = useState('');
  const [bookingDate, setBookingDate] = useState(() => isoDate(contact?.booking?.date));
  const [bookingTime, setBookingTime] = useState(contact?.booking?.time || '');
  const [bookingNote, setBookingNote] = useState(contact?.booking?.note || '');
  const toBooking = stage === 'future_booking';

  const submit = async (e) => {
    e.preventDefault();
    const data = { type: 'call' };
    if (message.trim()) data.message = message.trim();
    if (stage !== KEEP) data.stage = stage;
    if (followUp) data.followUp = followUp;
    if (followUpNote.trim()) data.followUpNote = followUpNote.trim();
    if (toBooking) data.booking = { date: bookingDate || null, time: bookingTime, note: bookingNote };
    const doc = await log.mutateAsync({ id: contact._id, data });
    toast.success('Call logged');
    onOpenChange(false);
    onSaved?.(doc);
  };

  if (!contact) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-lg">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Log a call</DialogTitle>
            <DialogDescription className="wrap-break-word">
              {contact.name || 'Contact'}
              {contact.companyName ? ` · ${contact.companyName}` : ''}
              {contact.contactMain || contact.companyNo ? ` · ${contact.contactMain || contact.companyNo}` : ''}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-1.5">
            <Label id="lc-result-label">How did it go?</Label>
            <div className="grid grid-cols-3 gap-2" role="group" aria-labelledby="lc-result-label">
              {CALL_RESULT_STAGES.map((key) => {
                const s = STAGE_MAP[key];
                const selected = stage === key;
                return (
                  <Tooltip key={key}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => setStage(selected ? KEEP : key)}
                        aria-pressed={selected}
                        className={cn(
                          'min-h-9 rounded-md border px-3 py-2 text-sm font-medium transition-[color,background-color,border-color,box-shadow,transform] duration-200 motion-safe:active:scale-[0.98]',
                          selected ? cn(STAGE_STYLES[key].badge, 'ring-2 ring-ring/40') : 'bg-background hover:bg-accent hover:text-accent-foreground',
                        )}
                      >
                        {s.label}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{s.description}</TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="lc-stage">Stage after this call</Label>
              <Select value={stage} onValueChange={setStage}>
                <SelectTrigger id="lc-stage" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={KEEP}>{contact.stage === 'new' ? 'Started (automatic)' : 'Keep current stage'}</SelectItem>
                  {STAGES.filter((s) => s.key !== 'new').map((s) => (
                    <SelectItem key={s.key} value={s.key}>
                      <span className={cn('size-2 rounded-full', STAGE_STYLES[s.key].dot)} aria-hidden="true" />
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="lc-followUp">Next follow-up</Label>
              <Input id="lc-followUp" type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
            </div>
            {followUp ? (
              <div className={cn('grid gap-1.5 sm:col-span-2', REVEAL)}>
                <Label htmlFor="lc-followUpNote">Follow-up note</Label>
                <Input id="lc-followUpNote" value={followUpNote} onChange={(e) => setFollowUpNote(e.target.value)} />
              </div>
            ) : null}
          </div>

          {toBooking ? (
            <div className={cn('grid gap-3 rounded-lg border border-pink-300 bg-pink-50/50 p-3 sm:grid-cols-2 dark:border-pink-900 dark:bg-pink-950/20', REVEAL)}>
              <div className="grid gap-1.5">
                <Label htmlFor="lc-bkDate">Date of booking</Label>
                <Input id="lc-bkDate" type="date" value={bookingDate} onChange={(e) => setBookingDate(e.target.value)} required />
                <p className="min-h-4 text-xs text-muted-foreground" aria-live="polite">
                  {bookingDate ? `Day: ${weekdayName(bookingDate)}` : ''}
                </p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="lc-bkTime">Time</Label>
                <Input id="lc-bkTime" type="time" value={bookingTime} onChange={(e) => setBookingTime(e.target.value)} />
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="lc-bkNote">Booking note</Label>
                <Input id="lc-bkNote" value={bookingNote} onChange={(e) => setBookingNote(e.target.value)} />
              </div>
            </div>
          ) : null}

          <div className="grid gap-1.5">
            <Label htmlFor="lc-message">Note</Label>
            <Textarea id="lc-message" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="What was discussed?" />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={log.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={log.isPending} aria-busy={log.isPending || undefined}>
              {log.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              {log.isPending ? 'Saving…' : 'Save call'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Plain note dialog (POST activities type=note). */
export function NoteDialog({ contact, open, onOpenChange, onSaved }) {
  const log = useLogActivity();
  const [message, setMessage] = useState('');
  if (!contact) return null;
  const submit = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;
    const doc = await log.mutateAsync({ id: contact._id, data: { type: 'note', message: message.trim() } });
    toast.success('Note added');
    setMessage('');
    onOpenChange(false);
    onSaved?.(doc);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Add a note</DialogTitle>
            <DialogDescription className="wrap-break-word">{contact.name || 'Contact'}</DialogDescription>
          </DialogHeader>
          <Textarea autoFocus rows={4} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Write a note…" aria-label="Note" />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={log.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={log.isPending || !message.trim()} aria-busy={log.isPending || undefined}>
              {log.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              {log.isPending ? 'Saving…' : 'Add note'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
