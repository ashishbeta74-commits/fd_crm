'use client';

import { startTransition, useCallback, useEffect, useMemo, useOptimistic, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronDown, Download, Search, X } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

// Default direction per sortable column (the API's SORTS); the first click on a header uses it.
export const SORTS = { date: 'desc', evaluatedFor: 'desc', clientName: 'asc', company: 'asc', status: 'asc', primaryEmail: 'asc', followUpDate: 'asc', updatedAt: 'desc', tab: 'asc' };
export const FILTER_KEYS = ['q', 'tab', 'evaluatedFor', 'followUp', 'from', 'to', 'missing'];
export const PAGE_SIZES = [25, 50, 100, 200];
const DEFAULTS = { page: 1, limit: 50, sort: 'date', dir: 'desc' };
const ALL = '__all__';
const ACTIVE = 'border-primary/40 bg-accent text-accent-foreground';
const oneOf = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback);
const PATH = '/email-evaluation';

export function parseParams(sp) {
  const get = (k) => sp.get(k) || '';
  const page = parseInt(get('page'), 10);
  const limit = parseInt(get('limit'), 10);
  return {
    q: get('q'),
    tab: get('tab'),
    evaluatedFor: get('evaluatedFor'),
    followUp: oneOf(get('followUp'), ['yes', 'no'], ''),
    from: get('from'),
    to: get('to'),
    missing: oneOf(get('missing'), ['yes'], ''),
    page: page > 0 ? page : 1,
    limit: PAGE_SIZES.includes(limit) ? limit : DEFAULTS.limit,
    sort: oneOf(get('sort'), Object.keys(SORTS), DEFAULTS.sort),
    dir: oneOf(get('dir'), ['asc', 'desc'], DEFAULTS.dir),
  };
}

/** Filter state in the URL (/email-evaluation?tab=HARRY&evaluatedFor=2026) so a view can be shared. */
export function useEmailEvaluationParams() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sp, setSp] = useOptimistic(searchParams);
  const params = useMemo(() => parseParams(sp), [sp]);
  const setParams = useCallback(
    (patch) => {
      const next = new URLSearchParams(sp.toString());
      if (Object.keys(patch).some((k) => k !== 'page')) next.delete('page');
      for (const [k, v] of Object.entries(patch)) {
        if (v === '' || v == null || v === DEFAULTS[k]) next.delete(k);
        else next.set(k, String(v));
      }
      const qs = next.toString();
      startTransition(() => {
        setSp(next);
        router.replace(qs ? `${PATH}?${qs}` : PATH, { scroll: false });
      });
    },
    [router, sp, setSp],
  );
  const clearFilters = useCallback(() => setParams(Object.fromEntries(FILTER_KEYS.map((k) => [k, '']))), [setParams]);
  const activeCount = FILTER_KEYS.filter((k) => params[k]).length;
  return { params, setParams, clearFilters, activeCount };
}

const csv = (s) => (s ? s.split(',').filter(Boolean) : []);

function SearchInput({ value, onCommit }) {
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setText(value);
  }
  useEffect(() => {
    if (text === value) return undefined;
    const t = setTimeout(() => onCommit(text), 300);
    return () => clearTimeout(t);
  }, [text, value, onCommit]);
  return (
    <div className="relative w-full sm:w-72">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Search name, company, email, phone, notes…" aria-label="Search email evaluations" autoComplete="off" className="pl-8" />
    </div>
  );
}

function MultiFilter({ label, options, value, onChange, width = 'w-56' }) {
  const selected = csv(value);
  const toggle = (key) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(options.filter((o) => next.has(o.key)).map((o) => o.key).join(','));
  };
  const one = selected.length === 1 ? options.find((o) => o.key === selected[0]) : null;
  const summary = selected.length === 0 ? label : selected.length === 1 ? one?.label || label : `${label} · ${selected.length}`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className={cn('max-w-56 font-normal', selected.length && ACTIVE)} aria-label={`${label} filter`}>
          <span className="truncate">{summary}</span>
          <ChevronDown className="opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className={cn(width, 'max-h-80 overflow-y-auto')}>
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.length ? null : <p className="px-2 py-1.5 text-xs text-muted-foreground">Nothing to filter by yet</p>}
        {options.map((o) => (
          <DropdownMenuCheckboxItem key={o.key} checked={selected.includes(o.key)} onCheckedChange={() => toggle(o.key)} onSelect={(e) => e.preventDefault()}>
            <span className="truncate">{o.label}</span>
            {o.count != null ? <span className="ml-auto pl-3 text-xs tabular-nums text-muted-foreground">{o.count}</span> : null}
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

function SingleFilter({ label, options, value, onChange, allLabel = 'All' }) {
  return (
    <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? '' : v)}>
      <SelectTrigger className={cn('max-w-56', value && ACTIVE)} aria-label={`${label} filter`}>
        <span className="text-muted-foreground">{label}:</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** A date bound ("from" / "to"), kept small; clears with the native control. */
function DateBound({ label, value, onChange }) {
  return (
    <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <span>{label}</span>
      <Input type="date" value={value} onChange={(e) => onChange(e.target.value)} aria-label={`${label} date`} className={cn('h-9 w-38', value && ACTIVE)} />
    </label>
  );
}

/** Search + the filters (tab, year evaluated for, follow-up, date range) and the export link. */
export function EmailEvaluationToolbar({ params, setParams, clearFilters, activeCount, meta }) {
  const commitSearch = useCallback((q) => setParams({ q }), [setParams]);
  const tabOptions = (meta?.tabs || []).map((t) => ({ key: t.tab || 'none', label: t.tab || 'Added in the CRM', count: t.count }));
  const yearOptions = (meta?.years || []).map((y) => ({ key: y.year || 'none', label: y.year || 'Not set', count: y.count }));
  const exportHref = api.emailEvaluation.exportUrl({ ...params, page: undefined, limit: undefined });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SearchInput value={params.q} onCommit={commitSearch} />
      <MultiFilter label="Tab" options={tabOptions} value={params.tab} onChange={(tab) => setParams({ tab })} />
      <MultiFilter label="Evaluated for" options={yearOptions} value={params.evaluatedFor} onChange={(evaluatedFor) => setParams({ evaluatedFor })} width="w-48" />
      <SingleFilter
        label="Follow-up"
        options={[
          { value: 'yes', label: 'Written down' },
          { value: 'no', label: 'None yet' },
        ]}
        value={params.followUp}
        onChange={(followUp) => setParams({ followUp })}
        allLabel="Any"
      />
      <DateBound label="From" value={params.from} onChange={(from) => setParams({ from })} />
      <DateBound label="To" value={params.to} onChange={(to) => setParams({ to })} />
      {activeCount ? (
        <Button variant="ghost" onClick={clearFilters}>
          <X /> Clear
        </Button>
      ) : null}
      <div className="ml-auto">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button asChild variant="outline" size="sm">
              <a href={exportHref} download>
                <Download /> Export
              </a>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Download this view as a spreadsheet (.xlsx)</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
