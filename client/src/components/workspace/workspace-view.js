'use client';

import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, CircleAlert, ClipboardList, DollarSign, ExternalLink, FileSpreadsheet, Loader2, PlusCircle, RefreshCw, SearchX, Settings2, Tag, TriangleAlert } from 'lucide-react';
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
import { WorkspaceDialog } from '@/components/workspace/workspace-dialog';
import { PAGE_SIZES, WorkspaceToolbar, useWorkspaceParams } from '@/components/workspace/workspace-filters';
import { WorkspaceCards, WorkspaceTable, toneFor } from '@/components/workspace/workspace-table';
import { useSetSheet, useSyncSheet, useWorkspaceMeta } from '@/components/workspace/use-workspace';

const ENTER = 'motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300';

export function WorkspaceViewFallback() {
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

function SheetDialog({ workspaceKey, open, onOpenChange, sheet }) {
  const setSheet = useSetSheet(workspaceKey);
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
            <DialogDescription>The Google Sheet this page reads (shared as &quot;Anyone with the link&quot;, or with the service account). Leave the tabs empty to read the tab the link points to.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="ws-sheet-url">Sheet link</Label>
            <Input id="ws-sheet-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ws-sheet-tabs">Tabs (optional, comma-separated)</Label>
            <Input id="ws-sheet-tabs" value={tabs} onChange={(e) => setTabs(e.target.value)} placeholder="Sheet1, Sheet2" />
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
function SheetBar({ workspaceKey, meta, isPending }) {
  const { isAdmin } = useAuth();
  const sync = useSyncSheet(workspaceKey);
  const [dialog, setDialog] = useState(null); // 'add' | 'sheet'
  const sheet = meta?.sheet;
  const ws = meta?.workspace;
  const tabs = sheet?.lastTabs || [];
  const errored = sheet?.lastResult === 'error';
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-card px-3 py-2 text-sm">
      <FileSpreadsheet className="size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
      {isPending || !sheet ? (
        <Skeleton className="h-4 w-64" />
      ) : (
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <a href={sheet.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium hover:underline">
            Open the Google Sheet <ExternalLink className="size-3.5" aria-hidden />
          </a>
          <span className="text-muted-foreground" suppressHydrationWarning>
            {sheet.lastSyncedAt ? `Last read ${timeAgo(sheet.lastSyncedAt)}` : 'Not read yet'}
            {tabs.length ? ` · tab${tabs.length === 1 ? '' : 's'}: ${tabs.join(', ')}` : ''}
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
        <Button size="sm" onClick={() => setDialog('add')} disabled={!ws}>
          <PlusCircle /> Add {ws?.rowLabel || 'row'}
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
      {dialog === 'add' && ws ? <WorkspaceDialog workspace={ws} options={meta.filters} tabs={tabs.length ? tabs : (meta.tabs || []).map((t) => t.tab).filter(Boolean)} open onOpenChange={(v) => !v && setDialog(null)} /> : null}
      {dialog === 'sheet' ? <SheetDialog workspaceKey={workspaceKey} open onOpenChange={(v) => !v && setDialog(null)} sheet={sheet} /> : null}
    </div>
  );
}

const ACCENTS = ['green', 'red', 'amber', 'blue', 'violet', 'pink', 'orange', 'slate'];
const accentFor = (v) => (/converted|booked|won|done/i.test(v) ? 'green' : /not interested|lost|cancel|declined/i.test(v) ? 'red' : /await|pending|wait|open/i.test(v) ? 'amber' : null);

/** Total, one tile per status value (with its share), the business value when the workspace has one, and rows added here. */
function Tiles({ href, meta, isPending }) {
  if (isPending || !meta) {
    return (
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-[66px] rounded-xl" />
        ))}
      </div>
    );
  }
  const ws = meta.workspace;
  const c = meta.counts;
  const statusField = ws.fields.find((f) => f.key === ws.statusField);
  const statuses = [...meta.status].filter((s) => s.value).sort((a, b) => b.count - a.count).slice(0, 4);
  const pct = (n) => (c.total ? `${Math.round((n / c.total) * 100)}% of all` : '');
  const money = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
  return (
    <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-5">
      <StatTile compact label={`${ws.label}`} value={c.total} icon={ClipboardList} accent="slate" caption={`${pluralize(c.total, ws.rowLabel)} in all`} hint="Every row, from the sheet and added here" href={href} />
      {statuses.map((s, i) => (
        <StatTile key={s.value} compact label={s.value} value={s.count} icon={Tag} accent={accentFor(s.value) || ACCENTS[(i + 3) % ACCENTS.length]} caption={pct(s.count)} hint={`${statusField?.label || 'Status'} = ${s.value}`} href={`${href}?f.${ws.statusField}=${encodeURIComponent(s.value)}`} />
      ))}
      {ws.valueField && c.value ? <StatTile compact label={ws.fields.find((f) => f.key === ws.valueField)?.label || 'Value'} value={c.value} display={money(c.value)} icon={DollarSign} accent="green" caption="sum of the rows that have one" hint="Only rows with a number in this column count" /> : null}
      {c.addedHere || c.missing ? <StatTile compact label="Added here" value={c.addedHere} icon={PlusCircle} accent="slate" caption={c.missing ? `${c.missing} no longer in the sheet` : 'not in the sheet'} hint="Rows added in the CRM, which the sheet does not have" href={c.missing ? `${href}?missing=yes` : `${href}?tab=none`} tone={c.missing ? 'destructive' : 'default'} /> : null}
    </div>
  );
}

function Pagination({ rowLabel, page, pages, limit, total, count, onPage, onLimit }) {
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = total === 0 ? 0 : from + count - 1;
  return (
    <nav className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between" aria-label="Pagination">
      <p className="text-muted-foreground">
        {from}–{to} of {pluralize(total, rowLabel)}
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

/** A sheet workspace page: sheet bar, tiles, toolbar, table / cards, pagination. `workspace` is the config key, `href` the page path. */
export function WorkspaceView({ workspace: key, href }) {
  const { params, setParams, clearFilters, activeCount } = useWorkspaceParams(href);
  const meta = useWorkspaceMeta(key);
  const ws = meta.data?.workspace;
  const { data, error, isPending, isError, isFetching, isPlaceholderData, refetch } = useQuery({
    queryKey: qk.workspaceRows(key, params),
    queryFn: () => api.workspaces.rows(key, params),
    placeholderData: keepPreviousData,
    refetchInterval: livePoll,
  });
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const sort = params.sort || ws?.defaultSort?.field || '';
  const dir = params.dir || (sort === ws?.defaultSort?.field ? ws?.defaultSort?.dir : ws?.fields.find((f) => f.key === sort)?.type === 'date' ? 'desc' : 'asc');
  const onSort = (column) => setParams({ sort: column, dir: sort === column ? (dir === 'asc' ? 'desc' : 'asc') : ws?.fields.find((f) => f.key === column)?.type === 'date' || column === ws?.defaultSort?.field ? 'desc' : 'asc' });
  const neverSynced = meta.data && !meta.data.sheet?.lastSyncedAt;
  const rowLabel = ws?.rowLabel || 'row';
  const showTab = (meta.data?.tabs || []).length > 1;

  let content;
  if (isError || meta.isError) {
    const err = error || meta.error;
    content = (
      <Alert variant="destructive">
        <CircleAlert />
        <AlertTitle>Could not load this page</AlertTitle>
        <AlertDescription>
          <p>{err.message}</p>
          <Button variant="outline" size="sm" onClick={() => (isError ? refetch() : meta.refetch())}>
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  } else if (isPending || !ws) {
    content = (
      <>
        <div className="md:hidden">
          <WorkspaceCards workspace={ws || { fields: [], rowLabel }} loading />
        </div>
        <div className="hidden md:block">{ws ? <WorkspaceTable workspace={ws} loading sort={sort} dir={dir} onSort={onSort} /> : <Skeleton className="h-64 w-full rounded-lg" />}</div>
      </>
    );
  } else if (total === 0) {
    content = (
      <div className={cn('flex flex-col items-center gap-4 rounded-lg border border-dashed px-4 py-16 text-center', ENTER)}>
        <span className="flex size-12 items-center justify-center rounded-full bg-muted">{activeCount ? <SearchX className="size-6 text-muted-foreground" /> : <ClipboardList className="size-6 text-muted-foreground" />}</span>
        <div>
          <h2 className="text-base font-semibold">{activeCount ? `No ${pluralize(2, rowLabel).slice(2)} match` : `No ${pluralize(2, rowLabel).slice(2)} yet`}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{activeCount ? 'Try different filters.' : neverSynced ? 'The sheet has not been read yet - click "Sync now" above.' : `The sheet has no rows this page recognises. Add a ${rowLabel} here, or fill the sheet and sync.`}</p>
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
          <WorkspaceCards workspace={ws} items={items} dimmed={isPlaceholderData} filterValues={meta.data.filters} />
        </div>
        <div className="hidden md:block">
          <WorkspaceTable workspace={ws} items={items} dimmed={isPlaceholderData} sort={sort} dir={dir} onSort={onSort} filterValues={meta.data.filters} showTab={showTab} />
        </div>
        <Pagination rowLabel={rowLabel} page={data.page} pages={data.pages} limit={data.limit} total={total} count={items.length} onPage={(page) => setParams({ page })} onLimit={(limit) => setParams({ limit })} />
      </div>
    );
  }

  const inlineFields = (ws?.fields || []).filter((f) => f.inline);
  return (
    <div className={cn('grid grid-cols-1 gap-5', ENTER)}>
      <SheetBar workspaceKey={key} meta={meta.data} isPending={meta.isPending} />
      <Tiles href={href} meta={meta.data} isPending={meta.isPending} />
      <WorkspaceToolbar workspace={ws} meta={meta.data} params={params} setParams={setParams} clearFilters={clearFilters} activeCount={activeCount} />
      <div className="flex min-h-5 flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
          <span>{isPending ? 'Loading…' : `${pluralize(total, rowLabel)}${activeCount ? ' match' : ''}`}</span>
          {isFetching && !isPending ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
        </p>
        {inlineFields.length ? <p className="text-xs text-muted-foreground">Click a cell to edit it in place{inlineFields.some((f) => f.type === 'enum') ? '; statuses are dropdowns' : ''}.</p> : null}
      </div>
      {content}
    </div>
  );
}

export { toneFor };
