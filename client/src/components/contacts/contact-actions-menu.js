'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarMinus, CalendarPlus, ExternalLink, Mail, MoreHorizontal, Pencil, StickyNote, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { SendEmailDialog } from '@/components/email/send-email-dialog';
import { AddFollowUpDialog } from '@/components/followups/add-followup-dialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ContactDialog } from '@/components/contacts/contact-dialog';
import { NoteDialog } from '@/components/contacts/log-call-dialog';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useDeleteContact, useRemoveLastFollowUp } from '@/hooks/use-contact-mutations';
import { cn } from '@/lib/utils';

/**
 * "..." menu with Add follow-up / Add note / Email / Edit / Open / Delete, owning its dialogs.
 * Log call is not here: it has its own button beside the stage (see LogCallButton).
 * Pass `showOpen={false}` on the detail page. `onDeleted` fires after a successful delete.
 */
export function ContactActionsMenu({ contact, showOpen = true, onDeleted, align = 'end', triggerClassName, trigger }) {
  const router = useRouter();
  const del = useDeleteContact();
  const removeFollowUp = useRemoveLastFollowUp();
  const [dialog, setDialog] = useState(null); // 'call' | 'followup' | 'removeFollowup' | 'note' | 'email' | 'edit' | 'delete'
  const followUps = contact.followUpCount || 0;
  const close = () => setDialog(null);

  return (
    <>
      <DropdownMenu>
        {trigger ? (
          <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  // The pseudo-element widens the hit area to ~40px without changing layout.
                  className={cn('relative before:absolute before:-inset-1 before:rounded-md', triggerClassName)}
                  aria-label="Contact actions"
                >
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Actions</TooltipContent>
          </Tooltip>
        )}
        <DropdownMenuContent align={align}>
          {/* "Log call" moved out of this menu: it now sits beside the stage in the list and cards. */}
          <DropdownMenuItem onSelect={() => setDialog('followup')}>
            <CalendarPlus /> Add follow-up
          </DropdownMenuItem>
          {followUps ? (
            <DropdownMenuItem onSelect={() => setDialog('removeFollowup')}>
              <CalendarMinus /> Remove follow-up #{followUps}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={() => setDialog('note')}>
            <StickyNote /> Add note
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog('email')}>
            <Mail /> Email
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog('edit')}>
            <Pencil /> Edit
          </DropdownMenuItem>
          {showOpen ? (
            <DropdownMenuItem onSelect={() => router.push(`/contacts/${contact._id}`)}>
              <ExternalLink /> Open
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setDialog('delete')}>
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {dialog === 'followup' ? <AddFollowUpDialog key={`followup-${contact._id}`} contact={contact} open onOpenChange={(v) => !v && close()} /> : null}
      {dialog === 'note' ? <NoteDialog key={`note-${contact._id}`} contact={contact} open onOpenChange={(v) => !v && close()} /> : null}
      {dialog === 'email' ? <SendEmailDialog key={`email-${contact._id}`} contact={contact} open onOpenChange={(v) => !v && close()} /> : null}
      {dialog === 'edit' ? <ContactDialog key={`edit-${contact._id}`} contact={contact} open onOpenChange={(v) => !v && close()} /> : null}
      <ConfirmDialog
        open={dialog === 'removeFollowup'}
        onOpenChange={(v) => !v && close()}
        title={`Remove follow-up #${followUps}?`}
        description={`${contact.name || 'This contact'} goes back to ${followUps - 1} follow-up${followUps - 1 === 1 ? '' : 's'} done. The last "Add follow-up" entry leaves the history; the next follow-up date stays as it is.`}
        confirmLabel="Remove"
        destructive
        pending={removeFollowUp.isPending}
        onConfirm={() =>
          removeFollowUp.mutate(contact._id, {
            onSuccess: () => {
              toast.success(`Follow-up #${followUps} removed`);
              close();
            },
          })
        }
      />
      <ConfirmDialog
        open={dialog === 'delete'}
        onOpenChange={(v) => !v && close()}
        title="Delete contact?"
        description={`${contact.name || 'This contact'} will be removed permanently.`}
        confirmLabel="Delete"
        destructive
        pending={del.isPending}
        onConfirm={async () => {
          await del.mutateAsync(contact._id);
          close();
          onDeleted?.(contact);
        }}
      />
    </>
  );
}
