'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Mail, Plus } from 'lucide-react';
import { api, qk } from '@/lib/api';
import { pluralize } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState, LIST_ROW, SectionCard, TruncatedText } from '@/components/dashboard/section-card';

const CATEGORY = { outreach: 'Outreach', 'follow-up': 'Follow-up', booking: 'Booking', other: 'Other' };
const SHOWN = 6;

/** Email templates at a glance: the most used ones, and a shortcut to write a new one. */
export function TemplatesCard() {
  const { data, isPending } = useQuery({ queryKey: qk.templates, queryFn: api.templates.list, staleTime: 60_000 });
  const items = [...(data?.items || [])].sort((a, b) => (b.usedCount || 0) - (a.usedCount || 0) || a.order - b.order).slice(0, SHOWN);
  const total = data?.items?.length || 0;

  return (
    <SectionCard title="Email templates" footer={{ href: '/templates', label: total ? `Manage all ${pluralize(total, 'template')}` : 'Open templates' }}>
      {isPending ? (
        <div className="grid gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : items.length ? (
        <ul className="-my-2 divide-y">
          {items.map((t) => (
            <li key={t._id}>
              <Link href={`/templates`} className={cn(LIST_ROW, 'flex items-start justify-between gap-3 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50')}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Mail className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <p className="truncate text-sm font-medium">{t.name}</p>
                  </div>
                  <TruncatedText text={t.subject} className="text-xs text-muted-foreground" />
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Badge variant="outline" className="font-normal">
                    {CATEGORY[t.category] || t.category}
                  </Badge>
                  {t.usedCount ? <span className="text-[11px] text-muted-foreground">used {t.usedCount}×</span> : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState>
          <p>No templates yet.</p>
        </EmptyState>
      )}
      <div className="mt-4">
        <Button asChild size="sm" variant="outline">
          <Link href="/templates?new=1">
            <Plus /> New template
          </Link>
        </Button>
      </div>
    </SectionCard>
  );
}
