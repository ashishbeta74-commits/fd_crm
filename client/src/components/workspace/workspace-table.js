'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, ChevronsUpDown, MoreHorizontal, Pencil, Trash2, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { daysFromToday, formatDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { WorkspaceDialog, valueText } from '@/components/workspace/workspace-dialog';
import { useRemoveRow, useUpdateRow } from '@/components/workspace/use-workspace';

const Dash = () => <span className="text-muted-foreground">—</span>;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T/;
const NONE = '__none__';

// The first column stays put while the rest scrolls sideways.
const STICKY_HEAD = 'md:sticky md:left-0 md:z-10 bg-[color-mix(in_oklab,var(--muted)_40%,var(--card))] md:shadow-[inset_-1px_0_0_var(--border)]';
const STICKY_CELL = 'md:sticky md:left-0 md:z-10 bg-card group-hover/row:bg-[color-mix(in_oklab,var(--muted)_50%,var(--card))] md:shadow-[inset_-1px_0_0_var(--border)]';

// Status-like values get a colour so the table reads at a glance.
const TONES = [
  [/converted|booked|won|done|confirmed/i, 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'],
  [/not interested|lost|cancel|declined|closed/i, 'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-300'],
  [/await|pending|wait|open|follow/i, 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300'],
  [/delayed|urgent|reach out/i, 'border-orange-300 bg-orange-50 text-orange-800 dark:border-orange-700 dark:bg-orange-950 dark:text-orange-300'],
];
export const toneFor = (v) => TONES.find(([rx]) => rx.test(String(v || '')))?.[1] || 'border-border bg-muted/60 text-foreground';

// Expiry dates (registration, insurance, inspection…) are coloured by how close they are.
const isExpiry = (field) => /exp/i.test(field.key) || /exp/i.test(field.label);
function expiryClass(d) {
  const days = daysFromToday(d);
  if (days == null) return '';
  if (days < 0) return 'font-medium text-destructive';
  if (days <= 30) return 'font-medium text-amber-700 dark:text-amber-400';
  return '';
}

/** A cell's display: dates formatted, emails / phones linked, everything else as text. */
function Display({ field, value }) {
  if (value == null || value === '') return <Dash />;
  const s = String(value);
  if (field.type === 'date' && ISO_DATE.test(s)) {
    const cls = isExpiry(field) ? expiryClass(s) : '';
    const days = cls ? daysFromToday(s) : null;
    return (
      <span className={cn('whitespace-nowrap', cls)} suppressHydrationWarning title={days == null ? undefined : days < 0 ? `Expired ${-days} day${days === -1 ? '' : 's'} ago` : days === 0 ? 'Expires today' : `Expires in ${days} day${days === 1 ? '' : 's'}`}>
        {formatDate(s)}
      </span>
    );
  }
  if (field.type === 'number' && typeof value === 'number') return <span className="tabular-nums">{value.toLocaleString('en-US')}</span>;
  if (field.type === 'enum') return <span className={cn('inline-block max-w-full truncate rounded-full border px-2 py-0.5 text-xs font-medium', toneFor(s))}>{s}</span>;
  const email = s.match(/[^\s<>;,]+@[^\s<>;,]+/)?.[0];
  if (email) {
    return (
      <a href={`mailto:${email}`} className="block max-w-full truncate hover:underline" title={s}>
        {s}
      </a>
    );
  }
  if (/^[+(]?[\d\s().-]{7,}$/.test(s)) {
    return (
      <a href={`tel:${s.replace(/[^\d+]/g, '')}`} className="whitespace-nowrap hover:underline">
        {s}
      </a>
    );
  }
  return (
    <span className={cn('block max-w-full', field.type === 'long' ? 'line-clamp-2 whitespace-pre-line' : 'truncate')} title={s}>
      {s}
    </span>
  );
}

/**
 * A cell that edits in place: enums as a dropdown, dates as a date input, the rest as text.
 * Enter / blur saves, Esc cancels.
 */
function EditableCell({ workspace: ws, item, field, options }) {
  const update = useUpdateRow(ws.key);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const value = item.values?.[field.key];
  const current = valueText(value);
  const save = (next) => {
    setEditing(false);
    const v = String(next ?? '').trim();
    if (v === current) return;
    update.mutate({ id: item._id, data: { [field.key]: v } }, { onSuccess: () => toast.success('Saved') });
  };

  if (field.type === 'enum') {
    const choices = [...new Set([...(field.options || []), ...(options || []).map((o) => o.value).filter(Boolean), current].filter(Boolean))];
    return (
      <Select value={current || NONE} onValueChange={(v) => save(v === NONE ? '' : v)} disabled={update.isPending}>
        <SelectTrigger size="sm" className={cn('h-7 max-w-full gap-1 rounded-full border px-2 text-xs font-medium', current && toneFor(current))} aria-label={field.label}>
          <SelectValue placeholder="—" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>—</SelectItem>
          {choices.map((c) => (
            <SelectItem key={c} value={c}>
              {c}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !(field.type === 'long' && e.shiftKey)) {
      e.preventDefault();
      save(text);
    } else if (e.key === 'Escape') setEditing(false);
  };
  if (editing) {
    const isDate = field.type === 'date' && (!current || /^\d{4}-\d{2}-\d{2}$/.test(current));
    return field.type === 'long' ? (
      <textarea value={text} onChange={(e) => setText(e.target.value)} onBlur={() => save(text)} onKeyDown={onKeyDown} rows={3} autoFocus className="w-full min-w-64 rounded-md border bg-background px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50" aria-label={`Edit ${field.label}`} />
    ) : (
      <Input type={isDate ? 'date' : field.type === 'number' ? 'number' : 'text'} step={field.type === 'number' ? 'any' : undefined} value={text} onChange={(e) => setText(e.target.value)} onBlur={() => save(text)} onKeyDown={onKeyDown} autoFocus className="h-8 min-w-36" aria-label={`Edit ${field.label}`} />
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        setText(current);
        setEditing(true);
      }}
      disabled={update.isPending}
      title={current ? `${current}\n\nClick to edit` : 'Click to edit'}
      className="-mx-1 block max-w-full rounded-sm px-1 py-0.5 text-left text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <Display field={field} value={value} />
    </button>
  );
}

function RowActions({ workspace: ws, item, options, compact = false, tabs = [] }) {
  const [dialog, setDialog] = useState(null); // 'edit' | 'delete'
  const remove = useRemoveRow(ws.key);
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
      {dialog === 'edit' ? <WorkspaceDialog key={`${item._id}-${item.updatedAt}`} workspace={ws} item={item} options={options} tabs={tabs} open onOpenChange={(v) => !v && setDialog(null)} /> : null}
      <ConfirmDialog
        open={dialog === 'delete'}
        onOpenChange={(v) => !v && setDialog(null)}
        title={`Delete this ${ws.rowLabel}?`}
        description={item.tab ? `It is removed from the CRM only. While it stays in the "${item.tab}" tab of the sheet, the next sync brings it back.` : 'This row was added in the CRM and is not in the sheet; it is gone for good.'}
        confirmLabel="Delete"
        destructive
        pending={remove.isPending}
        onConfirm={() =>
          remove.mutate(item._id, {
            onSuccess: () => {
              toast.success('Deleted');
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
      <button type="button" onClick={() => onSort?.(column)} className={cn('-mx-1 inline-flex h-8 items-center gap-1 rounded-sm px-1 text-xs font-medium tracking-wide uppercase whitespace-nowrap outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50', active ? 'text-foreground' : 'text-muted-foreground')}>
        {label}
        <Icon className={cn('size-3.5', !active && 'opacity-50')} aria-hidden />
      </button>
    </TableHead>
  );
}

/** The table's columns: the key column first (frozen), then the fields in config order. */
function columnsOf(ws) {
  const visible = ws.fields.filter((f) => !f.hide);
  const first = visible.find((f) => f.key === ws.keyField) || visible[0];
  return [first, ...visible.filter((f) => f !== first)];
}

function Cell({ workspace: ws, field, item, options }) {
  if (field.inline) return <EditableCell workspace={ws} item={item} field={field} options={options} />;
  return <Display field={field} value={item.values?.[field.key]} />;
}

export function WorkspaceTable({ workspace: ws, items = [], loading = false, dimmed = false, sort, dir, onSort, filterValues = {}, showTab = false, tabs = [] }) {
  const [first, ...rest] = columnsOf(ws);
  const widthOf = (f) => f.width || (f.type === 'date' ? 'w-32' : f.type === 'enum' ? 'w-40' : f.type === 'long' ? 'w-80' : 'w-44');
  return (
    <div className={cn('relative overflow-x-auto rounded-lg border bg-card transition-opacity duration-200', dimmed && 'opacity-60')} aria-busy={loading || dimmed || undefined}>
      <Table className="w-max min-w-full">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {first.sort ? <SortableHead label={first.label} column={first.key} sort={sort} dir={dir} onSort={onSort} className={cn(STICKY_HEAD, 'min-w-36')} /> : <TableHead className={cn(STICKY_HEAD, 'min-w-36')}>{first.label}</TableHead>}
            {rest.map((f) => (f.sort ? <SortableHead key={f.key} label={f.label} column={f.key} sort={sort} dir={dir} onSort={onSort} /> : <TableHead key={f.key} className="whitespace-nowrap">{f.label}</TableHead>))}
            {showTab ? <TableHead>Tab</TableHead> : null}
            <TableHead className="w-24 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading
            ? Array.from({ length: 8 }, (_, i) => (
                <TableRow key={i} className="group/row">
                  <TableCell className={STICKY_CELL}>
                    <Skeleton className="h-4 w-28" />
                  </TableCell>
                  {rest.map((f) => (
                    <TableCell key={f.key}>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                  ))}
                  {showTab ? <TableCell /> : null}
                  <TableCell>
                    <Skeleton className="ml-auto h-8 w-16" />
                  </TableCell>
                </TableRow>
              ))
            : items.map((item) => (
                <TableRow key={item._id} className="group/row">
                  <TableCell className={cn(STICKY_CELL, 'min-w-36 font-medium')}>
                    <div className="flex items-center gap-1.5">
                      <div className={cn('min-w-0', widthOf(first))}>
                        <Cell workspace={ws} field={first} item={item} options={filterValues[first.key]} />
                      </div>
                      <MissingBadge item={item} />
                    </div>
                  </TableCell>
                  {rest.map((f) => (
                    <TableCell key={f.key} className="align-top">
                      <div className={cn('min-w-0', widthOf(f))}>
                        <Cell workspace={ws} field={f} item={item} options={filterValues[f.key]} />
                      </div>
                    </TableCell>
                  ))}
                  {showTab ? <TableCell className="text-sm text-muted-foreground">{item.tab || 'CRM'}</TableCell> : null}
                  <TableCell className="text-right align-top">
                    <RowActions workspace={ws} item={item} options={filterValues} tabs={tabs} />
                  </TableCell>
                </TableRow>
              ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** Phone layout: one card per row with the first few fields and the status-like ones. */
export function WorkspaceCards({ workspace: ws, items = [], loading = false, dimmed = false, filterValues = {}, tabs = [] }) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-3" aria-busy>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-40 w-full rounded-lg" />
        ))}
      </div>
    );
  }
  const [first, ...rest] = columnsOf(ws);
  const nameField = rest.find((f) => /name/i.test(f.key)) || rest[0];
  const body = rest.filter((f) => f !== nameField && !f.hide);
  return (
    <ul className={cn('grid grid-cols-1 gap-3', dimmed && 'opacity-60')}>
      {items.map((item) => (
        <li key={item._id} className="grid min-w-0 gap-2.5 rounded-lg border bg-card p-3">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold">{valueText(item.values?.[nameField?.key]) || valueText(item.values?.[first.key]) || `(no ${first.label.toLowerCase()})`}</p>
              <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                {nameField ? valueText(item.values?.[first.key]) : null}
                <MissingBadge item={item} />
              </p>
            </div>
            <RowActions workspace={ws} item={item} options={filterValues} compact tabs={tabs} />
          </div>
          <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-2 gap-y-1 text-sm">
            {body.map((f) => {
              const v = item.values?.[f.key];
              if ((v == null || v === '') && !f.inline) return null;
              return (
                <div key={f.key} className="contents">
                  <dt className="truncate text-muted-foreground">{f.label}</dt>
                  <dd className="min-w-0">
                    <Cell workspace={ws} field={f} item={item} options={filterValues[f.key]} />
                  </dd>
                </div>
              );
            })}
          </dl>
        </li>
      ))}
    </ul>
  );
}
