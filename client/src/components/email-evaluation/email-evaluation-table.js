'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, ChevronsUpDown, MoreHorizontal, Pencil, Trash2, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmailEvaluationDialog } from '@/components/email-evaluation/email-evaluation-dialog';
import { useRemoveRow, useUpdateRow } from '@/components/email-evaluation/use-email-evaluation';

const Dash = () => <span className="text-muted-foreground">—</span>;

// The sheet's columns in the sheet's order (minus the second STATUS), plus the tab the row came from.
const COLUMNS = [
  { key: 'date', label: 'Date', sort: 'date' },
  { key: 'evaluatedFor', label: 'Evaluated for', sort: 'evaluatedFor' },
  { key: 'clientName', label: 'Client name', sort: 'clientName' },
  { key: 'company', label: 'Company', sort: 'company' },
  { key: 'status', label: 'Status', sort: 'status' },
  { key: 'primaryEmail', label: 'Primary email', sort: 'primaryEmail' },
  { key: 'secondaryEmail', label: 'Secondary email' },
  { key: 'phone', label: 'Phone no' },
  { key: 'notes', label: 'Notes' },
  { key: 'followUp', label: 'Follow up' },
  { key: 'followUpDate', label: 'Date of follow up', sort: 'followUpDate' },
  { key: 'tab', label: 'Tab', sort: 'tab' },
];

// The first column stays put while the rest scrolls sideways.
const STICKY_HEAD = 'md:sticky md:left-0 md:z-10 bg-[color-mix(in_oklab,var(--muted)_40%,var(--card))] md:shadow-[inset_-1px_0_0_var(--border)]';
const STICKY_CELL = 'md:sticky md:left-0 md:z-10 bg-card group-hover/row:bg-[color-mix(in_oklab,var(--muted)_50%,var(--card))] md:shadow-[inset_-1px_0_0_var(--border)]';

const telHref = (phone) => `tel:${String(phone).replace(/[^\d+]/g, '')}`;
const firstEmail = (s) => String(s || '').split(/[;,\s]+/).filter(Boolean)[0] || '';

function EmailLink({ value, className }) {
  if (!value) return <Dash />;
  const first = firstEmail(value);
  if (!first.includes('@')) return <span className={cn('block truncate', className)} title={value}>{value}</span>;
  return (
    <a href={`mailto:${first}`} className={cn('block truncate hover:underline', className)} title={value}>
      {value}
    </a>
  );
}

/**
 * A cell that turns into an input on click (Enter / blur saves, Esc cancels) for the fields the
 * team updates most: status, notes, follow up, date of follow up.
 */
function EditableCell({ item, field, className, multiline = false }) {
  const update = useUpdateRow();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const value = item[field] || '';
  const start = () => {
    setText(value);
    setEditing(true);
  };
  const save = () => {
    setEditing(false);
    const next = text.trim();
    if (next === value) return;
    update.mutate({ id: item._id, data: { [field]: next } }, { onSuccess: () => toast.success('Saved') });
  };
  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !(multiline && e.shiftKey)) {
      e.preventDefault();
      save();
    } else if (e.key === 'Escape') {
      setEditing(false);
    }
  };
  if (editing) {
    return multiline ? (
      <textarea value={text} onChange={(e) => setText(e.target.value)} onBlur={save} onKeyDown={onKeyDown} rows={3} autoFocus className={cn('w-full min-w-56 rounded-md border bg-background px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50', className)} aria-label={`Edit ${field}`} />
    ) : (
      <Input value={text} onChange={(e) => setText(e.target.value)} onBlur={save} onKeyDown={onKeyDown} autoFocus className={cn('h-8 min-w-40', className)} aria-label={`Edit ${field}`} />
    );
  }
  return (
    <button
      type="button"
      onClick={start}
      disabled={update.isPending}
      title={value ? `${value}\n\nClick to edit` : 'Click to edit'}
      className={cn('-mx-1 block max-w-full rounded-sm px-1 py-0.5 text-left text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50', multiline ? 'line-clamp-2 whitespace-pre-line' : 'truncate', !value && 'text-muted-foreground', className)}
    >
      {value || '—'}
    </button>
  );
}

/** Edit all fields / delete, in a small menu at the end of the row. */
function RowActions({ item, compact = false, tabs = [] }) {
  const [dialog, setDialog] = useState(null); // 'edit' | 'delete'
  const remove = useRemoveRow();
  return (
    <>
      <div className="flex items-center justify-end gap-1">
        {compact ? null : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon-sm" variant="ghost" onClick={() => setDialog('edit')} aria-label="Edit row">
                <Pencil />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Edit all fields</TooltipContent>
          </Tooltip>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon-sm" variant="outline" aria-label="More actions">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onSelect={() => setDialog('edit')}>
              <Pencil /> Edit all fields
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => setDialog('delete')}>
              <Trash2 /> Delete from the CRM
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {dialog === 'edit' ? <EmailEvaluationDialog key={`${item._id}-${item.updatedAt}`} item={item} tabs={tabs} open onOpenChange={(v) => !v && setDialog(null)} /> : null}
      <ConfirmDialog
        open={dialog === 'delete'}
        onOpenChange={(v) => !v && setDialog(null)}
        title="Delete this row?"
        description={item.tab ? `It is removed from the CRM only. While it stays in the "${item.tab}" tab of the sheet, the next sync brings it back.` : 'This row was added in the CRM and is not in the sheet; it is gone for good.'}
        confirmLabel="Delete"
        destructive
        pending={remove.isPending}
        onConfirm={() =>
          remove.mutate(item._id, {
            onSuccess: () => {
              toast.success('Row deleted');
              setDialog(null);
            },
          })
        }
      />
    </>
  );
}

function MissingBadge({ item }) {
  if (!item.missingSince) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-1.5 py-px text-[11px] text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300">
          <TriangleAlert className="size-3" aria-hidden /> not in sheet
        </span>
      </TooltipTrigger>
      <TooltipContent>Edited here, but no longer in the sheet (since {formatDate(item.missingSince)}). Kept so the edits are not lost.</TooltipContent>
    </Tooltip>
  );
}

function SortableHead({ label, column, sort, dir, onSort, className }) {
  const active = sort === column;
  const Icon = !active ? ChevronsUpDown : dir === 'asc' ? ChevronUp : ChevronDown;
  return (
    <TableHead aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={className}>
      <button type="button" onClick={() => onSort?.(column)} className={cn('-mx-1 inline-flex h-8 items-center gap-1 rounded-sm px-1 text-xs font-medium tracking-wide uppercase outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50', active ? 'text-foreground' : 'text-muted-foreground')}>
        {label}
        <Icon className={cn('size-3.5', !active && 'opacity-50')} aria-hidden />
      </button>
    </TableHead>
  );
}

function Row({ item: c, tabs }) {
  return (
    <TableRow className="group/row">
      <TableCell className={cn(STICKY_CELL, 'w-56 min-w-56 max-w-56')}>
        <div className="flex max-w-full items-center gap-1.5">
          <span className="min-w-0 truncate font-medium" title={c.clientName || undefined}>
            {c.clientName || <span className="text-muted-foreground">(no name)</span>}
          </span>
          <MissingBadge item={c} />
        </div>
      </TableCell>
      <TableCell className="whitespace-nowrap text-sm" suppressHydrationWarning>
        {c.date ? formatDate(c.date) : c.dateLabel || <Dash />}
      </TableCell>
      <TableCell className="text-sm tabular-nums">{c.evaluatedFor || <Dash />}</TableCell>
      <TableCell>
        <div className="max-w-56 truncate" title={c.company || undefined}>
          {c.company || <Dash />}
        </div>
      </TableCell>
      <TableCell>
        <EditableCell item={c} field="status" className="max-w-56" />
      </TableCell>
      <TableCell>
        <EmailLink value={c.primaryEmail} className="max-w-64" />
      </TableCell>
      <TableCell>
        <EmailLink value={c.secondaryEmail} className="max-w-48" />
      </TableCell>
      <TableCell>
        {c.phone ? (
          <a href={telHref(c.phone)} className="whitespace-nowrap hover:underline">
            {c.phone}
          </a>
        ) : (
          <Dash />
        )}
      </TableCell>
      <TableCell>
        <EditableCell item={c} field="notes" className="max-w-80" multiline />
      </TableCell>
      <TableCell>
        <EditableCell item={c} field="followUp" className="max-w-40" />
      </TableCell>
      <TableCell>
        <EditableCell item={c} field="followUpDate" className="max-w-48" />
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{c.tab || 'CRM'}</TableCell>
      <TableCell className="text-right">
        <RowActions item={c} tabs={tabs} />
      </TableCell>
    </TableRow>
  );
}

function SkeletonRow() {
  return (
    <TableRow className="group/row">
      <TableCell className={STICKY_CELL}>
        <Skeleton className="h-4 w-36" />
      </TableCell>
      {COLUMNS.slice(1).map((col) => (
        <TableCell key={col.key}>
          <Skeleton className="h-4 w-24" />
        </TableCell>
      ))}
      <TableCell>
        <Skeleton className="ml-auto h-8 w-16" />
      </TableCell>
    </TableRow>
  );
}

export function EmailEvaluationTable({ items = [], loading = false, dimmed = false, sort, dir, onSort, tabs = [] }) {
  // The client name goes first (it is the frozen column); the other columns keep the sheet's order.
  const name = COLUMNS.find((c) => c.key === 'clientName');
  const rest = COLUMNS.filter((c) => c.key !== 'clientName');
  return (
    <div className={cn('relative overflow-x-auto rounded-lg border bg-card transition-opacity duration-200', dimmed && 'opacity-60')} aria-busy={loading || dimmed || undefined}>
      <Table className="min-w-[1900px]">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <SortableHead label={name.label} column={name.sort} sort={sort} dir={dir} onSort={onSort} className={STICKY_HEAD} />
            {rest.map((col) => (col.sort ? <SortableHead key={col.key} label={col.label} column={col.sort} sort={sort} dir={dir} onSort={onSort} /> : <TableHead key={col.key}>{col.label}</TableHead>))}
            <TableHead className="w-24 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>{loading ? Array.from({ length: 8 }, (_, i) => <SkeletonRow key={i} />) : items.map((c) => <Row key={c._id} item={c} tabs={tabs} />)}</TableBody>
      </Table>
    </div>
  );
}

/** Phone layout: one card per row. */
export function EmailEvaluationCards({ items = [], loading = false, dimmed = false, tabs = [] }) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-3" aria-busy>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-40 w-full rounded-lg" />
        ))}
      </div>
    );
  }
  return (
    <ul className={cn('grid grid-cols-1 gap-3', dimmed && 'opacity-60')}>
      {items.map((c) => (
        <li key={c._id} className="grid min-w-0 gap-2.5 rounded-lg border bg-card p-3">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold">{c.clientName || '(no name)'}</p>
              <p className="truncate text-sm text-muted-foreground">{[c.company, c.evaluatedFor && `for ${c.evaluatedFor}`, c.tab].filter(Boolean).join(' · ')}</p>
            </div>
            <RowActions item={c} compact tabs={tabs} />
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span suppressHydrationWarning>{c.date ? formatDate(c.date) : c.dateLabel || 'no date'}</span>
            <MissingBadge item={c} />
          </div>
          {c.primaryEmail || c.secondaryEmail || c.phone ? (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {c.phone ? (
                <a href={telHref(c.phone)} className="text-primary">
                  {c.phone}
                </a>
              ) : null}
              {c.primaryEmail ? <EmailLink value={c.primaryEmail} className="min-w-0 text-primary" /> : null}
              {c.secondaryEmail ? <EmailLink value={c.secondaryEmail} className="min-w-0 text-primary" /> : null}
            </div>
          ) : null}
          <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-2 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Status</dt>
            <dd>
              <EditableCell item={c} field="status" />
            </dd>
            <dt className="text-muted-foreground">Notes</dt>
            <dd>
              <EditableCell item={c} field="notes" multiline />
            </dd>
            <dt className="text-muted-foreground">Follow up</dt>
            <dd>
              <EditableCell item={c} field="followUp" />
            </dd>
            <dt className="text-muted-foreground">Follow-up date</dt>
            <dd>
              <EditableCell item={c} field="followUpDate" />
            </dd>
          </dl>
        </li>
      ))}
    </ul>
  );
}
