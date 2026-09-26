'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { ArrowRight, Bell, CalendarClock, CalendarPlus, GitMerge, Linkedin, Loader2, Mail, Pencil, Phone, StickyNote, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { StageBadge } from '@/components/badges';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useLogActivity, useRemoveActivity } from '@/hooks/use-contact-mutations';
import { formatDateTime } from '@/lib/format';
import { DetailCard, EmptyNote, TOUCH_SM } from './detail-card';

const TYPES = {
  call: { icon: Phone, label: 'Call logged' },
  followup: { icon: CalendarPlus, label: 'Follow-up done' },
  note: { icon: StickyNote, label: 'Note' },
  stage: { icon: ArrowRight, label: 'Stage changed' },
  booking: { icon: CalendarClock, label: 'Booking updated' },
  import: { icon: Upload, label: 'Imported' },
  edit: { icon: Pencil, label: 'Contact edited' },
  merge: { icon: GitMerge, label: 'Merged' },
  reminder: { icon: Bell, label: 'Reminder' },
  email: { icon: Mail, label: 'Email' },
  linkedin: { icon: Linkedin, label: 'LinkedIn' },
};

// Errors from the mutation hooks are toasted by the hooks themselves.

// Entries written by a sheet import (the API flags them) stay; everything logged in the app can be deleted.
const canDelete = (activity) => !activity.fromImport && activity.type !== 'import';
const isStepLog = (activity) => activity.type === 'linkedin' && /^LinkedIn: [^:]+$/.test((activity.message || '').split(' → ')[0].split(' - ')[0]);

function deleteCopy(activity) {
  if (!activity) return { title: 'Delete entry?', description: '' };
  if (activity.type === 'note') return { title: 'Delete note?', description: "The note will be removed from this contact's history." };
  if (activity.type === 'linkedin' && isStepLog(activity)) {
    return { title: 'Delete this LinkedIn log?', description: 'The step it recorded is taken back too: the date is cleared, so the stage and the LinkedIn counters (Followed, Requests sent, …) drop by one.' };
  }
  if (activity.type === 'call') return { title: 'Delete this call?', description: 'The call leaves the history; "last contacted" is recomputed from what is left.' };
  if (activity.type === 'followup') return { title: 'Delete this follow-up?', description: 'The follow-up counter goes down by one and "last contacted" is recomputed from what is left.' };
  return { title: 'Delete this entry?', description: "It will be removed from this contact's history." };
}

export function ActivityTimeline({ contact }) {
  const remove = useRemoveActivity();
  const [deleting, setDeleting] = useState(null);
  const activities = contact.activities || [];
  const copy = deleteCopy(deleting);

  return (
    <DetailCard title="Activity">
      <QuickNoteForm contactId={contact._id} />
      <Separator className="my-4" />
      {activities.length ? (
        <ol className="grid gap-4">
          {activities.map((activity) => (
            <ActivityItem key={activity._id} activity={activity} onDelete={canDelete(activity) ? () => setDeleting(activity) : null} />
          ))}
        </ol>
      ) : (
        <EmptyNote>No activity yet</EmptyNote>
      )}
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(v) => !v && setDeleting(null)}
        title={copy.title}
        description={copy.description}
        confirmLabel="Delete"
        destructive
        pending={remove.isPending}
        onConfirm={() =>
          remove.mutate(
            { id: contact._id, activityId: deleting._id },
            {
              onSuccess: () => {
                toast.success(deleting.type === 'note' ? 'Note deleted' : 'Entry deleted');
                setDeleting(null);
              },
            },
          )
        }
      />
    </DetailCard>
  );
}

function QuickNoteForm({ contactId }) {
  const log = useLogActivity();
  const [message, setMessage] = useState('');
  const text = message.trim();

  const submit = (e) => {
    e.preventDefault();
    if (!text) return;
    log.mutate(
      { id: contactId, data: { type: 'note', message: text } },
      {
        onSuccess: () => {
          setMessage('');
          toast.success('Note added');
        },
      },
    );
  };

  return (
    <form onSubmit={submit} className="grid gap-2">
      <Label htmlFor="quick-note" className="sr-only">
        Add a note
      </Label>
      <Textarea id="quick-note" rows={2} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Add a note…" />
      <div className="flex justify-end">
        <Button type="submit" size="sm" className={TOUCH_SM} disabled={!text || log.isPending}>
          {log.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <StickyNote />}
          {log.isPending ? 'Adding…' : 'Add note'}
        </Button>
      </div>
    </form>
  );
}

function ActivityItem({ activity, onDelete }) {
  const { icon: Icon, label } = TYPES[activity.type] || TYPES.edit;
  return (
    // New entries (keyed by id) fade in as they are added; existing ones keep their DOM node and stay put.
    <li className="group relative flex gap-3 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-300">
      <span className="absolute top-8 -bottom-4 left-3.5 w-px bg-border group-last:hidden" aria-hidden="true" />
      <span className="relative mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border bg-muted text-muted-foreground" aria-hidden="true">
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm whitespace-pre-wrap wrap-break-word">{activity.message || label}</p>
          {onDelete ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="-mt-1 -mr-1 size-8 shrink-0 text-muted-foreground transition-colors hover:text-destructive sm:-mt-0.5 sm:mr-0 sm:size-6"
                  aria-label={activity.type === 'note' ? 'Delete note' : 'Delete entry'}
                  onClick={onDelete}
                >
                  <Trash2 />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{activity.type === 'note' ? 'Delete note' : 'Delete entry'}</TooltipContent>
            </Tooltip>
          ) : null}
        </div>
        {activity.type === 'stage' ? (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <StageChange from={activity.fromStage} to={activity.toStage} />
          </div>
        ) : null}
        <p className="mt-1 text-xs text-muted-foreground">
          {formatDateTime(activity.at)}
          {activity.byName ? (
            <>
              {' · by '}
              <span className="font-medium text-foreground/80">{activity.byName}</span>
            </>
          ) : null}
        </p>
      </div>
    </li>
  );
}

function StageChange({ from, to }) {
  return (
    <>
      {from ? <StageBadge stage={from} /> : null}
      {from && to ? <ArrowRight className="size-3 text-muted-foreground" aria-hidden="true" /> : null}
      {to ? <StageBadge stage={to} /> : null}
    </>
  );
}
