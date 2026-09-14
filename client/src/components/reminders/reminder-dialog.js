'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PrioritySelect } from '@/components/contacts/priority-select';
import { dayAt, useCreateReminder, useUpdateReminder } from '@/components/reminders/use-reminder-mutations';
import { priorityLabel } from '@/lib/constants';
import { zonedDateIso, zonedTime } from '@/lib/tz';

// Dates and times in the dialog are New York wall-clock values; the API reads "YYYY-MM-DDTHH:mm" as New York time.
const localDate = (d) => zonedDateIso(d);
const localTime = (d) => zonedTime(d);

const QUICK = [
  { label: 'In 1 hour', pick: () => ({ date: zonedDateIso(new Date(Date.now() + 60 * 60_000)), time: zonedTime(new Date(Date.now() + 60 * 60_000)) }) },
  { label: 'Tomorrow 9:00', pick: () => ({ date: dayAt(1), time: '09:00' }) },
  { label: 'In 3 days', pick: () => ({ date: dayAt(3), time: '09:00' }) },
  { label: 'Next week', pick: () => ({ date: dayAt(7), time: '09:00' }) },
];

/**
 * Create (no `reminder`) or edit (`reminder` given) a reminder for `contact`.
 * The priority defaults to the contact's own priority, so urgent contacts get urgent reminders.
 */
export function ReminderDialog({ contact, reminder, open, onOpenChange, onSaved, initialNote = '' }) {
  const create = useCreateReminder();
  const update = useUpdateReminder();
  const editing = Boolean(reminder?._id);
  const start = reminder?.at ? new Date(reminder.at) : null;
  const [date, setDate] = useState(start ? localDate(start) : dayAt(1));
  const [time, setTime] = useState(start ? localTime(start) : '09:00');
  const [note, setNote] = useState(reminder?.note ?? initialNote);
  const [priority, setPriority] = useState(reminder ? reminder.priority || '' : contact?.priority || '');
  const submitting = create.isPending || update.isPending;

  const quick = (pick) => {
    const d = pick();
    setDate(d.date);
    setTime(d.time);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!date) return;
    const at = `${date}T${time || '09:00'}`;
    try {
      const saved = editing
        ? await update.mutateAsync({ id: reminder._id, data: { at, note: note.trim(), priority } })
        : await create.mutateAsync({ contactId: contact._id, at, note: note.trim(), priority });
      toast.success(editing ? 'Reminder updated' : `Reminder set${priority ? ` (${priorityLabel(priority)})` : ''}`);
      onOpenChange(false);
      onSaved?.(saved);
    } catch {
      /* toasted by the hook */
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit reminder' : 'Remind me'}</DialogTitle>
            <DialogDescription className="wrap-break-word">{contact?.name || contact?.email || 'This contact'} - the reminder shows in the bell and on the Follow-ups page.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-1.5">
            {QUICK.map((q) => (
              <Button key={q.label} type="button" size="xs" variant="outline" onClick={() => quick(q.pick)}>
                {q.label}
              </Button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="rm-date">Date</Label>
              <Input id="rm-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rm-time">Time</Label>
              <Input id="rm-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="rm-note">What to do</Label>
              <Input id="rm-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Call back about the airport run" maxLength={500} autoFocus />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="rm-priority">Priority</Label>
              <PrioritySelect id="rm-priority" size="default" className="w-full" value={priority} onChange={setPriority} placeholder="No priority" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting} aria-busy={submitting || undefined}>
              {submitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              {submitting ? 'Saving…' : editing ? 'Save reminder' : 'Set reminder'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
