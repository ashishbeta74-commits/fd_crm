'use client';

import { toast } from 'sonner';
import { Copy, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { LI_GROUP_STYLES, LI_STAGE_MAP } from '@/lib/linkedin';
import { cn } from '@/lib/utils';
import { useLinkedinMeta } from '@/components/linkedin/use-linkedin';

/** The workbook's Playbook tab: the 12 steps, what to do / say / log / watch out for, plus the daily rules. */
export function Playbook() {
  const { data, isPending } = useLinkedinMeta();
  const copy = (text) => navigator.clipboard?.writeText(text).then(() => toast.success('Message copied - personalise it before sending'));
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
      <p className="text-sm text-muted-foreground">Follow request to paying client. Work one prospect down this list; log each step on the prospect and the stage updates itself.</p>
      <ol className="grid grid-cols-1 gap-3">
        {(data?.playbook || []).map((p) => {
          const group = LI_STAGE_MAP[p.stage]?.group || 'warmup';
          const style = LI_GROUP_STYLES[group];
          const silent = /^(Nothing yet|No message)/i.test(p.say);
          return (
            <li key={p.step} className="grid min-w-0 grid-cols-1 gap-3 rounded-lg border bg-card p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn('flex size-7 items-center justify-center rounded-full text-xs font-semibold', style.badge)}>{p.step}</span>
                  <h3 className="font-semibold">{p.title}</h3>
                  <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">{p.day}</span>
                </div>
                <p className="mt-2 text-sm">{p.do}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground/80">Log it as: </span>
                  {p.log}
                </p>
              </div>
              <div className="grid min-w-0 content-start gap-2">
                <div className={cn('rounded-md border p-3 text-sm', silent ? 'bg-muted/40 text-muted-foreground' : 'bg-muted/30')}>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted-foreground uppercase">{silent ? 'Say' : 'What to say'}</span>
                    {!silent ? (
                      <Button size="xs" variant="ghost" onClick={() => copy(p.say)}>
                        <Copy /> Copy
                      </Button>
                    ) : null}
                  </div>
                  <p className={cn(!silent && 'italic')}>{silent ? p.say : `“${p.say}”`}</p>
                </div>
                <p className="flex items-start gap-1.5 text-xs text-amber-800 dark:text-amber-300">
                  <ShieldAlert className="mt-px size-3.5 shrink-0" aria-hidden />
                  <span>
                    <span className="font-medium">Watch out for: </span>
                    {p.watch}
                  </span>
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      <section className="rounded-lg border bg-card p-4">
        <h3 className="font-semibold">Daily rhythm &amp; guardrails</h3>
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
