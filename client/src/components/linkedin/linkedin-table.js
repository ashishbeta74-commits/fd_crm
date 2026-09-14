'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp, ChevronsUpDown, ExternalLink, ListChecks, MoreHorizontal, Pencil, StickyNote, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatDate, relativeDay, timeAgo } from '@/lib/format';
import { LI_STATUSES, LI_STATUS_MAP, LI_STEPS, actionFlag, liConnectionLabel, liStage, liStageLabel, liStageStyle, liStatus, loggedSteps, money, nextStepFor, removeStepInput } from '@/lib/linkedin';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PriorityBadge } from '@/components/badges';
import { LinkedInIconLink, linkedInHref } from '@/components/contacts/list/linkedin-link';
import { FROZEN_TABLE_CLASS, FrozenResizeHandle, frozenCell, frozenHead, useFrozenColumns } from '@/components/ui/frozen-columns';
import { NoteDialog } from '@/components/contacts/log-call-dialog';
import { LinkedinDialog } from '@/components/linkedin/linkedin-dialog';
import { StepDialog } from '@/components/linkedin/step-dialog';
import { useUpdateLinkedin } from '@/components/linkedin/use-linkedin';

const EMPTY_SET = new Set();
const Dash = () => <span className="text-muted-foreground">—</span>;

/** Stage pill coloured by its group. */
export function LinkedinStageBadge({ stage, className, size = 'sm' }) {
  const style = liStageStyle(stage);
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border font-medium whitespace-nowrap', size === 'xs' ? 'px-1.5 py-px text-[11px]' : 'px-2 py-0.5 text-xs', style.badge, className)}>
      <span className={cn('size-1.5 rounded-full', style.dot)} aria-hidden="true" />
      {liStageLabel(stage)}
    </span>
  );
}

/** Inline work-status picker (Not started / In progress / Waiting / Done); saves straight away. */
export function LinkedinStatusSelect({ contact, className, size = 'sm' }) {
  const update = useUpdateLinkedin();
  const value = liStatus(contact);
  const def = LI_STATUS_MAP[value] || LI_STATUSES[0];
  return (
    <Select value={value} onValueChange={(status) => update.mutate({ id: contact._id, data: { status } })} disabled={update.isPending}>
      <SelectTrigger size={size} className={cn('h-8 gap-1.5', def.badge, className)} aria-label="Status">
        <span className={cn('size-2 shrink-0 rounded-full', def.dot)} aria-hidden="true" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {LI_STATUSES.map((s) => (
          <SelectItem key={s.key} value={s.key}>
            <span className={cn('size-2 shrink-0 rounded-full', s.dot)} aria-hidden="true" />
            {s.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const FLAG_CLASS = { overdue: 'font-medium text-destructive', week: 'text-amber-700 dark:text-amber-400', none: 'text-muted-foreground', later: 'text-muted-foreground' };

/** "Next action" cell: the action, when it is due and the overdue / soon colouring. */
export function NextActionCell({ contact }) {
  const li = contact.linkedin || {};
  const flag = actionFlag(contact);
  if (!li.nextAction && !li.nextActionDate) return <span className="text-xs text-muted-foreground">{flag === 'none' ? 'No next action' : '—'}</span>;
  return (
    <div className="min-w-0">
      <div className="truncate text-sm" title={li.nextAction || undefined}>
        {li.nextAction || 'Next action'}
      </div>
      {li.nextActionDate ? (
        <div className={cn('text-xs', FLAG_CLASS[flag] || 'text-muted-foreground')} suppressHydrationWarning>
          {formatDate(li.nextActionDate)} · {relativeDay(li.nextActionDate)}
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">no date</div>
      )}
    </div>
  );
}

/**
 * Per-prospect actions: "Log step" (the playbook's next step first, then any other), edit all
 * LinkedIn fields, add a note, open the profile / contact.
 */
export function LinkedinActions({ contact, compact = false, showMenu = true, iconMenu = false }) {
  const [dialog, setDialog] = useState(null); // { kind: 'step', step } | { kind: 'edit' } | { kind: 'note' }
  const update = useUpdateLinkedin();
  const next = nextStepFor(contact);
  const li = contact.linkedin || {};
  const profile = linkedInHref(contact.contactL1);
  const logged = loggedSteps(contact);
  // Un-log a step (e.g. a follow logged by mistake): clears its date, so the stage and the counters drop back.
  const removeStep = (step) =>
    update.mutate(
      { id: contact._id, data: removeStepInput(contact, step) },
      { onSuccess: (doc) => toast.success(`Removed "${step.label}" - now ${liStageLabel(doc.linkedin?.stage)}`) },
    );
  return (
    <>
      <div className={cn('flex items-center gap-1', iconMenu ? 'flex-nowrap justify-end' : 'flex-wrap')}>
        {next && !compact ? (
          <Button size="sm" variant={iconMenu ? 'secondary' : 'default'} onClick={() => setDialog({ kind: 'step', step: next.key })} title={`Log the next playbook step: ${next.label}`}>
            <ListChecks /> {next.label}
          </Button>
        ) : null}
        {!showMenu ? null : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size={compact || iconMenu ? 'icon-sm' : 'sm'} variant="outline" aria-label="More LinkedIn actions" title="More actions">
              {compact || iconMenu ? <MoreHorizontal /> : <><ChevronDown /> More</>}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel>Log a step</DropdownMenuLabel>
            {LI_STEPS.map((s) => (
              <DropdownMenuItem key={s.key} onSelect={() => setDialog({ kind: 'step', step: s.key })} className={cn(next?.key === s.key && 'font-medium')}>
                {s.label}
                {next?.key === s.key ? <span className="ml-auto text-[10px] text-muted-foreground uppercase">next</span> : null}
              </DropdownMenuItem>
            ))}
            {logged.length ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Undo2 /> Remove a logged step
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-56">
                    <DropdownMenuLabel>Logged - click to remove</DropdownMenuLabel>
                    {logged.map((s) => (
                      <DropdownMenuItem key={s.key} onSelect={() => removeStep(s)} disabled={update.isPending}>
                        {s.label}
                        <span className="ml-auto text-[10px] text-muted-foreground" suppressHydrationWarning>
                          {formatDate(li[s.field])}
                        </span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </>
            ) : null}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setDialog({ kind: 'edit' })}>
              <Pencil /> Edit LinkedIn details
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setDialog({ kind: 'note' })}>
              <StickyNote /> Add note
            </DropdownMenuItem>
            {profile ? (
              <DropdownMenuItem asChild>
                <a href={profile} target="_blank" rel="noreferrer">
                  <ExternalLink /> Open LinkedIn profile
                </a>
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem asChild>
              <Link href={`/contacts/${contact._id}`}>
                <ExternalLink /> Open contact
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        )}
      </div>
      {dialog?.kind === 'step' ? <StepDialog key={`${contact._id}-${dialog.step}-${li.stage}`} contact={contact} step={dialog.step} open onOpenChange={(v) => !v && setDialog(null)} /> : null}
      {dialog?.kind === 'edit' ? <LinkedinDialog key={`${contact._id}-edit`} contact={contact} open onOpenChange={(v) => !v && setDialog(null)} /> : null}
      {dialog?.kind === 'note' ? <NoteDialog key={`${contact._id}-note`} contact={contact} open onOpenChange={(v) => !v && setDialog(null)} /> : null}
    </>
  );
}

const COLUMNS = [
  { key: 'name', label: 'Name', sort: 'name' },
  { key: 'title', label: 'Title' },
  { key: 'company', label: 'Company', sort: 'companyName' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'website', label: 'Website' },
  { key: 'stage', label: 'Stage', sort: 'stage' },
  { key: 'connection', label: 'Connection' },
  { key: 'next', label: 'Next action', sort: 'nextActionDate' },
  { key: 'lastTouch', label: 'Last touch', sort: 'lastTouchAt' },
  { key: 'need', label: 'Need' },
  { key: 'value', label: 'Value / mo', sort: 'monthlyValue' },
  { key: 'priority', label: 'Priority', sort: 'priority' },
];

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

function ProspectRow({ contact: c, selected, onToggle }) {
  const li = c.linkedin || {};
  const email = c.email || c.primaryEmail;
  // contactL1 is the LinkedIn URL, not a phone: fall back to the company number instead.
  const phone = c.contactMain || c.companyNo;
  return (
    <TableRow data-state={selected ? 'selected' : undefined} className="group/row">
      <TableCell className={frozenCell('check')}>
        <Checkbox checked={selected} onCheckedChange={(v) => onToggle(c._id, v === true)} aria-label={`Select ${c.name || 'contact'}`} />
      </TableCell>
      <TableCell className={frozenCell('name')}>
        <div className="flex max-w-full items-center gap-1.5">
          <Link href={`/contacts/${c._id}`} className="min-w-0 truncate font-medium hover:underline" title={c.name || undefined}>
            {c.name || '(no name)'}
          </Link>
          <LinkedInIconLink url={c.contactL1} />
        </div>
      </TableCell>
      <TableCell className={frozenCell('title')}>
        <div className="max-w-full truncate" title={c.title || undefined}>
          {c.title || <Dash />}
        </div>
      </TableCell>
      <TableCell className={frozenCell('company')}>
        <div className="max-w-full truncate" title={c.companyName || undefined}>
          {c.companyName || <Dash />}
        </div>
        {c.location ? (
          <div className="max-w-full truncate text-xs text-muted-foreground" title={c.location}>
            {c.location}
          </div>
        ) : null}
      </TableCell>
      <TableCell>
        {email ? (
          <a href={`mailto:${email}`} className="block max-w-56 truncate hover:underline" title={email}>
            {email}
          </a>
        ) : (
          <Dash />
        )}
      </TableCell>
      <TableCell>
        {phone ? (
          <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className="whitespace-nowrap hover:underline">
            {phone}
          </a>
        ) : (
          <Dash />
        )}
      </TableCell>
      <TableCell>
        {c.website ? (
          <a href={/^https?:\/\//i.test(c.website) ? c.website : `https://${c.website}`} target="_blank" rel="noreferrer" className="block max-w-44 truncate hover:underline" title={c.website}>
            {c.website.replace(/^https?:\/\/(www\.)?/i, '')}
          </a>
        ) : (
          <Dash />
        )}
      </TableCell>
      <TableCell>
        <LinkedinStageBadge stage={liStage(c)} />
      </TableCell>
      <TableCell className="text-sm">{liConnectionLabel(li.connectionStatus) || <Dash />}</TableCell>
      <TableCell>
        <NextActionCell contact={c} />
      </TableCell>
      <TableCell className="text-sm text-muted-foreground" suppressHydrationWarning>
        {li.lastTouchAt ? (
          <span title={formatDate(li.lastTouchAt)}>
            {timeAgo(li.lastTouchAt)}
            {li.touchpoints ? <span className="block text-xs">{li.touchpoints} touch{li.touchpoints === 1 ? '' : 'es'}</span> : null}
          </span>
        ) : (
          'Never'
        )}
      </TableCell>
      <TableCell>
        <div className="max-w-44 truncate text-sm" title={li.need || undefined}>
          {li.need || <Dash />}
        </div>
      </TableCell>
      <TableCell className="text-sm tabular-nums">{li.monthlyValue ? money(li.monthlyValue) : <Dash />}</TableCell>
      <TableCell>
        <PriorityBadge priority={c.priority} emptyLabel="—" />
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-2">
          <LinkedinStatusSelect contact={c} className="w-40" />
          <LinkedinActions contact={c} iconMenu />
        </div>
      </TableCell>
    </TableRow>
  );
}

function SkeletonRow() {
  return (
    <TableRow className="group/row">
      <TableCell className={frozenCell('check')}>
        <Skeleton className="size-4" />
      </TableCell>
      {COLUMNS.map((col) => (
        <TableCell key={col.key} className={frozenCell(col.key)}>
          <Skeleton className="h-4 w-24" />
        </TableCell>
      ))}
      <TableCell>
        <Skeleton className="ml-auto h-8 w-72" />
      </TableCell>
    </TableRow>
  );
}

export function LinkedinTable({ items = [], loading = false, dimmed = false, sort, dir, onSort, selected = EMPTY_SET, onToggle, onTogglePage }) {
  const pageIds = items.map((c) => c._id);
  const onPage = pageIds.filter((id) => selected.has(id)).length;
  const headerChecked = onPage === 0 ? false : onPage === pageIds.length ? true : 'indeterminate';
  const tableRef = useRef(null);
  useFrozenColumns(tableRef, [items, loading]);
  return (
    <div className={cn('relative overflow-hidden rounded-lg border bg-card transition-opacity duration-200', dimmed && 'opacity-60')} aria-busy={loading || dimmed || undefined}>
      <Table ref={tableRef} className={cn('min-w-[2000px]', FROZEN_TABLE_CLASS)}>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className={cn('w-10', frozenHead('check'))}>
              <Checkbox checked={headerChecked} onCheckedChange={(v) => onTogglePage?.(pageIds, v === true)} disabled={loading || !pageIds.length} aria-label="Select all on this page" />
            </TableHead>
            {COLUMNS.map((col) => (col.sort ? <SortableHead key={col.key} label={col.label} column={col.sort} sort={sort} dir={dir} onSort={onSort} className={frozenHead(col.key)} /> : <TableHead key={col.key} className={frozenHead(col.key)}>{col.label}</TableHead>))}
            <TableHead className="w-[27rem] text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>{loading ? Array.from({ length: 8 }, (_, i) => <SkeletonRow key={i} />) : items.map((c) => <ProspectRow key={c._id} contact={c} selected={selected.has(c._id)} onToggle={onToggle} />)}</TableBody>
      </Table>
      <FrozenResizeHandle />
    </div>
  );
}

/** Phone layout: one card per prospect. */
export function LinkedinCards({ items = [], loading = false, dimmed = false, selected = EMPTY_SET, onToggle }) {
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
      {items.map((c) => {
        const li = c.linkedin || {};
        const flag = actionFlag(c);
        return (
          <li key={c._id} className={cn('grid min-w-0 grid-cols-1 gap-2.5 rounded-lg border bg-card p-3', selected.has(c._id) && 'border-primary/40 bg-accent/40')}>
            <div className="flex items-start gap-3">
              <Checkbox className="mt-1" checked={selected.has(c._id)} onCheckedChange={(v) => onToggle(c._id, v === true)} aria-label={`Select ${c.name || 'contact'}`} />
              <div className="min-w-0 flex-1">
                <Link href={`/contacts/${c._id}`} className="block truncate text-base font-semibold hover:underline">
                  {c.name || '(no name)'}
                </Link>
                <p className="truncate text-sm text-muted-foreground">{[c.title, c.companyName].filter(Boolean).join(' · ')}</p>
              </div>
              <LinkedinActions contact={c} compact />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <LinkedinStageBadge stage={liStage(c)} size="xs" />
              {li.connectionStatus ? <span className="rounded-full border px-1.5 py-px text-[11px] text-muted-foreground">{liConnectionLabel(li.connectionStatus)}</span> : null}
              <PriorityBadge priority={c.priority} size="xs" />
              {li.monthlyValue ? <span className="text-xs font-medium tabular-nums">{money(li.monthlyValue)}/mo</span> : null}
            </div>
            {c.contactMain || c.companyNo || c.email || c.primaryEmail || c.website ? (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                {c.contactMain || c.companyNo ? (
                  <a href={`tel:${(c.contactMain || c.companyNo).replace(/[^\d+]/g, '')}`} className="text-primary">
                    {c.contactMain || c.companyNo}
                  </a>
                ) : null}
                {c.email || c.primaryEmail ? (
                  <a href={`mailto:${c.email || c.primaryEmail}`} className="min-w-0 truncate text-primary">
                    {c.email || c.primaryEmail}
                  </a>
                ) : null}
                {c.website ? (
                  <a href={/^https?:\/\//i.test(c.website) ? c.website : `https://${c.website}`} target="_blank" rel="noreferrer" className="min-w-0 truncate text-primary">
                    {c.website.replace(/^https?:\/\/(www\.)?/i, '')}
                  </a>
                ) : null}
              </div>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <NextActionCell contact={c} />
              <span className={cn('text-muted-foreground', flag === 'overdue' && 'text-destructive')} suppressHydrationWarning>
                {li.lastTouchAt ? `Last touch ${timeAgo(li.lastTouchAt)}` : 'Not started'}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <LinkedinStatusSelect contact={c} className="w-40" />
              {nextStepFor(c) ? <LinkedinActions contact={c} showMenu={false} /> : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
