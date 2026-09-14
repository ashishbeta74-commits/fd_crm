'use client';

import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BookOpen, CircleAlert, Linkedin, Loader2, SearchX, Users, X } from 'lucide-react';
import { LIVE_MS, api, qk } from '@/lib/api';
import { pluralize } from '@/lib/format';
import { LI_STAGES, LI_STATUSES, LI_STEPS } from '@/lib/linkedin';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ContactsPagination } from '@/components/contacts/list/contacts-pagination';
import { useSelection } from '@/components/contacts/list/use-selection';
import { FILTER_KEYS, LinkedinToolbar, SORTS, useLinkedinParams } from '@/components/linkedin/linkedin-filters';
import { LinkedinStats } from '@/components/linkedin/linkedin-stats';
import { LinkedinCards, LinkedinTable } from '@/components/linkedin/linkedin-table';
import { Playbook } from '@/components/linkedin/playbook';
import { useBulkLinkedin } from '@/components/linkedin/use-linkedin';

const ENTER = 'motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300';

export function LinkedinViewFallback() {
  return (
    <div className="grid grid-cols-1 gap-4" aria-busy>
      <Skeleton className="h-9 w-72" />
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 10 }, (_, i) => (
          <Skeleton key={i} className="h-[66px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  );
}

/** Bulk bar for the selected prospects: log a step, park / close, set status. */
function BulkBar({ ids, onDone }) {
  const bulk = useBulkLinkedin();
  const n = ids.length;
  const run = (body, describe) =>
    bulk.mutate(
      { ids, ...body },
      {
        onSuccess: (r) => {
          toast.success(describe(r));
          onDone();
        },
      },
    );
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-accent/60 px-3 py-2 text-sm" role="region" aria-label="Bulk actions">
      <span className="font-medium">{pluralize(n, 'prospect')} selected</span>
      <Select value="" onValueChange={(step) => run({ action: 'step', step }, (r) => `${LI_STEPS.find((s) => s.key === step)?.label} logged for ${pluralize(r.updated, 'prospect')}`)} disabled={bulk.isPending}>
        <SelectTrigger size="sm" className="w-48" aria-label="Log a step for the selected prospects">
          {bulk.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
          <SelectValue placeholder="Log a step today…" />
        </SelectTrigger>
        <SelectContent>
          {LI_STEPS.filter((s) => !s.requires).map((s) => (
            <SelectItem key={s.key} value={s.key}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value="" onValueChange={(outcomeOverride) => run({ action: 'override', outcomeOverride: outcomeOverride === '__clear__' ? '' : outcomeOverride }, (r) => `Outcome updated for ${pluralize(r.updated, 'prospect')}`)} disabled={bulk.isPending}>
        <SelectTrigger size="sm" className="w-48" aria-label="Park or close">
          <SelectValue placeholder="Park / close…" />
        </SelectTrigger>
        <SelectContent>
          {LI_STAGES.filter((s) => s.override).map((s) => (
            <SelectItem key={s.key} value={s.key}>
              {s.label}
            </SelectItem>
          ))}
          <SelectSeparator />
          <SelectItem value="__clear__">Back into the funnel</SelectItem>
        </SelectContent>
      </Select>
      <Select value="" onValueChange={(status) => run({ action: 'status', status }, (r) => `Status set to ${LI_STATUSES.find((s) => s.key === status)?.label} for ${pluralize(r.updated, 'prospect')}`)} disabled={bulk.isPending}>
        <SelectTrigger size="sm" className="w-40" aria-label="Set status">
          <SelectValue placeholder="Set status…" />
        </SelectTrigger>
        <SelectContent>
          {LI_STATUSES.map((s) => (
            <SelectItem key={s.key} value={s.key}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" variant="ghost" onClick={onDone} disabled={bulk.isPending} className="ml-auto">
        <X /> Clear selection
      </Button>
    </div>
  );
}

export function LinkedinView() {
  const { params, setParams, clearFilters, activeCount } = useLinkedinParams();
  const listParams = Object.fromEntries(Object.entries(params).filter(([k]) => k !== 'tab' && k !== 'period'));
  const { data, error, isPending, isError, isFetching, isPlaceholderData, refetch } = useQuery({
    queryKey: qk.linkedinList(listParams),
    queryFn: () => api.linkedin.list(listParams),
    placeholderData: keepPreviousData,
    refetchInterval: LIVE_MS,
    enabled: params.tab === 'prospects',
  });
  const selection = useSelection(FILTER_KEYS.map((k) => params[k]).join('|'));
  const [period, setPeriod] = useState(params.period || 'all');
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const onSort = (column) => setParams({ sort: column, dir: params.sort === column ? (params.dir === 'asc' ? 'desc' : 'asc') : SORTS[column] });

  let content;
  if (isError) {
    content = (
      <Alert variant="destructive">
        <CircleAlert />
        <AlertTitle>Could not load prospects</AlertTitle>
        <AlertDescription>
          <p>{error.message}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  } else if (isPending) {
    content = (
      <>
        <div className="md:hidden">
          <LinkedinCards loading />
        </div>
        <div className="hidden md:block">
          <LinkedinTable loading sort={params.sort} dir={params.dir} onSort={onSort} />
        </div>
      </>
    );
  } else if (total === 0) {
    content = (
      <div className={cn('flex flex-col items-center gap-4 rounded-lg border border-dashed px-4 py-16 text-center', ENTER)}>
        <span className="flex size-12 items-center justify-center rounded-full bg-muted">{activeCount ? <SearchX className="size-6 text-muted-foreground" /> : <Users className="size-6 text-muted-foreground" />}</span>
        <div>
          <h2 className="text-base font-semibold">{activeCount ? 'No prospects match' : 'No prospects yet'}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{activeCount ? 'Try different filters.' : 'Contacts with a LinkedIn profile URL show up here. Import a sheet or add the URL on a contact.'}</p>
        </div>
        {activeCount ? (
          <Button variant="outline" onClick={clearFilters}>
            Clear filters
          </Button>
        ) : null}
      </div>
    );
  } else {
    content = (
      <div className={cn('grid grid-cols-1 gap-4', ENTER)}>
        <div className="md:hidden">
          <LinkedinCards items={items} dimmed={isPlaceholderData} selected={selection.selected} onToggle={selection.toggle} />
        </div>
        <div className="hidden md:block">
          <LinkedinTable items={items} dimmed={isPlaceholderData} sort={params.sort} dir={params.dir} onSort={onSort} selected={selection.selected} onToggle={selection.toggle} onTogglePage={selection.toggleMany} />
        </div>
        <ContactsPagination page={data.page} pages={data.pages} limit={data.limit} total={total} count={items.length} onPage={(page) => setParams({ page })} onLimit={(limit) => setParams({ limit })} />
      </div>
    );
  }

  return (
    <div className={cn('grid grid-cols-1 gap-5', ENTER)}>
      <LinkedinStats period={period} onPeriod={setPeriod} scope={params.scope} />

      <Tabs value={params.tab} onValueChange={(tab) => setParams({ tab })}>
        <TabsList>
          <TabsTrigger value="prospects">
            <Linkedin className="size-3.5" /> Prospects
          </TabsTrigger>
          <TabsTrigger value="playbook">
            <BookOpen className="size-3.5" /> Playbook
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {params.tab === 'playbook' ? (
        <Playbook />
      ) : (
        <>
          <LinkedinToolbar params={params} setParams={setParams} clearFilters={clearFilters} activeCount={activeCount} />
          <div className="flex min-h-5 flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
              <span>{isPending ? 'Loading prospects…' : `${total.toLocaleString('en-US')} ${total === 1 ? 'prospect' : 'prospects'}${activeCount ? ' match' : ''}`}</span>
              {isFetching && !isPending ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
            </p>
          </div>
          {selection.ids.length ? <BulkBar ids={selection.ids} onDone={selection.clear} /> : null}
          {content}
        </>
      )}
    </div>
  );
}
