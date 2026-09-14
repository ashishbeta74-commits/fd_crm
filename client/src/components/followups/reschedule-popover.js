'use client';

import { useId, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { useUpdateContact } from '@/hooks/use-contact-mutations';
import { isoDate, weekdayName } from '@/lib/format';

/** Move a follow-up (date) or booking (date + time) to another day without opening the full editor. */
export function ReschedulePopover({ entry }) {
  const id = useId();
  const update = useUpdateContact();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const isBooking = entry.kind === 'booking';

  const handleOpenChange = (next) => {
    if (next) {
      setDate(isoDate(entry.date));
      setTime(entry.time || '');
    }
    setOpen(next);
  };

  const submit = (e) => {
    e.preventDefault();
    if (!date) return;
    const data = isBooking ? { booking: { date, time } } : { followUp: date };
    update.mutate(
      { id: entry.contact._id, data },
      {
        onSuccess: () => {
          toast.success(isBooking ? 'Booking rescheduled' : 'Follow-up rescheduled');
          setOpen(false);
        },
      },
    );
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline">
          <CalendarDays /> Reschedule
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <form onSubmit={submit} className="grid gap-3">
          <PopoverHeader>
            <PopoverTitle>Reschedule {isBooking ? 'booking' : 'follow-up'}</PopoverTitle>
          </PopoverHeader>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-date`}>Date</Label>
            <Input id={`${id}-date`} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            <p className="min-h-4 text-xs text-muted-foreground" aria-live="polite">
              {date ? `Day: ${weekdayName(date)}` : ''}
            </p>
          </div>
          {isBooking ? (
            <div className="grid gap-1.5">
              <Label htmlFor={`${id}-time`}>Time</Label>
              <Input id={`${id}-time`} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={update.isPending}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={update.isPending || !date}>
              {update.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
