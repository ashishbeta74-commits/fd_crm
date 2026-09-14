'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { AlarmClock, Check, Loader2, Pencil, Trash2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ReminderDialog } from '@/components/reminders/reminder-dialog';
import { SNOOZE_OPTIONS, snoozeBody, useDeleteReminder, useSnoozeReminder, useUpdateReminder } from '@/components/reminders/use-reminder-mutations';

/**
 * Done / Snooze / Edit / Delete for one reminder. `contact` is needed for the edit dialog.
 * `compact` hides the labels (used inside the bell popover).
 */
export function ReminderActions({ reminder, contact, compact = false, showEdit = true, showDelete = true }) {
  const update = useUpdateReminder();
  const snooze = useSnoozeReminder();
  const del = useDeleteReminder();
  const [dialog, setDialog] = useState(null); // 'edit' | 'delete'
  const busy = update.isPending || snooze.isPending || del.isPending;
  const size = compact ? 'icon-sm' : 'sm';

  const markDone = () =>
    update.mutate(
      { id: reminder._id, data: { done: !reminder.done } },
      { onSuccess: () => toast.success(reminder.done ? 'Reminder reopened' : 'Reminder done') },
    );
  const doSnooze = (opt) => snooze.mutate({ id: reminder._id, data: snoozeBody(opt) }, { onSuccess: () => toast.success(`Snoozed - ${opt.label.toLowerCase()}`) });

  return (
    <div className="flex flex-wrap items-center gap-1">
      <Button size={size} variant={reminder.done ? 'ghost' : 'secondary'} onClick={markDone} disabled={busy} aria-label={reminder.done ? 'Reopen reminder' : 'Mark reminder done'} title={reminder.done ? 'Reopen' : 'Done'}>
        {update.isPending ? <Loader2 className="animate-spin" /> : reminder.done ? <Undo2 /> : <Check />}
        {compact ? null : reminder.done ? 'Reopen' : 'Done'}
      </Button>
      {!reminder.done ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size={size} variant="outline" disabled={busy} aria-label="Snooze reminder" title="Snooze">
              {snooze.isPending ? <Loader2 className="animate-spin" /> : <AlarmClock />}
              {compact ? null : 'Snooze'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Snooze until</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {SNOOZE_OPTIONS.map((opt) => (
              <DropdownMenuItem key={opt.label} onSelect={() => doSnooze(opt)}>
                {opt.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      {showEdit && contact ? (
        <Button size={size} variant="ghost" onClick={() => setDialog('edit')} disabled={busy} aria-label="Edit reminder" title="Edit">
          <Pencil />
          {compact ? null : 'Edit'}
        </Button>
      ) : null}
      {showDelete ? (
        <Button size={size} variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => setDialog('delete')} disabled={busy} aria-label="Delete reminder" title="Delete">
          <Trash2 />
        </Button>
      ) : null}

      {dialog === 'edit' ? <ReminderDialog key={reminder._id} contact={contact} reminder={reminder} open onOpenChange={(v) => !v && setDialog(null)} /> : null}
      <ConfirmDialog
        open={dialog === 'delete'}
        onOpenChange={(v) => !v && setDialog(null)}
        title="Delete this reminder?"
        description={reminder.note || 'The reminder will be removed.'}
        confirmLabel="Delete"
        destructive
        pending={del.isPending}
        onConfirm={() =>
          del.mutate(
            { id: reminder._id, contactId: reminder.contactId },
            {
              onSuccess: () => {
                toast.success('Reminder deleted');
                setDialog(null);
              },
            },
          )
        }
      />
    </div>
  );
}
