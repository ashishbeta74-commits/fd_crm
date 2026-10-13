'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, ChevronsUpDown, Columns3, MoreHorizontal, Pencil, Trash2, TriangleAlert, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { daysFromToday, formatDate, pluralize } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { WorkspaceDialog, valueText } from '@/components/workspace/workspace-dialog';
import { useRemoveRow, useRemoveRows, useUpdateRow } from '@/components/workspace/use-workspace';
import { useSelection } from '@/components/contacts/list/use-selection';

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

function RowActions({ workspace: ws, item, options, compact = false, tabs = [], start = false }) {
  const [dialog, setDialog] = useState(null); // 'edit' | 'delete'
  const remove = useRemoveRow(ws.key);
  return (
    <>
      <div className={cn('flex items-center gap-1', start ? 'justify-start' : 'justify-end')}>
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
        {start ? (
          // actions-first pages: a plain Delete button instead of the "more" menu
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="icon-sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDialog('delete')} aria-label="Delete row">
                <Trash2 />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete from the CRM</TooltipContent>
          </Tooltip>
        ) : (
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
        )}
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

function SortableHead({ label, column, sort, dir, onSort, className, style, children, ...rest }) {
  const active = sort === column;
  const Icon = !active ? ChevronsUpDown : dir === 'asc' ? ChevronUp : ChevronDown;
  return (
    <TableHead {...rest} aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={className} style={style}>
      <button type="button" onClick={() => onSort?.(column)} className={cn('-mx-1 inline-flex h-8 items-center gap-1 rounded-sm px-1 text-xs font-medium tracking-wide uppercase whitespace-nowrap outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50', active ? 'text-foreground' : 'text-muted-foreground')}>
        {label}
        <Icon className={cn('size-3.5', !active && 'opacity-50')} aria-hidden />
      </button>
      {children}
    </TableHead>
  );
}

// Pseudo-columns next to the fields: the row's edit / delete buttons and its sheet tab.
const ACTIONS = '__actions';
const TAB = '__tab';

/**
 * The columns a person arranged on a `resizable` workspace - order (drag a header), hidden ones (the Columns
 * menu) and widths (drag a header's edge) - remembered in this browser per page. Other workspaces get the
 * default layout and no controls.
 */
function useColumnLayout(key, enabled) {
  const storageKey = `crm:layout:${key}`;
  const [layout, setLayout] = useState({ order: [], hidden: [], widths: {} });
  useEffect(() => {
    if (!enabled) return;
    try {
      setLayout({ order: [], hidden: [], widths: {}, ...JSON.parse(localStorage.getItem(storageKey) || '{}') });
    } catch {
      /* private mode: default layout */
    }
  }, [storageKey, enabled]);
  const update = useCallback(
    (fn) =>
      setLayout((prev) => {
        const next = fn(prev);
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          /* not remembered */
        }
        return next;
      }),
    [storageKey],
  );
  return [enabled ? layout : { order: [], hidden: [], widths: {} }, update];
}

/** Drag a header's right edge to resize its column; double-click it to go back to the default width. */
function ResizeHandle({ column, onResize }) {
  // the drag swallows the browser's dblclick, so a second press within 400 ms is the reset
  const lastPress = useRef(0);
  const start = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const now = Date.now();
    if (now - lastPress.current < 400) {
      lastPress.current = 0;
      onResize(column, null);
      return;
    }
    lastPress.current = now;
    const startX = e.clientX;
    const startW = e.currentTarget.parentElement.getBoundingClientRect().width;
    // while resizing, the header must not start a column drag (see dragProps)
    document.body.dataset.colResize = '1';
    const move = (ev) => onResize(column, Math.max(56, Math.round(startW + ev.clientX - startX)));
    const up = () => {
      delete document.body.dataset.colResize;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize column (double-click to reset)"
      title="Drag to resize · double-click to reset"
      draggable={false}
      onPointerDown={start}
      onClick={(e) => e.stopPropagation()}
      className="group/resize absolute top-0 right-0 z-20 flex h-full w-2 cursor-col-resize touch-none justify-center select-none"
    >
      {/* always-visible divider; turns the primary colour under the pointer */}
      <span className="my-2 w-0.5 rounded-full bg-muted-foreground/35 transition-colors group-hover/resize:bg-primary" aria-hidden />
    </span>
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

export function WorkspaceTable({ workspace: ws, items = [], loading = false, dimmed = false, sort, dir, onSort, filterValues = {}, showTab = false, tabs = [], selectionScope = null }) {
  const custom = Boolean(ws.resizable);
  // ticked rows (bulk delete), kept here so a tick re-renders the table only; `selectionScope` (the filters) clears them
  const ticks = useSelection(selectionScope ?? '');
  const selection = selectionScope == null ? null : ticks;
  const [layout, update] = useColumnLayout(ws.key, custom);
  const [drag, setDrag] = useState({ id: null, over: null });
  const fieldsByKey = Object.fromEntries(ws.fields.map((f) => [f.key, f]));
  // `actionsFirst` workspaces show the edit / delete buttons as the first column instead of the last
  const front = Boolean(ws.actionsFirst);
  const defaults = [...(front ? [ACTIONS] : []), ...columnsOf(ws).map((f) => f.key), ...(showTab ? [TAB] : []), ...(front ? [] : [ACTIONS])];
  // the saved order (columns that still exist), then any column it does not know yet
  const saved = layout.order.filter((id) => defaults.includes(id));
  const order = [...saved, ...defaults.filter((id) => !saved.includes(id))];
  let columns = order.filter((id) => !layout.hidden.includes(id));
  if (!columns.length) columns = order;
  // the first field column stays put while the rest scrolls sideways
  const stickyId = columns.find((id) => fieldsByKey[id]);
  const labelOf = (id) => (id === ACTIONS ? 'Actions' : id === TAB ? ws.tabLabel || 'Tab' : fieldsByKey[id]?.label || id);
  const widths = layout.widths;

  const setWidth = (id, width) =>
    update((l) => {
      const next = { ...l.widths };
      if (width == null) delete next[id];
      else next[id] = width;
      return { ...l, widths: next };
    });
  const moveColumn = (id, target) =>
    update((l) => {
      const all = [...order];
      const from = all.indexOf(id);
      const to = all.indexOf(target);
      if (from < 0 || to < 0) return l;
      all.splice(from, 1);
      all.splice(to, 0, id);
      return { ...l, order: all };
    });
  const toggleColumn = (id) => update((l) => ({ ...l, hidden: l.hidden.includes(id) ? l.hidden.filter((h) => h !== id) : [...l.hidden, id] }));
  const resetLayout = () => update(() => ({ order: [], hidden: [], widths: {} }));

  // a dragged width wins over the field's default width class
  const widthOf = (f) => (widths[f.key] ? 'w-full' : f.width || (f.type === 'date' ? 'w-32' : f.type === 'enum' ? 'w-40' : f.type === 'long' ? 'w-80' : 'w-44'));
  const colStyle = (id) => (widths[id] ? { width: widths[id], minWidth: widths[id], maxWidth: widths[id] } : undefined);
  const dragProps = (id) =>
    custom
      ? {
          draggable: true,
          onDragStart: (e) => {
            if (document.body.dataset.colResize) return e.preventDefault();
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', id);
            setDrag({ id, over: null });
          },
          onDragOver: (e) => {
            if (!drag.id || drag.id === id) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (drag.over !== id) setDrag((d) => ({ ...d, over: id }));
          },
          onDrop: (e) => {
            e.preventDefault();
            if (drag.id && drag.id !== id) moveColumn(drag.id, id);
            setDrag({ id: null, over: null });
          },
          onDragEnd: () => setDrag({ id: null, over: null }),
        }
      : {};

  const head = (id) => {
    const f = fieldsByKey[id];
    const className = cn(
      'relative',
      id === stickyId && STICKY_HEAD,
      id === stickyId && !widths[id] && 'min-w-36',
      id === ACTIONS && 'w-24',
      id === ACTIONS && !front && 'text-right',
      widths[id] && 'overflow-hidden',
      custom && 'cursor-grab active:cursor-grabbing',
      drag.id === id && 'opacity-50',
      drag.over === id && 'shadow-[inset_2px_0_0_var(--primary)]',
    );
    const handle = custom ? <ResizeHandle column={id} onResize={setWidth} /> : null;
    const props = { className, style: colStyle(id), ...dragProps(id) };
    if (f?.sort) {
      return (
        <SortableHead key={id} {...props} label={f.label} column={f.key} sort={sort} dir={dir} onSort={onSort}>
          {handle}
        </SortableHead>
      );
    }
    return (
      <TableHead key={id} {...props} className={cn('whitespace-nowrap', className)}>
        {labelOf(id)}
        {handle}
      </TableHead>
    );
  };

  const skeletonCell = (id) => (
    <TableCell key={id} className={id === stickyId ? STICKY_CELL : undefined} style={colStyle(id)}>
      <Skeleton className={cn('h-4', id === ACTIONS ? 'h-8 w-16' : id === stickyId ? 'w-28' : 'w-20', id === ACTIONS && !front && 'ml-auto')} />
    </TableCell>
  );

  const bodyCell = (id, item) => {
    const style = colStyle(id);
    const clip = widths[id] && 'overflow-hidden';
    if (id === ACTIONS) {
      return (
        <TableCell key={id} className={cn('align-top', !front && 'text-right', clip)} style={style}>
          <RowActions workspace={ws} item={item} options={filterValues} tabs={tabs} start={front} />
        </TableCell>
      );
    }
    if (id === TAB) {
      return (
        <TableCell key={id} className={cn('text-sm text-muted-foreground', clip)} style={style}>
          {item.tab || 'CRM'}
        </TableCell>
      );
    }
    const f = fieldsByKey[id];
    if (id === stickyId) {
      return (
        <TableCell key={id} className={cn(STICKY_CELL, !widths[id] && 'min-w-36', 'font-medium', clip)} style={style}>
          <div className="flex items-center gap-1.5">
            <div className={cn('min-w-0', widthOf(f))}>
              <Cell workspace={ws} field={f} item={item} options={filterValues[f.key]} />
            </div>
            <MissingBadge item={item} />
          </div>
        </TableCell>
      );
    }
    return (
      <TableCell key={id} className={cn('align-top', clip)} style={style}>
        <div className={cn('min-w-0', widthOf(f))}>
          <Cell workspace={ws} field={f} item={item} options={filterValues[f.key]} />
        </div>
      </TableCell>
    );
  };

  // Ticking a row re-renders the table; reusing the cells (they change with the rows and the layout, not
  // the ticks) keeps that instant instead of re-rendering every cell's dropdowns.
  const tabsKey = tabs.join('|');
  const columnsKey = columns.join('|');
  const cells = useMemo(
    () => new Map(items.map((item) => [item._id, columns.map((id) => bodyCell(id, item))])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, columnsKey, widths, filterValues, tabsKey, ws, front, stickyId],
  );
  const pageIds = items.map((item) => item._id);
  const onPage = selection ? pageIds.filter((id) => selection.selected.has(id)).length : 0;
  const pageChecked = onPage === 0 ? false : onPage === pageIds.length ? true : 'indeterminate';

  const table = (
    <div className={cn('relative overflow-x-auto rounded-lg border bg-card transition-opacity duration-200', dimmed && 'opacity-60')} aria-busy={loading || dimmed || undefined}>
      <Table className="w-max min-w-full">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {selection ? (
              <TableHead className="w-10">
                {/* Radix Checkbox lets incoming props override its data-state, so the tooltip trigger is a wrapper */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex translate-y-[2px]">
                      <Checkbox checked={pageChecked} onCheckedChange={(v) => selection.toggleMany(pageIds, v === true)} disabled={loading || !pageIds.length} aria-label="Select all on this page" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Select all on this page</TooltipContent>
                </Tooltip>
              </TableHead>
            ) : null}
            {columns.map(head)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading
            ? Array.from({ length: 8 }, (_, i) => (
                <TableRow key={i} className="group/row">
                  {selection ? <TableCell /> : null}
                  {columns.map(skeletonCell)}
                </TableRow>
              ))
            : items.map((item) => (
                <TableRow key={item._id} data-state={selection?.selected.has(item._id) ? 'selected' : undefined} className="group/row">
                  {selection ? (
                    <TableCell className="align-top">
                      <Checkbox checked={selection.selected.has(item._id)} onCheckedChange={(v) => selection.toggle(item._id, v === true)} className="mt-1.5" aria-label={`Select this ${ws.rowLabel}`} />
                    </TableCell>
                  ) : null}
                  {cells.get(item._id)}
                </TableRow>
              ))}
        </TableBody>
      </Table>
    </div>
  );
  if (!custom) return table;

  const changed = layout.order.length || layout.hidden.length || Object.keys(widths).length;
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
        {selection?.ids.length ? <SelectionBar workspace={ws} selection={selection} /> : null}
        <p className="text-xs text-muted-foreground">Drag a header to move a column, its edge to resize it.</p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Columns3 /> Columns{order.length > columns.length ? ` (${order.length - columns.length} hidden)` : ''}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-96 w-60 overflow-y-auto">
            <DropdownMenuLabel>Show columns</DropdownMenuLabel>
            {order
              .filter((id) => id !== ACTIONS)
              .map((id) => (
                <DropdownMenuCheckboxItem key={id} checked={!layout.hidden.includes(id)} onCheckedChange={() => toggleColumn(id)} onSelect={(e) => e.preventDefault()}>
                  {labelOf(id)}
                </DropdownMenuCheckboxItem>
              ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={!changed} onSelect={resetLayout}>
              <RotateCcw /> Reset layout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {table}
    </div>
  );
}

/** "3 selected · Delete · Clear" over the table while rows are ticked. */
function SelectionBar({ workspace: ws, selection }) {
  const [confirm, setConfirm] = useState(false);
  const removeMany = useRemoveRows(ws.key);
  const n = selection.ids.length;
  return (
    <div className="mr-auto flex items-center gap-2 rounded-md border bg-accent px-2 py-1 text-sm text-accent-foreground">
      <span className="font-medium">{n} selected</span>
      <Button size="sm" variant="destructive" onClick={() => setConfirm(true)}>
        <Trash2 /> Delete
      </Button>
      <Button size="sm" variant="ghost" onClick={selection.clear}>
        Clear
      </Button>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Delete ${pluralize(n, ws.rowLabel)}?`}
        description={ws.hasSheet === false ? 'They are removed from the CRM for good.' : 'They are removed from the CRM only. Rows still in the linked sheet come back on the next sync.'}
        confirmLabel="Delete"
        destructive
        pending={removeMany.isPending}
        onConfirm={() =>
          removeMany.mutate(selection.ids, {
            onSuccess: (r) => {
              toast.success(`Deleted ${pluralize(r.deleted, ws.rowLabel)}`);
              selection.clear();
              setConfirm(false);
            },
          })
        }
      />
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

const money = (n) => `$${Math.round(n || 0).toLocaleString('en-US')}`;

/**
 * "Merge duplicates": one row per group (a passenger) with its row count, value total and first / last date.
 * Sorts by count / value / first / last; clicking a row opens that group's rows.
 */
export function WorkspaceGroupTable({ workspace: ws, items = [], loading = false, dimmed = false, sort, dir, onSort, onOpen }) {
  const show = ws.groupBy.show.map((k) => ws.fields.find((f) => f.key === k)).filter(Boolean);
  const [first, ...rest] = show;
  const value = ws.fields.find((f) => f.key === ws.valueField);
  const stats = [
    { key: 'count', label: `${ws.rowLabel[0].toUpperCase()}${ws.rowLabel.slice(1)}s`, render: (g) => g.count.toLocaleString('en-US') },
    ...(value ? [{ key: 'value', label: value.label, render: (g) => money(g.value) }] : []),
    { key: 'first', label: 'First', render: (g) => (g.first ? formatDate(g.first) : <Dash />) },
    { key: 'last', label: 'Last', render: (g) => (g.last ? formatDate(g.last) : <Dash />) },
  ];
  return (
    <div className={cn('relative overflow-x-auto rounded-lg border bg-card transition-opacity duration-200', dimmed && 'opacity-60')} aria-busy={loading || dimmed || undefined}>
      <Table className="w-max min-w-full">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className={cn(STICKY_HEAD, 'min-w-48')}>{first.label}</TableHead>
            {rest.map((f) => (
              <TableHead key={f.key} className="whitespace-nowrap">
                {f.label}
              </TableHead>
            ))}
            {stats.map((s) => (
              <SortableHead key={s.key} label={s.label} column={s.key} sort={sort} dir={dir} onSort={onSort} />
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading
            ? Array.from({ length: 8 }, (_, i) => (
                <TableRow key={i} className="group/row">
                  {[first, ...rest, ...stats].map((c) => (
                    <TableCell key={c.key} className={c === first ? STICKY_CELL : undefined}>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            : items.map((g) => (
                <TableRow key={g.key} className="group/row cursor-pointer" onClick={() => onOpen(g)}>
                  <TableCell className={cn(STICKY_CELL, 'min-w-48 font-medium')}>
                    <button type="button" className="text-left hover:underline" onClick={(e) => (e.stopPropagation(), onOpen(g))}>
                      {g.values?.[first.key] || g.key || 'Unknown'}
                    </button>
                  </TableCell>
                  {rest.map((f) => (
                    <TableCell key={f.key} className="max-w-64 truncate text-sm">
                      {g.values?.[f.key] || <Dash />}
                    </TableCell>
                  ))}
                  {stats.map((s) => (
                    <TableCell key={s.key} className="text-sm tabular-nums">
                      {s.render(g)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
        </TableBody>
      </Table>
    </div>
  );
}
