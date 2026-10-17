'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ArrowRight, Bell, CalendarClock, CalendarPlus, GitMerge, Linkedin, Loader2, Mail, MessageSquareReply, Pencil, Phone, StickyNote, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { StageBadge } from '@/components/badges';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useEditActivity, useLogActivity, useRemoveActivity } from '@/hooks/use-contact-mutations';
import { formatDateTime } from '@/lib/format';
import { extractMentions, splitMentions } from '@/lib/mentions';
import { cn } from '@/lib/utils';
import { DetailCard, EmptyNote, TOUCH_SM } from './detail-card';
import { MentionTextarea, useTeam } from './mention-textarea';

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
  if (activity.type === 'linkedin' && isStepLog(activity)) {
    return { title: 'Delete this LinkedIn log?', description: 'The step it recorded is taken back too: the date is cleared, so the stage and the LinkedIn counters (Followed, Requests sent, …) drop by one.' };
  }
  if (activity.type === 'call') return { title: 'Delete this call?', description: 'The call leaves the history; "last contacted" is recomputed from what is left.' };
  if (activity.type === 'followup') return { title: 'Delete this follow-up?', description: 'The follow-up counter goes down by one and "last contacted" is recomputed from what is left.' };
  return { title: 'Delete this entry?', description: "It will be removed from this contact's history." };
}

// How long a deleted note can be brought back before the delete is sent.
const UNDO_MS = 6000;

export function ActivityTimeline({ contact }) {
  const remove = useRemoveActivity();
  const [deleting, setDeleting] = useState(null);
  // Notes deleted but not sent yet (their Undo is still on screen): hidden here, deleted when the timer runs out.
  const [hidden, setHidden] = useState(() => new Set());
  // activity id -> { timer, send } for each note whose Undo is still showing
  const pending = useRef(new Map());
  // a hidden note hides its replies too (the server deletes them with it)
  const activities = (contact.activities || []).filter((a) => !hidden.has(a._id) && !(a.replyTo && hidden.has(a.replyTo)));
  const copy = deleteCopy(deleting);

  // Replies sit under the note they answer (oldest first); one whose note is gone shows on its own.
  const ids = new Set(activities.map((a) => a._id));
  const replies = new Map();
  for (const a of activities) if (a.replyTo && ids.has(a.replyTo)) replies.set(a.replyTo, [a, ...(replies.get(a.replyTo) || [])]);
  const top = activities.filter((a) => !(a.replyTo && ids.has(a.replyTo)));

  const unhide = (activityId) =>
    setHidden((prev) => {
      const next = new Set(prev);
      next.delete(activityId);
      return next;
    });

  // Leaving the page while an Undo is showing sends those deletes now instead of dropping them.
  useEffect(() => {
    const map = pending.current;
    return () => {
      for (const { timer, send } of map.values()) {
        clearTimeout(timer);
        send();
      }
    };
  }, []);

  // ponytail: the delete is sent after UNDO_MS, so closing the tab inside that window keeps the note.
  const deleteNote = (activity) => {
    const vars = { id: contact._id, activityId: activity._id };
    const { mutate } = remove;
    const send = () => {
      pending.current.delete(activity._id);
      mutate(vars, { onError: () => unhide(activity._id) });
    };
    setHidden((prev) => new Set(prev).add(activity._id));
    pending.current.set(activity._id, { timer: setTimeout(send, UNDO_MS), send });
    toast(activity.replyTo ? 'Reply deleted' : 'Note deleted', {
      duration: UNDO_MS,
      action: {
        label: 'Undo',
        onClick: () => {
          clearTimeout(pending.current.get(activity._id)?.timer);
          pending.current.delete(activity._id);
          unhide(activity._id);
        },
      },
    });
  };
  const onDeleteFor = (activity) => (!canDelete(activity) ? null : activity.type === 'note' ? () => deleteNote(activity) : () => setDeleting(activity));

  return (
    <DetailCard title="Activity">
      <NoteForm contactId={contact._id} />
      <Separator className="my-4" />
      {top.length ? (
        <ol className="grid gap-4">
          {top.map((activity) => (
            <ActivityItem key={activity._id} contactId={contact._id} activity={activity} onDelete={onDeleteFor(activity)} replies={replies.get(activity._id)} onDeleteFor={onDeleteFor} />
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
                toast.success('Entry deleted');
                setDeleting(null);
              },
            },
          )
        }
      />
    </DetailCard>
  );
}

/** "Add a note…" at the top, or (with `replyTo`) a reply under a note. Type @ to tag someone or @all. */
function NoteForm({ contactId, replyTo = null, onDone }) {
  const log = useLogActivity();
  const team = useTeam();
  const [message, setMessage] = useState('');
  const text = message.trim();
  const id = replyTo ? `reply-${replyTo}` : 'quick-note';

  const submit = (e) => {
    e.preventDefault();
    if (!text) return;
    log.mutate(
      { id: contactId, data: { type: 'note', message: text, ...extractMentions(text, team), ...(replyTo ? { replyTo } : {}) } },
      {
        onSuccess: () => {
          setMessage('');
          toast.success(replyTo ? 'Reply added' : 'Note added');
          onDone?.();
        },
      },
    );
  };

  return (
    <form onSubmit={submit} className="grid gap-2">
      <Label htmlFor={id} className="sr-only">
        {replyTo ? 'Reply' : 'Add a note'}
      </Label>
      <MentionTextarea
        id={id}
        rows={2}
        autoFocus={Boolean(replyTo)}
        value={message}
        onChange={setMessage}
        onKeyDown={(e) => replyTo && e.key === 'Escape' && onDone?.()}
        placeholder={replyTo ? 'Write a reply… (@ to tag someone)' : 'Add a note… (@ to tag someone, @all for everyone)'}
      />
      <div className="flex justify-end gap-2">
        {replyTo ? (
          <Button type="button" size="sm" variant="ghost" className={TOUCH_SM} onClick={onDone} disabled={log.isPending}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" size="sm" className={TOUCH_SM} disabled={!text || log.isPending}>
          {log.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : replyTo ? <MessageSquareReply /> : <StickyNote />}
          {log.isPending ? 'Adding…' : replyTo ? 'Reply' : 'Add note'}
        </Button>
      </div>
    </form>
  );
}

/** A note's text with "@Name" / "@all" highlighted. */
function NoteText({ text }) {
  const team = useTeam();
  return splitMentions(text, team.map((u) => u.displayName)).map((p, i) =>
    p.tag ? (
      <span key={i} className="rounded bg-primary/10 px-0.5 font-medium text-primary">
        {p.text}
      </span>
    ) : (
      p.text
    ),
  );
}

function IconAction({ label, onClick, danger = false, children }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className={cn('-mt-1 size-8 shrink-0 text-muted-foreground transition-colors sm:-mt-0.5 sm:size-6', danger ? 'hover:text-destructive' : 'hover:text-foreground')}
          aria-label={label}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function ActivityItem({ contactId, activity, onDelete, replies = [], onDeleteFor }) {
  const { icon: Icon, label } = TYPES[activity.type] || TYPES.edit;
  const edit = useEditActivity();
  const team = useTeam();
  const [draft, setDraft] = useState(null); // the note's text while it is being edited, null otherwise
  const [replying, setReplying] = useState(false);
  const isNote = activity.type === 'note';
  const canEdit = isNote && Boolean(onDelete);
  const isReply = Boolean(activity.replyTo);
  const text = draft?.trim() || '';

  const save = (e) => {
    e.preventDefault();
    if (!text) return;
    if (text === activity.message) {
      setDraft(null);
      return;
    }
    edit.mutate(
      { id: contactId, activityId: activity._id, message: text, ...extractMentions(text, team) },
      {
        onSuccess: () => {
          setDraft(null);
          toast.success('Note updated');
        },
      },
    );
  };

  const bubble = cn('relative mt-0.5 flex shrink-0 items-center justify-center rounded-full border bg-muted text-muted-foreground', isReply ? 'size-6' : 'size-7');
  const BubbleIcon = isReply ? MessageSquareReply : Icon;

  if (draft !== null) {
    return (
      <li className="flex gap-3">
        <span className={bubble} aria-hidden="true">
          <BubbleIcon className="size-3.5" />
        </span>
        <form onSubmit={save} className="grid min-w-0 flex-1 gap-2">
          <Label htmlFor={`edit-${activity._id}`} className="sr-only">
            Edit note
          </Label>
          <MentionTextarea id={`edit-${activity._id}`} rows={3} autoFocus value={draft} onChange={setDraft} onKeyDown={(e) => e.key === 'Escape' && setDraft(null)} />
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" className={TOUCH_SM} onClick={() => setDraft(null)} disabled={edit.isPending}>
              Cancel
            </Button>
            <Button type="submit" size="sm" className={TOUCH_SM} disabled={!text || edit.isPending}>
              {edit.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              {edit.isPending ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </form>
      </li>
    );
  }
  return (
    // New entries (keyed by id) fade in as they are added; existing ones keep their DOM node and stay put.
    <li className="group relative flex gap-3 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-300">
      {isReply ? null : <span className="absolute top-8 -bottom-4 left-3.5 w-px bg-border group-last:hidden" aria-hidden="true" />}
      <span className={bubble} aria-hidden="true">
        <BubbleIcon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm whitespace-pre-wrap wrap-break-word">{isNote ? <NoteText text={activity.message} /> : activity.message || label}</p>
          <div className="flex shrink-0 items-center">
            {isNote && !isReply ? (
              <IconAction label="Reply" onClick={() => setReplying(true)}>
                <MessageSquareReply />
              </IconAction>
            ) : null}
            {canEdit ? (
              <IconAction label="Edit note" onClick={() => setDraft(activity.message || '')}>
                <Pencil />
              </IconAction>
            ) : null}
            {onDelete ? (
              <IconAction label={isNote ? (isReply ? 'Delete reply' : 'Delete note') : 'Delete entry'} onClick={onDelete} danger>
                <Trash2 />
              </IconAction>
            ) : null}
          </div>
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
          {activity.editedAt ? <span title={`Edited ${formatDateTime(activity.editedAt)}${activity.editedBy ? ` by ${activity.editedBy}` : ''}`}> · edited</span> : null}
        </p>
        {replies.length ? (
          <ol className="mt-3 grid gap-3 border-l pl-3">
            {replies.map((r) => (
              <ActivityItem key={r._id} contactId={contactId} activity={r} onDelete={onDeleteFor?.(r)} />
            ))}
          </ol>
        ) : null}
        {replying ? (
          <div className="mt-3 border-l pl-3">
            <NoteForm contactId={contactId} replyTo={activity._id} onDone={() => setReplying(false)} />
          </div>
        ) : null}
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
