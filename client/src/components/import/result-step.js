'use client';

import Link from 'next/link';
import { AlertTriangle, CheckCircle2, ExternalLink, FileSpreadsheet, RotateCcw, Tag, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { pluralize } from '@/lib/format';
import { cn } from '@/lib/utils';
import { SyncNowButton } from '@/components/import/sync-now-button';
import { UndoImportButton } from '@/components/import/undo-import-button';

// `optional` stats (rows skipped for having no contact phone) only show up when the count is > 0
const TILES = [
  { key: 'created', label: 'Created' },
  { key: 'updated', label: 'Updated' },
  { key: 'skipped', label: 'Skipped' },
  { key: 'blank', label: 'Blank rows' },
  { key: 'noPhone', label: 'No phone (skipped)', optional: true },
  { key: 'merged', label: 'Merged' },
  { key: 'errorCount', label: 'Errors' },
];
const SHEET_COLUMNS = [
  { key: 'rows', label: 'Rows' },
  { key: 'created', label: 'Created' },
  { key: 'updated', label: 'Updated' },
  { key: 'skipped', label: 'Skipped' },
  { key: 'blank', label: 'Blank' },
  { key: 'noPhone', label: 'No phone', optional: true },
  { key: 'merged', label: 'Merged' },
  { key: 'errorCount', label: 'Errors' },
];

function StatTile({ label, value, alert }) {
  return (
    <div className={cn('rounded-lg border bg-card px-4 py-3', alert && 'border-destructive/40')}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 flex items-center gap-1.5 text-2xl font-semibold tabular-nums">
        {alert ? <AlertTriangle className="size-4 text-destructive" aria-label="Needs attention" /> : null}
        {value}
      </p>
    </div>
  );
}

function SheetErrors({ sheet }) {
  const samples = sheet.errorSamples || [];
  const more = (sheet.errorCount || 0) - samples.length;
  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
      <p className="font-medium">
        {sheet.name}: {sheet.error || pluralize(sheet.errorCount || 0, 'row error')}
      </p>
      {samples.length ? (
        <ul className="mt-2 grid gap-1 text-muted-foreground">
          {samples.map((e, i) => (
            <li key={`${e.row}-${i}`}>
              <span className="font-mono text-xs text-foreground">Row {e.row}</span> - {e.message}
            </li>
          ))}
          {more > 0 ? <li>… and {pluralize(more, 'more error')}</li> : null}
        </ul>
      ) : null}
    </div>
  );
}

/** Linked Google Sheet: title (opens the sheet), what a sync does, and Sync now. onSynced(batch) gets the new batch. */
function LinkedSheetPanel({ batch, onSynced }) {
  const title = batch.source?.title || batch.fileName;
  const undone = Boolean(batch.undoneAt);
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">Google Sheet</Badge>
          <a href={batch.source.url} target="_blank" rel="noreferrer" className="inline-flex min-w-0 max-w-full items-center gap-1.5 font-medium underline-offset-4 hover:underline">
            <FileSpreadsheet className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="truncate">{title}</span>
            <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" aria-label="opens in a new tab" />
          </a>
        </p>
        <p className="mt-1 text-sm text-muted-foreground">Syncing updates existing contacts, adds new rows and follows stage changes from the sheet.</p>
      </div>
      {!undone ? <SyncNowButton batchId={batch._id} title={title} size="default" onSynced={onSynced} /> : null}
    </div>
  );
}

/** Step 3: the ImportBatch returned by commit (or by a re-sync). onBatchChange(batch) is called after an undo or a sync. */
export function ResultStep({ batch, onReset, onBatchChange }) {
  const totals = batch.totals || {};
  const sheets = batch.sheets || [];
  const undone = Boolean(batch.undoneAt);
  const linked = batch.source?.type === 'google-sheet';
  const listName = batch.source?.listName || '';
  const failing = sheets.filter((s) => s.error || s.errorSamples?.length);
  const showNoPhone = (totals.noPhone || 0) > 0;
  const tiles = TILES.filter((t) => !t.optional || showNoPhone);
  const columns = SHEET_COLUMNS.filter((c) => !c.optional || showNoPhone);

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400" aria-hidden />
            {batch.resyncOf ? 'Sheet synced' : 'Import finished'}
          </h2>
          <span className="text-sm text-muted-foreground">
            {batch.fileName} · {pluralize(totals.rows || 0, 'row')} processed
          </span>
          {undone ? <Badge variant="outline">Undone - {pluralize(batch.deletedOnUndo || 0, 'contact')} deleted</Badge> : null}
        </div>
        {listName ? (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <Tag className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="text-muted-foreground">Imported into list:</span>
            <Badge variant="outline" className="max-w-full text-sm font-semibold" title="Contacts carry this name; the contact list filters by it (All sheets / list name)">
              <span className="truncate">{listName}</span>
            </Badge>
          </p>
        ) : null}
      </div>

      {linked ? <LinkedSheetPanel batch={batch} onSynced={onBatchChange} /> : null}

      {showNoPhone && !(totals.created || 0) && !(totals.updated || 0) ? (
        <div role="alert" className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="grid gap-1">
            <p className="font-medium">Nothing was imported: {pluralize(totals.noPhone, 'row')} had no contact phone.</p>
            <p>
              &quot;Skip rows without a contact phone&quot; is on for this sheet, and the Contact Phone column is empty on every row (or is not mapped). Fill in the phone numbers in the
              sheet and sync again, or import the link once more with that option switched off in the Map columns step. Until a contact is imported, the sheet does not appear under
              &quot;All sheets&quot; on the Contacts page.
            </p>
          </div>
        </div>
      ) : null}

      <div className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3', tiles.length > 6 ? 'lg:grid-cols-7' : 'lg:grid-cols-6')}>
        {tiles.map((t) => (
          <StatTile key={t.key} label={t.label} value={totals[t.key] || 0} alert={t.key === 'errorCount' && (totals.errorCount || 0) > 0} />
        ))}
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sheet</TableHead>
              {columns.map((c) => (
                <TableHead key={c.key} className="text-right">
                  {c.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sheets.map((s) => (
              <TableRow key={s.name} className={cn(!s.included && 'text-muted-foreground')}>
                <TableCell className="font-medium">
                  {s.name}
                  {!s.included ? <span className="ml-2 text-xs font-normal text-muted-foreground">not included</span> : null}
                </TableCell>
                {columns.map((c) => (
                  <TableCell key={c.key} className="text-right tabular-nums">
                    {s.included || c.key === 'rows' ? (s[c.key] ?? 0) : '–'}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {failing.length ? (
        <div className="grid gap-3">
          {failing.map((s) => (
            <SheetErrors key={s.name} sheet={s} />
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {!undone ? (
          <Button asChild>
            <Link href={`/contacts?batch=${batch._id}`}>
              <Users /> View imported contacts
            </Link>
          </Button>
        ) : null}
        <Button type="button" variant="outline" onClick={onReset}>
          <RotateCcw /> Import another
        </Button>
        {!undone ? <UndoImportButton batch={batch} label="Undo this import" size="default" variant="ghost" className="text-destructive" onUndone={onBatchChange} /> : null}
      </div>
    </div>
  );
}
