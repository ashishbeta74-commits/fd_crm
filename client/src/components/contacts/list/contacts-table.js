'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { daysFromToday, formatDate, formatDateWithDay, formatTime, relativeDay, timeAgo } from '@/lib/format';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CategoryBadge, PriorityBadge, TagList } from '@/components/badges';
import { AddFollowUpButton, RemoveFollowUpButton } from '@/components/followups/add-followup-dialog';
import { AddBookingButton } from '@/components/contacts/add-booking-button';
import { StageSelect } from '@/components/contacts/stage-controls';
import { LeadQualitySelect } from '@/components/contacts/lead-quality-select';
import { useUpdateContact } from '@/hooks/use-contact-mutations';
import { ContactActionsMenu } from '@/components/contacts/contact-actions-menu';
import { DEFAULT_DIR, DEFAULT_SORT } from '@/components/contacts/list/contact-filters';
import { LinkedInIconLink } from '@/components/contacts/list/linkedin-link';
import { FROZEN_TABLE_CLASS, FrozenResizeHandle, frozenCell, frozenHead, useFrozenColumns } from '@/components/ui/frozen-columns';
import { StickyScrollbar, useDragScroll } from '@/components/ui/mouse-scroll';

const COLUMNS = [
  { key: 'name', label: 'Name', sort: 'name' },
  { key: 'title', label: 'Title', sort: 'title' },
  { key: 'company', label: 'Company', sort: 'companyName' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'stage', label: 'Stage', sort: 'stage' },
  { key: 'leadQuality', label: 'Lead quality', sort: 'leadQuality' },
  { key: 'category', label: 'Type', sort: 'category' },
  { key: 'priority', label: 'Priority', sort: 'priorityRank' },
  { key: 'tags', label: 'Tags' },
  { key: 'followUp', label: 'Follow-up', sort: 'followUp' },
  { key: 'booking', label: 'Booking', sort: 'booking.date' },
  { key: 'lastContact', label: 'Last contact', sort: 'lastContactedAt' },
  { key: 'updated', label: 'Updated', sort: 'updatedAt' },
];

const EMPTY_SET = new Set();
const SKELETON_ROWS = 8;

const Dash = () => <span className="text-muted-foreground">—</span>;

/** Inline lead-quality picker; saves on change (errors are toasted by the hook). */
function LeadQualityCell({ contact }) {
  const update = useUpdateContact();
  return <LeadQualitySelect value={contact.leadQuality || ''} onChange={(leadQuality) => update.mutate({ id: contact._id, data: { leadQuality } })} disabled={update.isPending} className="w-40" placeholder="—" />;
}

function SortableHead({ label, column, sort, dir, onSort, className }) {
  const active = sort === column;
  const Icon = !active ? ChevronsUpDown : dir === 'asc' ? ChevronUp : ChevronDown;
  const hint = active ? `Sorted ${dir === 'asc' ? 'ascending' : 'descending'} · click to reverse` : `Sort by ${label}`;
  return (
    <TableHead aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={className}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => onSort?.(column)}
            className={cn(
              '-mx-1 inline-flex h-8 items-center gap-1 rounded-sm px-1 text-xs font-medium tracking-wide uppercase outline-none transition-colors duration-200 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50',
              active ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            {label}
            <Icon className={cn('size-3.5 transition-opacity duration-200', !active && 'opacity-50')} aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent>{hint}</TooltipContent>
      </Tooltip>
    </TableHead>
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
        <Skeleton className="size-8" />
      </TableCell>
    </TableRow>
  );
}

function ContactRow({ contact: c, selected, onToggle, onStageChange, stagePending }) {
  const email = c.email || c.primaryEmail;
  // contactL1 is the LinkedIn URL, not a phone: fall back to the company number instead.
  const phone = c.contactMain || c.companyNo;
  const overdue = Boolean(c.followUp) && daysFromToday(c.followUp) < 0;

  return (
    // No entrance animation on rows: the animated opacity layer let 1px of the scrolled-under cells show through the frozen ones.
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
          <a href={`tel:${phone}`} className="hover:underline">
            {phone}
          </a>
        ) : (
          <Dash />
        )}
      </TableCell>
      <TableCell>
        {/* The trigger shows the stage label itself, so no tooltip here. */}
        <StageSelect value={c.stage} onChange={(stage) => onStageChange(c, stage)} disabled={stagePending} className="w-36" />
      </TableCell>
      <TableCell>
        <LeadQualityCell contact={c} />
      </TableCell>
      <TableCell>
        <CategoryBadge category={c.category} emptyLabel="—" withTooltip />
      </TableCell>
      <TableCell>
        <PriorityBadge priority={c.priority} emptyLabel="—" />
      </TableCell>
      <TableCell>
        <TagList tags={c.tags} max={2} size="xs" className="max-w-48" />
        {!c.tags?.length ? <Dash /> : null}
      </TableCell>
      <TableCell>
        <div className="grid justify-items-start gap-1">
          {c.followUp ? (
            <div className={cn(overdue && 'text-destructive')} suppressHydrationWarning>
              <div>{formatDate(c.followUp)}</div>
              <div className={cn('text-xs', overdue ? 'text-destructive' : 'text-muted-foreground')} suppressHydrationWarning>
                {relativeDay(c.followUp)}
                {c.followUpCount ? ` · ${c.followUpCount} done` : ''}
              </div>
            </div>
          ) : c.followUpCount ? (
            <div className="text-xs text-muted-foreground">{c.followUpCount} done</div>
          ) : null}
          {/* One round per click: counts the follow-up and asks for the next date; "Remove" takes the last one back. */}
          <div className="flex flex-wrap gap-1">
            <AddFollowUpButton contact={c} size="xs" className="h-6 px-1.5 text-[11px]" />
            <RemoveFollowUpButton contact={c} size="xs" className="h-6 px-1.5 text-[11px]" />
          </div>
        </div>
      </TableCell>
      <TableCell>
        <div className="grid justify-items-start gap-1">
          {c.booking?.date ? (
            <div>
              <div>{formatDateWithDay(c.booking.date)}</div>
              <div className="text-xs text-muted-foreground">
                {c.booking.time ? formatTime(c.booking.time) : ''}
                {c.booking.bookedAt ? `${c.booking.time ? ' · ' : ''}booked ${formatDate(c.booking.bookedAt)}` : ''}
              </div>
            </div>
          ) : null}
          <AddBookingButton contact={c} size="xs" className="h-6 px-1.5 text-[11px]" />
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground" suppressHydrationWarning>
        {c.lastContactedAt ? timeAgo(c.lastContactedAt) : 'Never'}
      </TableCell>
      <TableCell className="text-muted-foreground" suppressHydrationWarning>
        {timeAgo(c.updatedAt)}
      </TableCell>
      <TableCell className="text-right">
        <ContactActionsMenu contact={c} />
      </TableCell>
    </TableRow>
  );
}

/**
 * The contacts grid. With `loading` it renders skeleton rows under a live header.
 * Scrolls horizontally inside its own container so the page never does.
 */
export function ContactsTable({
  items = [],
  loading = false,
  dimmed = false,
  sort = DEFAULT_SORT,
  dir = DEFAULT_DIR,
  onSort,
  selected = EMPTY_SET,
  onToggle,
  onTogglePage,
  onStageChange,
  stagePending = false,
}) {
  const pageIds = items.map((c) => c._id);
  const selectedOnPage = pageIds.filter((id) => selected.has(id)).length;
  const headerChecked = selectedOnPage === 0 ? false : selectedOnPage === pageIds.length ? true : 'indeterminate';
  const tableRef = useRef(null);

  useFrozenColumns(tableRef, [items, loading]);
  // Mouse users: drag the table sideways, and a scrollbar pinned to the bottom of the window while the table is taller than it.
  useDragScroll(tableRef, [items, loading]);

  return (
    <div className={cn('relative overflow-hidden rounded-lg border bg-card transition-opacity duration-200', dimmed && 'opacity-60')} aria-busy={loading || dimmed || undefined}>
      <StickyScrollbar tableRef={tableRef} deps={[items, loading]} />
      {/* The Table component wraps itself in an overflow-x-auto container; the min width keeps columns readable. */}
      <Table ref={tableRef} className={cn('min-w-[1560px]', FROZEN_TABLE_CLASS)}>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className={cn('w-10', frozenHead('check'))}>
              <Tooltip>
                {/* Radix Checkbox lets incoming props override its data-state, so the trigger is a wrapper
                    (focus bubbles up from the checkbox, so the tooltip still opens from the keyboard). */}
                <TooltipTrigger asChild>
                  <span className="inline-flex translate-y-[2px]">
                    <Checkbox
                      checked={headerChecked}
                      onCheckedChange={(v) => onTogglePage?.(pageIds, v === true)}
                      disabled={loading || pageIds.length === 0}
                      aria-label="Select all contacts on this page"
                    />
                  </span>
                </TooltipTrigger>
                <TooltipContent>Select all on this page</TooltipContent>
              </Tooltip>
            </TableHead>
            {COLUMNS.map((col) =>
              col.sort ? (
                <SortableHead key={col.key} label={col.label} column={col.sort} sort={sort} dir={dir} onSort={onSort} className={frozenHead(col.key)} />
              ) : (
                <TableHead key={col.key} className={frozenHead(col.key)}>
                  {col.label}
                </TableHead>
              ),
            )}
            <TableHead className="w-12">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading
            ? Array.from({ length: SKELETON_ROWS }, (_, i) => <SkeletonRow key={i} />)
            : items.map((c) => (
                <ContactRow
                  key={c._id}
                  contact={c}
                  selected={selected.has(c._id)}
                  onToggle={onToggle}
                  onStageChange={onStageChange}
                  stagePending={stagePending}
                />
              ))}
        </TableBody>
      </Table>
      <FrozenResizeHandle />
    </div>
  );
}
