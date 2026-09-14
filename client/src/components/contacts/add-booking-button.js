'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { CalendarCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BookingDialog } from '@/components/contacts/stage-controls';
import { useUpdateContact } from '@/hooks/use-contact-mutations';

/** "Add booking" / "Edit booking" button with the booking dialog (date + day, time, note). Saves the booking only. */
export function AddBookingButton({ contact, size = 'sm', variant = 'outline', className }) {
  const update = useUpdateContact();
  const [open, setOpen] = useState(false);
  const hasBooking = Boolean(contact.booking?.date);
  return (
    <>
      <Button size={size} variant={variant} className={className} onClick={() => setOpen(true)}>
        <CalendarCheck /> {hasBooking ? 'Edit booking' : 'Add booking'}
      </Button>
      {open ? (
        <BookingDialog
          key={contact._id}
          open
          onOpenChange={(v) => !v && setOpen(false)}
          title={hasBooking ? 'Edit booking' : 'Add booking'}
          description={`Booking for ${contact.name || 'this contact'}`}
          initial={contact.booking}
          submitting={update.isPending}
          onConfirm={(booking) =>
            update.mutate(
              { id: contact._id, data: { booking } },
              {
                onSuccess: () => {
                  toast.success(hasBooking ? 'Booking updated' : 'Booking added');
                  setOpen(false);
                },
              },
            )
          }
        />
      ) : null}
    </>
  );
}
