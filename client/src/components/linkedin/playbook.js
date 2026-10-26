'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarClock, Copy, Info, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { api, qk } from '@/lib/api';
import { formatDateTime, timeAgo } from '@/lib/format';
import { LI_GROUP_STYLES, LI_STAGE_MAP } from '@/lib/linkedin';
import { cn } from '@/lib/utils';
import { useLinkedinMeta } from '@/components/linkedin/use-linkedin';

/** A short instruction under a stage or a message. */
function Note({ children }) {
  return (
    <p className="flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-300">
      <Info className="mt-px size-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

/** The outreach playbook: seven stages, each with the messages to copy, plus the meeting link and the rules. Anyone can edit it; the saved text is shared. */
export function Playbook() {
  const { data, isPending } = useLinkedinMeta();
  const qc = useQueryClient();
  // the draft while editing: { playbook, rules (one per line), meetingLink }; null = reading
  const [draft, setDraft] = useState(null);
  const save = useMutation({
    mutationFn: (d) => api.linkedin.savePlaybook({ playbook: d.playbook, meetingLink: d.meetingLink, rules: d.rules.split('\n').map((r) => r.trim()).filter(Boolean) }),
    onSuccess: (r) => {
      qc.setQueryData(qk.linkedinMeta, (old) => ({ ...old, ...r }));
      setDraft(null);
      toast.success('Playbook saved for everyone');
    },
    onError: (err) => toast.error(err?.message || 'Something went wrong'),
  });
  const startEdit = () => setDraft({ playbook: structuredClone(data?.playbook || []), rules: (data?.rules || []).join('\n'), meetingLink: data?.meetingLink || '' });
  const setStage = (i, patch) => setDraft((d) => ({ ...d, playbook: d.playbook.map((p, j) => (j === i ? { ...p, ...patch } : p)) }));
  const setMessage = (i, k, patch) => setDraft((d) => ({ ...d, playbook: d.playbook.map((p, j) => (j === i ? { ...p, messages: p.messages.map((m, n) => (n === k ? { ...m, ...patch } : m)) } : p)) }));
  const copy = (text, what = 'Message') => navigator.clipboard?.writeText(text).then(() => toast.success(`${what} copied - fill in the [brackets] before sending`));
  if (isPending) {
    return (
      <div className="grid grid-cols-1 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 w-full rounded-lg" />
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-0.5">
          <p className="text-sm text-muted-foreground">Seven stages to secure a 10 to 15 minute meeting with the Director of Operations.</p>
          {data?.playbookEditedBy ? (
            <p className="text-xs text-muted-foreground" title={formatDateTime(data.playbookEditedAt)} suppressHydrationWarning>
              Last edited by <span className="font-medium text-foreground/80">{data.playbookEditedBy}</span> · {timeAgo(data.playbookEditedAt)}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {!draft && data?.meetingLink ? (
            <>
              <Button size="sm" variant="outline" asChild>
                <a href={data.meetingLink} target="_blank" rel="noreferrer">
                  <CalendarClock /> Schedule a Quick Meeting
                </a>
              </Button>
              <Button size="sm" variant="ghost" onClick={() => copy(data.meetingLink, 'Meeting link')}>
                <Copy /> Copy link
              </Button>
            </>
          ) : null}
          {draft ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => setDraft(null)} disabled={save.isPending}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => save.mutate(draft)} disabled={save.isPending}>
                {save.isPending ? 'Saving...' : 'Save'}
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={startEdit}>
              <Pencil /> Edit
            </Button>
          )}
        </div>
      </div>
      {draft ? (
        <label className="grid gap-1">
          <span className="text-xs font-medium text-muted-foreground uppercase">Meeting link</span>
          <Input value={draft.meetingLink} onChange={(e) => setDraft((d) => ({ ...d, meetingLink: e.target.value }))} />
        </label>
      ) : null}
      <ol className="grid grid-cols-1 gap-3">
        {(draft?.playbook || data?.playbook || []).map((p, i) => {
          const group = LI_STAGE_MAP[p.stage]?.group || 'connect';
          const style = LI_GROUP_STYLES[group];
          return (
            <li key={p.step} className="grid min-w-0 grid-cols-1 gap-3 rounded-lg border bg-card p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
              <div className="grid min-w-0 content-start gap-2">
                <div className="flex items-center gap-2">
                  <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold', style.badge)}>{p.step}</span>
                  {draft ? <Input value={p.title} onChange={(e) => setStage(i, { title: e.target.value })} aria-label="Stage title" /> : <h3 className="font-semibold">{p.title}</h3>}
                </div>
                {draft ? (
                  <Textarea value={p.note || ''} onChange={(e) => setStage(i, { note: e.target.value })} placeholder="Note (optional)" aria-label="Stage note" />
                ) : p.note ? (
                  <Note>{p.note}</Note>
                ) : null}
              </div>
              <div className="grid min-w-0 content-start gap-2">
                {(p.messages || []).map((m, k) =>
                  draft ? (
                    <div key={k} className="grid gap-1.5 rounded-md border bg-muted/30 p-3">
                      <Input value={m.label} onChange={(e) => setMessage(i, k, { label: e.target.value })} aria-label="Message label" />
                      <Textarea value={m.text} onChange={(e) => setMessage(i, k, { text: e.target.value })} aria-label="Message text" />
                      <Input value={m.note || ''} onChange={(e) => setMessage(i, k, { note: e.target.value })} placeholder="Note (optional)" aria-label="Message note" />
                    </div>
                  ) : (
                    <div key={k} className="grid gap-1.5">
                      <div className="rounded-md border bg-muted/30 p-3 text-sm">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-muted-foreground uppercase">{m.label}</span>
                          <Button size="xs" variant="ghost" onClick={() => copy(m.text)}>
                            <Copy /> Copy
                          </Button>
                        </div>
                        <p className="whitespace-pre-line">{m.text}</p>
                      </div>
                      {m.note ? <Note>{m.note}</Note> : null}
                    </div>
                  ),
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <section className="rounded-lg border bg-card p-4">
        <h3 className="font-semibold">Ground rules</h3>
        {draft ? (
          <Textarea className="mt-2" value={draft.rules} onChange={(e) => setDraft((d) => ({ ...d, rules: e.target.value }))} placeholder="One rule per line" aria-label="Ground rules, one per line" />
        ) : (
          <ul className="mt-2 grid gap-1.5 text-sm">
            {(data?.rules || []).map((r) => (
              <li key={r} className="flex gap-2">
                <span className="text-muted-foreground">•</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
