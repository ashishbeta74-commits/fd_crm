'use client';

import { toast } from 'sonner';
import { CalendarClock, Copy, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
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

/** The outreach playbook: seven stages, each with the messages to copy, plus the meeting link and the rules. */
export function Playbook() {
  const { data, isPending } = useLinkedinMeta();
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
        <p className="text-sm text-muted-foreground">Seven stages to secure a 10 to 15 minute meeting with the Director of Operations.</p>
        {data?.meetingLink ? (
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" asChild>
              <a href={data.meetingLink} target="_blank" rel="noreferrer">
                <CalendarClock /> Schedule a Quick Meeting
              </a>
            </Button>
            <Button size="sm" variant="ghost" onClick={() => copy(data.meetingLink, 'Meeting link')}>
              <Copy /> Copy link
            </Button>
          </div>
        ) : null}
      </div>
      <ol className="grid grid-cols-1 gap-3">
        {(data?.playbook || []).map((p) => {
          const group = LI_STAGE_MAP[p.stage]?.group || 'connect';
          const style = LI_GROUP_STYLES[group];
          return (
            <li key={p.step} className="grid min-w-0 grid-cols-1 gap-3 rounded-lg border bg-card p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
              <div className="grid min-w-0 content-start gap-2">
                <div className="flex items-center gap-2">
                  <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold', style.badge)}>{p.step}</span>
                  <h3 className="font-semibold">{p.title}</h3>
                </div>
                {p.note ? <Note>{p.note}</Note> : null}
              </div>
              <div className="grid min-w-0 content-start gap-2">
                {(p.messages || []).map((m) => (
                  <div key={m.label} className="grid gap-1.5">
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
                ))}
              </div>
            </li>
          );
        })}
      </ol>
      <section className="rounded-lg border bg-card p-4">
        <h3 className="font-semibold">Ground rules</h3>
        <ul className="mt-2 grid gap-1.5 text-sm">
          {(data?.rules || []).map((r) => (
            <li key={r} className="flex gap-2">
              <span className="text-muted-foreground">•</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
