'use client';

import { startTransition, useOptimistic, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, CalendarPlus, RefreshCw } from 'lucide-react';
import { LIVE_MS, api, qk } from '@/lib/api';
import { pluralize } from '@/lib/format';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/page-header';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NewFollowUpDialog } from '@/components/followups/add-followup-dialog';
import { FollowupList } from '@/components/followups/followup-list';
import { FollowupsSkeleton } from '@/components/followups/followups-skeleton';
import { PAGE_DESCRIPTION, TABS, TAB_KEYS, defaultTab } from '@/components/followups/followups-config';

function CountSummary({ data }) {
  const overdue = data.overdue.length;
  const upcoming = data.today.length + data.week.length + data.later.length;
  return (
    <p className="text-sm text-muted-foreground">
      <span className={cn(overdue > 0 && 'font-medium text-destructive')}>{overdue} overdue</span>
      {' · '}
      {upcoming} upcoming
      {' · '}
      {pluralize(data.past.length, 'past booking')}
    </p>
  );
}

function ErrorState({ error, onRetry, retrying }) {
  return (
    <Alert variant="destructive">
      <AlertCircle />
      <AlertTitle>Could not load follow-ups</AlertTitle>
      <AlertDescription>
        <p>{error.message}</p>
        <Button size="sm" variant="outline" onClick={onRetry} disabled={retrying}>
          <RefreshCw className={cn(retrying && 'animate-spin')} />
          {retrying ? 'Retrying…' : 'Retry'}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

function FollowupTabs({ data, tab, onTabChange }) {
  return (
    <Tabs value={tab} onValueChange={onTabChange}>
      <div className="overflow-x-auto pb-1">
        <TabsList className="min-w-max">
          {TABS.map((t) => {
            const n = (data[t.key] || []).length;
            return (
              <TabsTrigger key={t.key} value={t.key}>
                {t.label}
                <span className={cn('tabular-nums', t.key === 'overdue' && n > 0 ? 'text-destructive' : 'text-muted-foreground')}>({n})</span>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </div>
      {TABS.map((t) => (
        <TabsContent key={t.key} value={t.key} className="mt-2">
          <FollowupList entries={data[t.key] || []} emptyText={t.empty} pastTense={t.key === 'past'} />
        </TabsContent>
      ))}
    </Tabs>
  );
}

export function FollowupsView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data, isPending, isError, error, refetch, isFetching } = useQuery({ queryKey: qk.followups, queryFn: api.followups, refetchInterval: LIVE_MS });

  const param = searchParams.get('tab');
  const urlTab = TAB_KEYS.includes(param) ? param : defaultTab(data);
  // Highlight the clicked tab on the current frame; it falls back to the URL once router.replace commits.
  const [tab, setOptimisticTab] = useOptimistic(urlTab);
  const [adding, setAdding] = useState(false);

  const changeTab = (next) => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set('tab', next);
    startTransition(() => {
      setOptimisticTab(next);
      router.replace(`${pathname}?${sp.toString()}`, { scroll: false });
    });
  };

  if (isPending) return <FollowupsSkeleton />;

  return (
    <div>
      <PageHeader title="Follow-ups" description={PAGE_DESCRIPTION}>
        {data ? <CountSummary data={data} /> : null}
        <Button size="sm" onClick={() => setAdding(true)}>
          <CalendarPlus /> Add follow-up
        </Button>
      </PageHeader>
      {adding ? <NewFollowUpDialog open onOpenChange={(v) => !v && setAdding(false)} /> : null}
      {isError ? <ErrorState error={error} onRetry={() => refetch()} retrying={isFetching} /> : null}
      {data ? <FollowupTabs data={data} tab={tab} onTabChange={changeTab} /> : null}
    </div>
  );
}
