'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, qk } from '@/lib/api';
import { formatDateTime, pluralize } from '@/lib/format';
import { cn } from '@/lib/utils';
import { EmptyState, ErrorState } from '@/components/import/status-blocks';
import { RenameListButton } from '@/components/import/rename-list-dialog';
import { SyncNowButton } from '@/components/import/sync-now-button';
import { UndoImportButton } from '@/components/import/undo-import-button';

const STATUS = {
  done: { label: 'Done', variant: 'secondary' },
  failed: { label: 'Failed', variant: 'destructive' },
  running: { label: 'Running', variant: 'outline' },
};

/** The list the batch imported into; older batches without one fall back to the sheet title / file name. */
const batchLabel = (b) => b.source?.listName || (b.source?.type === 'google-sheet' && b.source.title) || b.fileName || '(unnamed file)';

/** List name as the main label (opens the sheet for Google Sheet batches) + original file/sheet name, "Google Sheet" / "re-sync" notes. */
function SourceCell({ batch }) {
  const linked = batch.source?.type === 'google-sheet';
  const name = batchLabel(batch);
  // the sheet title / file name the list came from, when it is not simply the list name
  const origin = (linked ? batch.source.title : batch.fileName) || '';
  const showOrigin = Boolean(origin) && origin !== name;
  const originLine = showOrigin ? (
    <span className="block max-w-[16rem] truncate text-xs font-normal text-muted-foreground" title={origin}>
      {origin}
    </span>
  ) : null;
  if (!linked) {
    return (
      <div className="grid gap-0.5">
        <span className="block max-w-[16rem] truncate" title={name}>
          {name}
        </span>
        {originLine}
      </div>
    );
  }
  return (
    <div className="grid gap-1">
      <a href={batch.source.url} target="_blank" rel="noreferrer" className="flex max-w-[16rem] items-center gap-1 underline-offset-4 hover:underline" title={name}>
        <span className="truncate">{name}</span>
        <ExternalLink className="size-3 shrink-0 text-muted-foreground" aria-label="opens in a new tab" />
      </a>
      {originLine}
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="secondary" className="px-1.5 text-[10px]">
          Google Sheet
        </Badge>
        {batch.resyncOf ? (
          <span className="text-xs font-normal text-muted-foreground" title="Re-imported from the linked sheet with the stored mapping">
            re-sync
          </span>
        ) : null}
      </div>
    </div>
  );
}

function HistoryRows({ items }) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>List</TableHead>
            <TableHead>Imported</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Created</TableHead>
            <TableHead className="text-right">Updated</TableHead>
            <TableHead className="text-right">Skipped</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((b) => {
            const status = STATUS[b.status] || { label: b.status, variant: 'outline' };
            const undone = Boolean(b.undoneAt);
            const linked = b.source?.type === 'google-sheet';
            const name = batchLabel(b);
            const noPhone = b.totals?.noPhone || 0;
            return (
              <TableRow key={b._id} className={cn(undone && 'text-muted-foreground')}>
                <TableCell className="font-medium">
                  <SourceCell batch={b} />
                </TableCell>
                <TableCell title={b.syncedAt ? 'Last synced' : 'Imported'}>{formatDateTime(b.syncedAt || b.createdAt)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Badge variant={status.variant}>{status.label}</Badge>
                    {undone ? (
                      <Badge variant="outline" title={`Undone ${formatDateTime(b.undoneAt)}`}>
                        Undone · {pluralize(b.deletedOnUndo || 0, 'contact')} deleted
                      </Badge>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{b.totals?.created ?? 0}</TableCell>
                <TableCell className="text-right tabular-nums">{b.totals?.updated ?? 0}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {b.totals?.skipped ?? 0}
                  {noPhone > 0 ? (
                    <span className="block text-xs font-normal text-muted-foreground" title="Rows without a contact phone were not imported">
                      {noPhone} no phone
                    </span>
                  ) : null}
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <Button asChild variant="ghost" size="icon-sm">
                      <Link href={`/contacts?batch=${b._id}`} aria-label={`View contacts imported from ${name}`}>
                        <ExternalLink />
                      </Link>
                    </Button>
                    {!undone && b.source?.listName ? <RenameListButton name={b.source.listName} /> : null}
                    {linked && !undone ? <SyncNowButton batchId={b._id} title={name} variant="ghost" /> : null}
                    {!undone ? <UndoImportButton batch={b} variant="ghost" /> : null}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

/** GET /imports - every batch, newest first, with undo (and Sync now for Google Sheet batches). */
export function ImportHistory() {
  const { data, isPending, isError, error, refetch, isFetching } = useQuery({ queryKey: qk.imports, queryFn: api.imports.list });
  const items = data?.items || [];

  let body;
  if (isPending) {
    body = (
      <div className="grid gap-2" aria-busy="true" aria-label="Loading import history">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  } else if (isError) {
    body = <ErrorState message={error.message} onRetry={() => refetch()} />;
  } else if (!items.length) {
    body = <EmptyState title="No imports yet" description="Batches you import above will show up here, with an undo for each one." />;
  } else {
    body = <HistoryRows items={items} />;
  }

  return (
    <section className="grid grid-cols-1 gap-3" aria-labelledby="import-history-title">
      <div className="flex items-center justify-between">
        <h2 id="import-history-title" className="text-lg font-semibold">
          Import history
        </h2>
        <Button type="button" variant="ghost" size="icon-sm" onClick={() => refetch()} disabled={isFetching} aria-label="Refresh import history">
          <RefreshCw className={cn(isFetching && 'animate-spin')} />
        </Button>
      </div>
      {body}
    </section>
  );
}
