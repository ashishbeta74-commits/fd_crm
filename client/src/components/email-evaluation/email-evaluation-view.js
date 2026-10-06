'use client';

import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AtSign, CalendarCheck, ChevronLeft, ChevronRight, CircleAlert, ExternalLink, FileSpreadsheet, Loader2, MailCheck, Phone, PlusCircle, RefreshCw, SearchX, Settings2, TriangleAlert } from 'lucide-react';
import { api, qk } from '@/lib/api';
import { livePoll } from '@/lib/live';
import { pluralize, timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/auth/auth-provider';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { StatTile } from '@/components/dashboard/stat-tile';
import { EmailEvaluationDialog } from '@/components/email-evaluation/email-evaluation-dialog';
import { EmailEvaluationToolbar, PAGE_SIZES, SORTS, useEmailEvaluationParams } from '@/components/email-evaluation/email-evaluation-filters';
import { EmailEvaluationCards, EmailEvaluationTable } from '@/components/email-evaluation/email-evaluation-table';
import { useEmailEvaluationMeta, useSetSheet, useSyncSheet } from '@/components/email-evaluation/use-email-evaluation';

const ENTER = 'motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300';

export function EmailEvaluationViewFallback() {
  return (
    <div className="grid grid-cols-1 gap-4" aria-busy>
      <Skeleton className="h-12 w-full rounded-lg" />
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-[66px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  );
}

/** Admin: point the page at another sheet, or only some of its tabs. */
function SheetDialog({ open, onOpenChange, sheet }) {
  const setSheet = useSetSheet();
  const [url, setUrl] = useState(sheet?.url || '');
  const [tabs, setTabs] = useState((sheet?.tabs || []).join(', '));
  const submit = async (e) => {
    e.preventDefault();
    try {
      await setSheet.mutateAsync({ url: url.trim(), tabs: tabs.split(',').map((t) => t.trim()).filter(Boolean) });
      toast.success('Sheet saved - use "Sync now" to read it');
      onOpenChange(false);
    } catch {
      /* toasted by the mutation */
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-lg">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Linked sheet</DialogTitle>
            <DialogDescription>The Google Sheet this page reads (shared as &quot;Anyone with the link&quot;, or with the service account). Leave the tabs empty to read every tab that has a CLIENT NAME or PRIMARY EMAIL column.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="ee-sheet-url">Sheet link</Label>
            <Input id="ee-sheet-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ee-sheet-tabs">Tabs (optional, comma-separated)</Label>
            <Input id="ee-sheet-tabs" value={tabs} onChange={(e) => setTabs(e.target.value)} placeholder="HARRY, INFO, Advisors" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={setSheet.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={setSheet.isPending || !url.trim()}>
              {setSheet.isPending ? <Loader2 className="animate-spin" /> : null}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The linked sheet, when it was last read, and the buttons: Sync now, Add row, (admin) change sheet. */
function SheetBar({ meta, isPending }) {
  const { isAdmin } = useAuth();
  const sync = useSyncSheet();
  const [dialog, setDialog] = useState(null); // 'add' | 'sheet'
  const sheet = meta?.sheet;
  const tabs = sheet?.lastTabs?.length ? sheet.lastTabs : [];
  const errored = sheet?.lastResult === 'error';
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-card px-3 py-2 text-sm">
      <FileSpreadsheet className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
      {isPending || !sheet ? (
        <Skeleton className="h-4 w-64" />
      ) : (
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <a href={sheet.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium hover:underline">
            Open the Google Sheet <ExternalLink className="size-3.5" aria-hidden />
          </a>
          <span className="text-muted-foreground" suppressHydrationWarning>
            {sheet.lastSyncedAt ? `Last read ${timeAgo(sheet.lastSyncedAt)}` : 'Not read yet'}
            {tabs.length ? ` · tabs: ${tabs.join(', ')}` : ''}
            {meta.autoSync?.enabled ? ` · checked every ${meta.autoSync.minutes} min` : ''}
          </span>
          {errored ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-1 text-destructive">
                  <TriangleAlert className="size-3.5" aria-hidden /> last sync failed
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">{sheet.lastError}</TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      )}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="sm" variant="outline" onClick={() => sync.mutate()} disabled={sync.isPending} aria-busy={sync.isPending || undefined}>
              <RefreshCw className={cn(sync.isPending && 'animate-spin')} /> {sync.isPending ? 'Reading…' : 'Sync now'}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Re-read the sheet: new rows are added, changed cells updated, edits made here are kept</TooltipContent>
        </Tooltip>
        <Button size="sm" onClick={() => setDialog('add')}>
          <PlusCircle /> Add row
        </Button>
        {isAdmin ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon-sm" variant="ghost" onClick={() => setDialog('sheet')} aria-label="Change the linked sheet">
                <Settings2 />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Change the linked sheet or tabs</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      {dialog === 'add' ? <EmailEvaluationDialog open onOpenChange={(v) => !v && setDialog(null)} /> : null}
      {dialog === 'sheet' ? <SheetDialog open onOpenChange={(v) => !v && setDialog(null)} sheet={sheet} /> : null}
    </div>
  );
}

function Tiles({ meta, isPending }) {
  if (isPending || !meta) {
    return (
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-[66px] rounded-xl" />
        ))}
      </div>
    );
  }
  const c = meta.counts;
  return (
    <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-5">
      <StatTile compact label="Rows" value={c.total} icon={MailCheck} accent="green" caption={`${meta.tabs.filter((t) => t.tab).length} sheet tab${meta.tabs.filter((t) => t.tab).length === 1 ? '' : 's'}`} hint="Every evaluation row, from the sheet and added here" href="/email-evaluation" />
      <StatTile compact label="With email" value={c.withEmail} icon={AtSign} accent="blue" caption="have a primary email" hint="Rows with a primary email" />
      <StatTile compact label="With phone" value={c.withPhone} icon={Phone} accent="violet" caption="have a phone number" hint="Rows with a phone number" />
      <StatTile compact label="Follow-up written" value={c.followedUp} icon={CalendarCheck} accent="amber" caption={`${c.total - c.followedUp} without one`} hint='Rows with something in "Follow up" or "Date of follow up"' href="/email-evaluation?followUp=yes" />
      <StatTile compact label="Added here" value={c.addedHere} icon={PlusCircle} accent="slate" caption={c.missing ? `${c.missing} no longer in the sheet` : 'not in the sheet'} hint="Rows added in the CRM, which the sheet does not have" href={c.missing ? '/email-evaluation?missing=yes' : '/email-evaluation?tab=none'} tone={c.missing ? 'destructive' : 'default'} />
    </div>
  );
}

function Pagination({ page, pages, limit, total, count, onPage, onLimit }) {
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = total === 0 ? 0 : from + count - 1;
  return (
    <nav className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between" aria-label="Pagination">
      <p className="text-muted-foreground">
        {from}–{to} of {pluralize(total, 'row')}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 sm:justify-end">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Rows</span>
          <Select value={String(limit)} onValueChange={(v) => onLimit(Number(v))}>
            <SelectTrigger aria-label="Rows per page">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Previous page">
            <ChevronLeft /> Prev
          </Button>
          <span className="tabular-nums text-muted-foreground">
            {page} / {pages}
          </span>
          <Button variant="outline" size="sm" onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label="Next page">
            Next <ChevronRight />
          </Button>
        </div>
      </div>
    </nav>
  );
}

export function EmailEvaluationView() {
  const { params, setParams, clearFilters, activeCount } = useEmailEvaluationParams();
  const meta = useEmailEvaluationMeta();
  const { data, error, isPending, isError, isFetching, isPlaceholderData, refetch } = useQuery({
    queryKey: qk.emailEvaluationList(params),
    queryFn: () => api.emailEvaluation.list(params),
    placeholderData: keepPreviousData,
    refetchInterval: livePoll,
  });
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const onSort = (column) => setParams({ sort: column, dir: params.sort === column ? (params.dir === 'asc' ? 'desc' : 'asc') : SORTS[column] });
  const neverSynced = meta.data && !meta.data.sheet?.lastSyncedAt;

  let content;
  if (isError) {
    content = (
      <Alert variant="destructive">
        <CircleAlert />
        <AlertTitle>Could not load the email evaluations</AlertTitle>
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
          <EmailEvaluationCards loading />
        </div>
        <div className="hidden md:block">
          <EmailEvaluationTable loading sort={params.sort} dir={params.dir} onSort={onSort} />
        </div>
      </>
    );
  } else if (total === 0) {
    content = (
      <div className={cn('flex flex-col items-center gap-4 rounded-lg border border-dashed px-4 py-16 text-center', ENTER)}>
        <span className="flex size-12 items-center justify-center rounded-full bg-muted">{activeCount ? <SearchX className="size-6 text-muted-foreground" /> : <MailCheck className="size-6 text-muted-foreground" />}</span>
        <div>
          <h2 className="text-base font-semibold">{activeCount ? 'No rows match' : 'No email evaluations yet'}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{activeCount ? 'Try different filters.' : neverSynced ? 'The sheet has not been read yet - click "Sync now" above.' : 'The sheet has no rows with a client name or email. Add a row here, or fill the sheet and sync.'}</p>
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
          <EmailEvaluationCards items={items} dimmed={isPlaceholderData} />
        </div>
        <div className="hidden md:block">
          <EmailEvaluationTable items={items} dimmed={isPlaceholderData} sort={params.sort} dir={params.dir} onSort={onSort} />
        </div>
        <Pagination page={data.page} pages={data.pages} limit={data.limit} total={total} count={items.length} onPage={(page) => setParams({ page })} onLimit={(limit) => setParams({ limit })} />
      </div>
    );
  }

  return (
    <div className={cn('grid grid-cols-1 gap-5', ENTER)}>
      <SheetBar meta={meta.data} isPending={meta.isPending} />
      <Tiles meta={meta.data} isPending={meta.isPending} />
      <EmailEvaluationToolbar params={params} setParams={setParams} clearFilters={clearFilters} activeCount={activeCount} meta={meta.data} />
      <div className="flex min-h-5 flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
          <span>{isPending ? 'Loading rows…' : `${pluralize(total, 'row')}${activeCount ? ' match' : ''}`}</span>
          {isFetching && !isPending ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
        </p>
        <p className="text-xs text-muted-foreground">Click a status, note or follow-up cell to edit it in place.</p>
      </div>
      {content}
    </div>
  );
}
