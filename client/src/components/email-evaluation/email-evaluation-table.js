'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, ChevronsUpDown, MoreHorizontal, Pencil, Send, Trash2, TriangleAlert, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatDate, isoDate } from '@/lib/format';
import { zonedDateIso } from '@/lib/tz';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmailEvaluationDialog } from '@/components/email-evaluation/email-evaluation-dialog';
import { useLogSend, useRemoveRow, useUndoSend, useUpdateRow } from '@/components/email-evaluation/use-email-evaluation';

const Dash = () => <span className="text-muted-foreground">—</span>;

// The sheet's columns (minus the second STATUS): phone and email first, then the mailbox it was sent from
// (the sheet's SECONDARY EMAIL), and the follow-up sends at the end. Row below follows this order.
const COLUMNS = [
  { key: 'date', label: 'Date', sort: 'date' },
  { key: 'evaluatedFor', label: 'Evaluated for', sort: 'evaluatedFor' },
  { key: 'clientName', label: 'Client name', sort: 'clientName' },
  { key: 'company', label: 'Company', sort: 'company' },
  { key: 'status', label: 'Status', sort: 'status' },
  { key: 'phone', label: 'Phone no' },
  { key: 'primaryEmail', label: 'Email', sort: 'primaryEmail' },
  { key: 'secondaryEmail', label: 'Sent email' },
  { key: 'notes', label: 'Notes' },
  { key: 'followUp', label: 'Follow up' },
  { key: 'followUpDate', label: 'Date of follow up', sort: 'followUpDate' },
  { key: 'tab', label: 'Tab', sort: 'tab' },
  { key: 'nextFollowUpAt', label: 'Follow-ups', sort: 'nextFollowUpAt' },
];

// The first column stays put while the rest scrolls sideways.
// The header row stays put while the rows scroll: the table box scrolls inside (up to the window's height)
// and the header sticks to its top.
const FREEZE_BOX = 'md:max-h-[calc(100dvh-7rem)]';
const FREEZE_HEAD = 'sticky top-0 z-20 bg-card shadow-[inset_0_-1px_0_var(--border)]';

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

const MAX_SENDS = 5;
const CHANNEL_LABELS = { email: 'Email', text: 'Text', whatsapp: 'WhatsApp', call: 'Call' };
// Same rule as the API (services/emailEvaluation.js): Reservations tabs are not followed up, sheet tabs by email only.
const channelsFor = (tab) => (/reservation/i.test(tab || '') ? [] : tab ? ['email'] : Object.keys(CHANNEL_LABELS));

/** "Sent 3/5 · 2 Oct" + when the next send is due (10 working days on), and a menu to log the next send on a date (today by default). */
function FollowUpCell({ item }) {
  const log = useLogSend();
  const undo = useUndoSend();
  const [date, setDate] = useState('');
  const channels = channelsFor(item.tab);
  if (!channels.length) return <Dash />;
  const n = item.sentCount || 0;
  const today = zonedDateIso();
  const on = date || today;
  const onLabel = on === today ? 'today' : formatDate(on);
  const due = item.nextFollowUpAt && isoDate(item.nextFollowUpAt) <= today;
  const lastCrm = item.sends?.length ? item.sends[item.sends.length - 1] : null;
  return (
    <div className="flex items-center gap-2">
      <div className="min-w-0 text-sm leading-tight" suppressHydrationWarning>
        <p className="whitespace-nowrap">
          {n ? `Sent ${n}/${MAX_SENDS}` : 'Not sent'}
          {item.lastSentAt ? <span className="text-muted-foreground"> · {formatDate(item.lastSentAt)}</span> : null}
        </p>
        {item.nextFollowUpAt ? (
          <p className={cn('whitespace-nowrap text-xs', due ? 'font-medium text-destructive' : 'text-muted-foreground')}>
            {due ? 'Due' : 'Next'} {formatDate(item.nextFollowUpAt)}
          </p>
        ) : n ? (
          <p className="text-xs text-muted-foreground">{n >= MAX_SENDS ? 'all sent' : 'stopped (booked)'}</p>
        ) : null}
      </div>
      <DropdownMenu onOpenChange={(open) => open && setDate('')}>
        <DropdownMenuTrigger asChild>
          <Button size="icon-sm" variant={due ? 'default' : 'outline'} disabled={log.isPending || undo.isPending} aria-label="Log a follow-up send">
            <Send />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          {n < MAX_SENDS ? (
            <>
              <label className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
                Sent on
                {/* keys stay in the input (the menu would take them for type-ahead) */}
                <Input type="date" value={on} max={today} onChange={(e) => setDate(e.target.value)} onKeyDown={(e) => e.stopPropagation()} className="h-8 flex-1" aria-label="Date sent" />
              </label>
              <DropdownMenuSeparator />
              {channels.map((ch) => (
                <DropdownMenuItem key={ch} onSelect={() => log.mutate({ id: item._id, channel: ch, date: on }, { onSuccess: () => toast.success(`Sent ${n + 1} logged (${CHANNEL_LABELS[ch]}, ${onLabel})${n + 1 < MAX_SENDS ? ' - next one due 10 working days later' : ''}`) })}>
                  <Send /> Sent {n + 1} by {CHANNEL_LABELS[ch]}, {onLabel}
                </DropdownMenuItem>
              ))}
            </>
          ) : (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">All {MAX_SENDS} sends are done</p>
          )}
          {lastCrm ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => undo.mutate(item._id, { onSuccess: () => toast.success(`Sent ${lastCrm.n} taken back`) })}>
                <Undo2 /> Undo Sent {lastCrm.n} ({formatDate(lastCrm.date)})
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// The sheet's SECONDARY EMAIL column says which of our inboxes the email went from (H, R, ...).
const MAILBOXES = [
  { value: 'H', label: 'Harry' },
  { value: 'I', label: 'Info' },
  { value: 'R', label: 'Reservations' },
  { value: 'A', label: 'Advisors' },
];
const NO_MAILBOX = '__none__';

/** A mailbox dropdown; a cell that holds a real address (or other text) stays as it is. */
function MailboxCell({ item }) {
  const update = useUpdateRow();
  const value = (item.secondaryEmail || '').toUpperCase();
  if (value && !MAILBOXES.some((m) => m.value === value)) return <EmailLink value={item.secondaryEmail} className="max-w-48" />;
  return (
    <Select value={value || NO_MAILBOX} onValueChange={(v) => update.mutate({ id: item._id, data: { secondaryEmail: v === NO_MAILBOX ? '' : v } }, { onSuccess: () => toast.success('Saved') })} disabled={update.isPending}>
      <SelectTrigger size="sm" className={cn('w-36', !value && 'text-muted-foreground')} aria-label="Sent from mailbox">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_MAILBOX}>—</SelectItem>
        {MAILBOXES.map((m) => (
          <SelectItem key={m.value} value={m.value}>
            {m.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
        <EditableCell item={c} field="company" className="max-w-56" />
      </TableCell>
      <TableCell>
        <EditableCell item={c} field="status" className="max-w-56" />
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
        <EmailLink value={c.primaryEmail} className="max-w-64" />
      </TableCell>
      <TableCell>
        <MailboxCell item={c} />
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
      <TableCell>
        <FollowUpCell item={c} />
      </TableCell>
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
      <Table className="min-w-[2100px]" containerClassName={FREEZE_BOX}>
        <TableHeader className={FREEZE_HEAD}>
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
          {c.primaryEmail || c.secondaryEmail?.includes('@') || c.phone ? (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {c.phone ? (
                <a href={telHref(c.phone)} className="text-primary">
                  {c.phone}
                </a>
              ) : null}
              {c.primaryEmail ? <EmailLink value={c.primaryEmail} className="min-w-0 text-primary" /> : null}
              {c.secondaryEmail?.includes('@') ? <EmailLink value={c.secondaryEmail} className="min-w-0 text-primary" /> : null}
            </div>
          ) : null}
          <dl className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-2 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Company</dt>
            <dd>
              <EditableCell item={c} field="company" />
            </dd>
            <dt className="text-muted-foreground">Status</dt>
            <dd>
              <EditableCell item={c} field="status" />
            </dd>
            <dt className="text-muted-foreground">Sent email</dt>
            <dd>
              <MailboxCell item={c} />
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
            <dt className="text-muted-foreground">Follow-ups</dt>
            <dd>
              <FollowUpCell item={c} />
            </dd>
          </dl>
        </li>
      ))}
    </ul>
  );
}
