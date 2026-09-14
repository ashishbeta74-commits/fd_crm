'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CalendarDays, ExternalLink, FileSpreadsheet, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { api, qk } from '@/lib/api';
import { formatDateTime, pluralize, timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import { AddSheetForm } from '@/components/import/add-sheet-form';
import { EmptyState, ErrorState } from '@/components/import/status-blocks';
import { RenameListButton } from '@/components/import/rename-list-dialog';
import { SyncNowButton } from '@/components/import/sync-now-button';
import { WritebackCell, WritebackInfo } from '@/components/import/writeback-settings';

const STRATEGY = { skip: 'Skip existing', update: 'Update existing' };

/** Outcome of the last sync attempt (manual or automatic): a red "Sync failed" badge with the reason, or a quiet "checked" line. */
function SyncStatus({ item }) {
  if (!item.lastCheckedAt) return null;
  if (item.lastCheck === 'error') {
    return (
      <div className="grid gap-1" role="status">
        <Badge variant="destructive" className="w-fit gap-1 font-normal">
          <AlertTriangle className="size-3" aria-hidden />
          Sync failed
          <span className="font-normal opacity-80" suppressHydrationWarning>
            · {timeAgo(item.lastCheckedAt)}
          </span>
        </Badge>
        <span className="line-clamp-2 text-xs text-destructive" title={item.lastError || ''}>
          {item.lastError || 'Unknown error'}
        </span>
      </div>
    );
  }
  return (
    <span className="block text-xs text-muted-foreground" suppressHydrationWarning>
      Checked {timeAgo(item.lastCheckedAt)}
      {item.lastCheck === 'unchanged' ? ' · no changes' : ''}
    </span>
  );
}

function Stat({ label, value }) {
  return (
    <span className="inline-flex items-baseline gap-1 rounded-md bg-muted/60 px-2 py-0.5 text-xs">
      <span className="font-semibold tabular-nums">{value ?? '–'}</span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}

/**
 * One linked sheet. Everything wraps: name + badges on top, sync details and stats in the middle,
 * actions at the end, so it reads on a phone and never forces the page wider on a desktop.
 */
function SourceRow({ s, writeBackConfigured }) {
  // the saved sheet name comes first; the list name contacts carry (or the sheet title) is shown underneath when it differs
  const name = s.name || s.listName || s.title || 'Google Sheet';
  const sub = [s.listName, s.title].find((t) => t && t !== name);
  const imported = Boolean(s.lastBatchId);
  return (
    <li className="grid gap-3 py-4 first:pt-0 last:pb-0 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] lg:items-start lg:gap-6">
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1">
          <a href={s.url} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-1.5 font-medium underline-offset-4 hover:underline" title={name}>
            <FileSpreadsheet className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="truncate">{name}</span>
            <ExternalLink className="size-3 shrink-0 text-muted-foreground" aria-label="opens in a new tab" />
          </a>
          {s.listName || s.name ? <RenameListButton name={s.listName || s.name} sheetId={s.sheetId} className="shrink-0 text-muted-foreground" /> : null}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {s.dateLabel ? (
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-3" aria-hidden /> {s.dateLabel}
            </span>
          ) : null}
          {sub ? (
            <span className="truncate" title={sub}>
              {sub}
            </span>
          ) : null}
          {imported && s.requirePhone ? (
            <Badge variant="outline" className="px-1.5 text-[10px] font-normal" title="Rows without a contact phone are skipped when this sheet syncs">
              phone required
            </Badge>
          ) : null}
          {imported && (s.totals?.noPhone || 0) > 0 && !(s.totals?.created || 0) && !(s.totals?.updated || 0) ? (
            <span className="text-amber-700 dark:text-amber-300" title="Every row was skipped because its Contact Phone cell is empty. Fill the phones in and sync again, or re-import the link with 'Skip rows without a contact phone' off.">
              all {pluralize(s.totals.noPhone, 'row')} skipped - no contact phone
            </span>
          ) : null}
          {imported ? <span>{`${STRATEGY[s.strategy] || s.strategy || ''}${s.updateStage ? ' + stage' : ''}`}</span> : null}
        </div>
        {s.note ? <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{s.note}</p> : null}
      </div>

      <div className="grid min-w-0 gap-1.5">
        {imported ? (
          <>
            <div className="text-sm">
              <span className="text-muted-foreground">Last synced </span>
              <span>{formatDateTime(s.lastSyncedAt)}</span>
              <span className="text-xs text-muted-foreground" suppressHydrationWarning>
                {' '}
                · {timeAgo(s.lastSyncedAt)}
              </span>
            </div>
            <SyncStatus item={s} />
            <div className="flex flex-wrap gap-1.5">
              <Stat label="created" value={s.totals?.created} />
              <Stat label="updated" value={s.totals?.updated} />
              <Stat label="skipped" value={s.totals?.skipped} />
              {s.totals?.enriched ? <Stat label="enriched" value={s.totals.enriched} /> : null}
            </div>
          </>
        ) : (
          <Badge variant="secondary" className="w-fit font-normal" title="Saved in the list, but not imported yet - paste the link above to import it">
            Not imported yet
          </Badge>
        )}
      </div>

      <div className="flex flex-wrap items-start gap-3 lg:flex-col lg:items-end">
        {imported ? <SyncNowButton batchId={s.lastBatchId} title={name} /> : null}
        <WritebackCell item={s} configured={writeBackConfigured} />
      </div>
    </li>
  );
}

/**
 * GET /imports/sources - the saved list of calling sheets (name, date, link) merged with the latest import per sheet.
 * Imported sheets get Sync now; sheets added by link only wait for their first import.
 */
export function LinkedSheets() {
  const { data, isPending, isError, error, refetch, isFetching } = useQuery({ queryKey: qk.importSources, queryFn: api.imports.sources });
  const items = data?.items || [];

  let body;
  if (isPending) {
    body = (
      <div className="grid gap-2" aria-busy="true" aria-label="Loading linked sheets">
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  } else if (isError) {
    body = <ErrorState message={error.message} onRetry={() => refetch()} />;
  } else if (!items.length) {
    body = <EmptyState title="No sheets yet" description="Paste a Google Sheet link above to import one, or add a sheet to the list below." />;
  } else {
    body = (
      <ul className="divide-y">
        {items.map((s) => (
          <SourceRow key={s.spreadsheetId} s={s} writeBackConfigured={Boolean(data?.writeBack?.configured)} />
        ))}
      </ul>
    );
  }

  return (
    <Card aria-labelledby="linked-sheets-title" className="min-w-0">
      <CardHeader>
        <CardTitle id="linked-sheets-title" className="text-lg">
          Linked sheets
        </CardTitle>
        <CardDescription>
          The team&apos;s calling sheets, saved in the database with their date and link. Sync now re-reads a sheet: it updates existing contacts, adds new
          rows and follows stage changes. Two-way sync writes the CRM&apos;s stage, priority, tags, follow-up and notes back into the sheet.
        </CardDescription>
        <CardAction>
          <Button type="button" variant="ghost" size="icon-sm" onClick={() => refetch()} disabled={isFetching} aria-label="Refresh linked sheets">
            <RefreshCw className={cn(isFetching && 'animate-spin')} />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-4">
        {data?.writeBack ? <WritebackInfo info={data.writeBack} /> : null}
        {body}
        <Separator />
        <div className="grid gap-2">
          <p className="text-sm text-muted-foreground">Add a sheet to the list (or paste a link that is already listed to change its name or date).</p>
          <AddSheetForm />
        </div>
      </CardContent>
    </Card>
  );
}
