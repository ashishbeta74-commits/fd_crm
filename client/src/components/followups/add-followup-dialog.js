'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarMinus, CalendarPlus, Loader2, Mail, MessageSquare, Phone, Search } from 'lucide-react';
import { api, qk } from '@/lib/api';
import { FOLLOW_UP_CHANNELS } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { StageBadge } from '@/components/badges';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useLogActivity, useRemoveLastFollowUp } from '@/hooks/use-contact-mutations';
import { cn } from '@/lib/utils';

const CHANNEL_ICONS = { call: Phone, message: MessageSquare, email: Mail };

/**
 * "Add follow-up": records one follow-up round on the contact (the counter goes up by one, it counts as
 * today's touch) and schedules the next follow-up date - or clears it when nothing further is planned.
 */
export function AddFollowUpDialog({ contact, open, onOpenChange, onSaved }) {
  const log = useLogActivity();
  const [message, setMessage] = useState('');
  const [channel, setChannel] = useState('call');
  const [next, setNext] = useState('');
  const [nextNote, setNextNote] = useState('');
  const round = (contact?.followUpCount || 0) + 1;

  if (!contact) return null;

  const submit = (e) => {
    e.preventDefault();
    const data = { type: 'followup', channel };
    if (message.trim()) data.message = message.trim();
    if (next) {
      data.followUp = next;
      if (nextNote.trim()) data.followUpNote = nextNote.trim();
    }
    // Closed at once and saved behind it, like logging a call: the row already shows the result.
    const saving = log.mutateAsync({ id: contact._id, data });
    onOpenChange(false);
    const by = FOLLOW_UP_CHANNELS.find((c) => c.key === channel)?.label.toLowerCase();
    saving
      .then((doc) => {
        toast.success(next ? `Follow-up #${round} by ${by} added - next on ${next}` : `Follow-up #${round} by ${by} added`);
        onSaved?.(doc);
      })
      .catch(() => {});
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Add follow-up #{round}</DialogTitle>
            <DialogDescription className="wrap-break-word">
              {contact.name || 'Contact'}
              {contact.companyName ? ` · ${contact.companyName}` : ''}
              {contact.followUpCount ? ` · ${contact.followUpCount} done so far` : ' · first follow-up'}
            </DialogDescription>
          </DialogHeader>

          <fieldset className="grid gap-1.5">
            <legend className="text-sm font-medium">Follow-up way</legend>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="How the follow-up was done">
              {FOLLOW_UP_CHANNELS.map((c) => {
                const Icon = CHANNEL_ICONS[c.key];
                const active = channel === c.key;
                return (
                  <button
                    key={c.key}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setChannel(c.key)}
                    title={c.description}
                    className={cn(
                      'flex min-h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium transition-[background-color,color,border-color,transform] duration-200 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 motion-safe:active:scale-[0.97]',
                      active ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-accent',
                    )}
                  >
                    <Icon className="size-4" aria-hidden="true" />
                    {c.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="grid gap-1.5">
            <Label htmlFor="af-message">What happened</Label>
            <Textarea id="af-message" rows={2} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Called again, asked to send the quote…" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="af-next">Next follow-up</Label>
              <Input id="af-next" type="date" value={next} onChange={(e) => setNext(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="af-nextNote">Next follow-up note</Label>
              <Input id="af-nextNote" value={nextNote} onChange={(e) => setNextNote(e.target.value)} disabled={!next} placeholder={next ? 'What to follow up on' : 'Pick a date first'} />
            </div>
          </div>
          {!next ? <p className="text-xs text-muted-foreground">No next date: the follow-up is counted and the contact leaves the follow-up list.</p> : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={log.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={log.isPending} aria-busy={log.isPending || undefined}>
              {log.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <CalendarPlus aria-hidden="true" />}
              {log.isPending ? 'Saving…' : 'Add follow-up'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Button + dialog for one contact (Follow-ups rows, contact page). */
export function AddFollowUpButton({ contact, size = 'sm', variant = 'outline', className, onSaved }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size={size} variant={variant} className={className} onClick={() => setOpen(true)}>
        <CalendarPlus /> Add follow-up
      </Button>
      {open ? <AddFollowUpDialog key={contact._id} contact={contact} open onOpenChange={(v) => !v && setOpen(false)} onSaved={onSaved} /> : null}
    </>
  );
}

/**
 * "Remove follow-up": takes back the last added follow-up (counter - 1) after a confirmation.
 * Renders nothing when the contact has no follow-ups done.
 */
export function RemoveFollowUpButton({ contact, size = 'sm', variant = 'ghost', className }) {
  const remove = useRemoveLastFollowUp();
  const [open, setOpen] = useState(false);
  const count = contact.followUpCount || 0;
  if (!count) return null;
  return (
    <>
      <Button size={size} variant={variant} className={className} onClick={() => setOpen(true)} title="Take back the last follow-up">
        <CalendarMinus /> Remove follow-up
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Remove follow-up #${count}?`}
        description={`${contact.name || 'This contact'} goes back to ${count - 1} follow-up${count - 1 === 1 ? '' : 's'} done. The last "Add follow-up" entry leaves the history; the next follow-up date stays as it is.`}
        confirmLabel="Remove"
        destructive
        pending={remove.isPending}
        onConfirm={() =>
          remove.mutate(contact._id, {
            onSuccess: () => {
              toast.success(`Follow-up #${count} removed`);
              setOpen(false);
            },
          })
        }
      />
    </>
  );
}

/** Page-level "Add follow-up": search a contact first, then the same form. */
export function NewFollowUpDialog({ open, onOpenChange }) {
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState(null);
  const term = q.trim();
  const { data, isFetching } = useQuery({
    queryKey: qk.contacts({ q: term, limit: 8, sort: 'updatedAt', dir: 'desc', picker: true }),
    queryFn: () => api.contacts.list({ q: term, limit: 8, sort: 'updatedAt', dir: 'desc' }),
    enabled: open && term.length >= 2,
  });
  const items = term.length >= 2 ? data?.items || [] : [];

  if (picked) {
    return (
      <AddFollowUpDialog
        key={picked._id}
        contact={picked}
        open={open}
        onOpenChange={(v) => {
          if (!v) {
            setPicked(null);
            onOpenChange(false);
          }
        }}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add follow-up</DialogTitle>
          <DialogDescription>Find the contact you followed up with.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, company, email, phone…" aria-label="Search contacts" className="pl-8" />
        </div>
        <ul className="-mx-1 max-h-72 divide-y overflow-y-auto" aria-live="polite">
          {term.length < 2 ? (
            <li className="px-1 py-6 text-center text-sm text-muted-foreground">Type at least two letters.</li>
          ) : isFetching && !items.length ? (
            <li className="px-1 py-6 text-center text-sm text-muted-foreground">Searching…</li>
          ) : !items.length ? (
            <li className="px-1 py-6 text-center text-sm text-muted-foreground">No contact matches “{term}”.</li>
          ) : (
            items.map((c) => (
              <li key={c._id}>
                <button
                  type="button"
                  onClick={() => setPicked(c)}
                  className={cn('flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent')}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{c.name || c.email || '(no name)'}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[c.companyName, c.contactMain || c.companyNo].filter(Boolean).join(' · ')}
                      {c.followUpCount ? ` · ${c.followUpCount} follow-up${c.followUpCount === 1 ? '' : 's'} done` : ''}
                    </span>
                  </span>
                  <StageBadge stage={c.stage} />
                </button>
              </li>
            ))
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
