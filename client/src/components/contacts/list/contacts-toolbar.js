'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Download, MapPin, Plus, Search, Upload, X } from 'lucide-react';
import { api } from '@/lib/api';
import { CATEGORIES, CATEGORY_STYLES, PRIORITIES, PRIORITY_STYLES, STAGES, STAGE_STYLES } from '@/lib/constants';
import { SavedViewsMenu } from '@/components/views/saved-views-menu';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useMeta } from '@/hooks/use-meta';
import { BOOKING_OPTIONS, FOLLOW_UP_OPTIONS } from '@/components/contacts/list/contact-filters';

// Radix Select items cannot be '', so "no filter" needs a sentinel that no real value can collide with.
const ALL = '__all__';
const ACTIVE = 'border-primary/40 bg-accent text-accent-foreground';

const STAGE_OPTIONS = STAGES.map((s) => ({ key: s.key, label: s.label, dot: STAGE_STYLES[s.key].dot }));

const PRIORITY_OPTIONS = [...PRIORITIES.map((p) => ({ key: p.key, label: p.label, dot: PRIORITY_STYLES[p.key].dot })), { key: 'none', label: 'No priority' }];

// The two kinds of contact the team works, as one-click toggles beside the search box. Nothing selected = everyone.
const TYPE_TOGGLES = CATEGORIES.filter((c) => c.key === 'travel_advisor' || c.key === 'executive_assistant');

const csv = (s) => (s ? s.split(',').filter(Boolean) : []);

/** Search box that pushes its value to the URL 300ms after the last keystroke. */
function SearchInput({ value, onCommit }) {
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  // `value` is the optimistic URL, so our own commit reaches us already equal to `text` and this
  // is a no-op; any other change (Clear filters, back button) was made elsewhere: adopt it.
  if (value !== seen) {
    setSeen(value);
    setText(value);
  }

  useEffect(() => {
    if (text === value) return undefined;
    const timer = setTimeout(() => onCommit(text), 300);
    return () => clearTimeout(timer);
  }, [text, value, onCommit]);

  return (
    <div className="relative w-full sm:w-64">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input
        type="search"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Search name, email, company, city, state…"
        aria-label="Search contacts"
        autoComplete="off"
        className="pl-8"
      />
    </div>
  );
}

/** Multi-select filter (comma list in the URL) as a dropdown of checkbox items. */
function MultiFilter({ label, options, value, onChange }) {
  const selected = csv(value);
  const toggle = (key) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    // Emit in option order so the same selection always produces the same URL.
    onChange(options.filter((o) => next.has(o.key)).map((o) => o.key).join(','));
  };
  const summary =
    selected.length === 0 ? label : selected.length === 1 ? options.find((o) => o.key === selected[0])?.label || label : `${label} · ${selected.length}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className={cn('font-normal transition-colors duration-200', selected.length && ACTIVE)} aria-label={`${label} filter`}>
          {summary}
          <ChevronDown className="opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((o) => (
          <DropdownMenuCheckboxItem
            key={o.key}
            checked={selected.includes(o.key)}
            onCheckedChange={() => toggle(o.key)}
            onSelect={(e) => e.preventDefault()}
          >
            {o.dot ? <span className={cn('size-2 rounded-full', o.dot)} /> : null}
            {o.label}
          </DropdownMenuCheckboxItem>
        ))}
        {selected.length ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onChange('')}>Clear</DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Travel Advisor / Executive Assistant as two toggle buttons (comma list in the URL's `category`).
 * Neither pressed = all contacts; both pressed = both kinds; press again to release.
 */
function TypeToggles({ value, onChange }) {
  const selected = csv(value);
  const toggle = (key) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(CATEGORIES.filter((c) => next.has(c.key)).map((c) => c.key).join(','));
  };
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Contact type">
      {TYPE_TOGGLES.map((c) => {
        const active = selected.includes(c.key);
        return (
          <Button
            key={c.key}
            variant="outline"
            aria-pressed={active}
            onClick={() => toggle(c.key)}
            className={cn('font-normal transition-colors duration-200', active && ACTIVE)}
            title={active ? `Showing ${c.label.toLowerCase()}s · click to show everyone` : `Only ${c.label.toLowerCase()}s`}
          >
            <span className={cn('size-2 rounded-full', CATEGORY_STYLES[c.key].dot)} aria-hidden="true" />
            {c.label}
          </Button>
        );
      })}
    </div>
  );
}

const PLACE_LIMIT = 40;

/**
 * Country / State / City: a multi-select with a search box on top, since a list can hold hundreds
 * of places. Options come from meta with contact counts; a value in the URL stays selectable even if
 * it is not (or no longer) in the list. "Not set" matches contacts without that field.
 */
function PlaceFilter({ label, items, value, onChange }) {
  const [term, setTerm] = useState('');
  const selected = csv(value);
  const known = (items || []).map((p) => ({ key: p.name, label: p.name, count: p.count }));
  const extra = selected.filter((v) => v !== 'none' && !known.some((k) => k.key === v)).map((v) => ({ key: v, label: v }));
  const all = [...extra, ...known];
  const t = term.trim().toLowerCase();
  const matches = t ? all.filter((o) => o.label.toLowerCase().includes(t)) : all;
  // Selected ones stay at the top so they can be unticked without searching for them again.
  const shown = [...matches.filter((o) => selected.includes(o.key)), ...matches.filter((o) => !selected.includes(o.key))].slice(0, PLACE_LIMIT);
  const toggle = (key) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange([...all.filter((o) => next.has(o.key)).map((o) => o.key), ...(next.has('none') ? ['none'] : [])].join(','));
  };
  const summary = selected.length === 0 ? label : selected.length === 1 ? (selected[0] === 'none' ? `${label}: not set` : selected[0]) : `${label} · ${selected.length}`;

  return (
    <DropdownMenu onOpenChange={(o) => !o && setTerm('')}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className={cn('max-w-48 font-normal transition-colors duration-200', selected.length && ACTIVE)} aria-label={`${label} filter`}>
          <MapPin className="opacity-60" />
          <span className="truncate">{summary}</span>
          <ChevronDown className="opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <div className="px-1 pb-1">
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            // the menu's typeahead and arrow handling must not swallow what is typed here
            onKeyDown={(e) => e.stopPropagation()}
            placeholder={`Search ${label.toLowerCase()}…`}
            aria-label={`Search ${label.toLowerCase()}`}
            autoComplete="off"
            className="h-8"
          />
        </div>
        <DropdownMenuSeparator />
        <div className="max-h-64 overflow-y-auto">
          {shown.map((o) => (
            <DropdownMenuCheckboxItem key={o.key} checked={selected.includes(o.key)} onCheckedChange={() => toggle(o.key)} onSelect={(e) => e.preventDefault()}>
              <span className="min-w-0 flex-1 truncate">{o.label}</span>
              {o.count ? <span className="ml-2 text-xs text-muted-foreground tabular-nums">{o.count}</span> : null}
            </DropdownMenuCheckboxItem>
          ))}
          {!shown.length ? <p className="px-2 py-3 text-center text-xs text-muted-foreground">No {label.toLowerCase()} matches “{term.trim()}”.</p> : null}
          {matches.length > PLACE_LIMIT ? <p className="px-2 py-1.5 text-center text-xs text-muted-foreground">{matches.length - PLACE_LIMIT} more · keep typing to narrow down</p> : null}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem checked={selected.includes('none')} onCheckedChange={() => toggle('none')} onSelect={(e) => e.preventDefault()}>
          Not set
        </DropdownMenuCheckboxItem>
        {selected.length ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onChange('')}>Clear</DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Single-value filter; the trigger always shows "<label>: <value>". */
function SingleFilter({ label, options, value, onChange }) {
  return (
    <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? '' : v)}>
      <SelectTrigger className={cn(value && ACTIVE)} aria-label={`${label} filter`}>
        <span className="text-muted-foreground">{label}:</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Tags known across the CRM (from meta) as a multi-select; a tag in the URL stays selectable even if it vanished. */
function TagFilter({ value, onChange }) {
  const { data } = useMeta();
  const known = (data?.tags || []).map((t) => ({ key: t.tag, label: `${t.tag} (${t.count})` }));
  const extra = csv(value)
    .filter((t) => t !== 'none' && !known.some((k) => k.key === t))
    .map((t) => ({ key: t, label: t }));
  const options = [...extra, ...known, { key: 'none', label: 'No tags' }];
  return <MultiFilter label="Tags" options={options} value={value} onChange={onChange} />;
}

function SheetFilter({ value, onChange }) {
  const { data } = useMeta();
  const sheets = (data?.sheets || []).filter(Boolean);
  // Keep the URL's sheet selectable even before meta loads (or if it is no longer known).
  const names = value && !sheets.includes(value) ? [value, ...sheets] : sheets;
  return (
    <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? '' : v)}>
      <SelectTrigger className={cn('max-w-56', value && ACTIVE)} aria-label="Sheet filter">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All sheets</SelectItem>
        {names.map((name) => (
          <SelectItem key={name} value={name}>
            {name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ContactsToolbar({ params, setParams, clearFilters, filterCount, onAdd }) {
  const commitSearch = useCallback((q) => setParams({ q }), [setParams]);
  const { data: meta } = useMeta();
  const exportHref = api.contacts.exportUrl({ ...params, page: undefined, limit: undefined });

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Full width on phones; the filters wrap beneath it. */}
      <SearchInput value={params.q} onCommit={commitSearch} />
      <TypeToggles value={params.category} onChange={(category) => setParams({ category })} />
      <MultiFilter label="Stage" options={STAGE_OPTIONS} value={params.stage} onChange={(stage) => setParams({ stage })} />

      <SheetFilter value={params.sheet} onChange={(sheet) => setParams({ sheet })} />
      <PlaceFilter label="Country" items={meta?.countries} value={params.country} onChange={(country) => setParams({ country })} />
      <PlaceFilter label="State" items={meta?.states} value={params.state} onChange={(state) => setParams({ state })} />
      <PlaceFilter label="City" items={meta?.cities} value={params.city} onChange={(city) => setParams({ city })} />
      <MultiFilter label="Priority" options={PRIORITY_OPTIONS} value={params.priority} onChange={(priority) => setParams({ priority })} />
      <TagFilter value={params.tag} onChange={(tag) => setParams({ tag })} />
      <SingleFilter label="Follow-up" options={FOLLOW_UP_OPTIONS} value={params.followUp} onChange={(followUp) => setParams({ followUp })} />
      <SingleFilter label="Booking" options={BOOKING_OPTIONS} value={params.booking} onChange={(booking) => setParams({ booking })} />
      {params.batch ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="secondary" onClick={() => setParams({ batch: '' })} aria-label={`Remove import batch filter (batch ${params.batch})`}>
              Import batch …{params.batch.slice(-6)}
              <X />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Import batch {params.batch} · click to remove</TooltipContent>
        </Tooltip>
      ) : null}
      {filterCount ? (
        <Button variant="ghost" onClick={clearFilters} className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200">
          <X />
          Clear filters
        </Button>
      ) : null}

      {/* Own row on phones; pushed to the right from the sm breakpoint. */}
      <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
        <SavedViewsMenu params={params} setParams={setParams} />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button asChild variant="outline">
              <a href={exportHref} download>
                <Download />
                Export
              </a>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Download the current view as .xlsx</TooltipContent>
        </Tooltip>
        <Button asChild variant="outline">
          <Link href="/import">
            <Upload />
            Import
          </Link>
        </Button>
        <Button onClick={onAdd}>
          <Plus />
          Add contact
        </Button>
      </div>
    </div>
  );
}
