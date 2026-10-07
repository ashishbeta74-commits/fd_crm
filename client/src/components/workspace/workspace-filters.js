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

export const PAGE_SIZES = [25, 50, 100, 200];
const DEFAULTS = { page: 1, limit: 50 };
const ACTIVE = 'border-primary/40 bg-accent text-accent-foreground';
const oneOf = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback);

/** Every query-string key that is a filter (search, date range, tab, missing, and the per-field `f.<key>` ones). */
export function filterKeys(params) {
  return Object.keys(params).filter((k) => k === 'q' || k === 'from' || k === 'to' || k === 'tab' || k === 'missing' || k.startsWith('f.'));
}

export function parseParams(sp) {
  const get = (k) => sp.get(k) || '';
  const page = parseInt(get('page'), 10);
  const limit = parseInt(get('limit'), 10);
  const out = {
    q: get('q'),
    // which date column the range applies to ('' = the workspace's main date)
    dateField: get('dateField'),
    from: get('from'),
    to: get('to'),
    tab: get('tab'),
    missing: oneOf(get('missing'), ['yes'], ''),
    page: page > 0 ? page : 1,
    limit: PAGE_SIZES.includes(limit) ? limit : DEFAULTS.limit,
    sort: get('sort'),
    dir: oneOf(get('dir'), ['asc', 'desc'], ''),
  };
  for (const [k, v] of sp.entries()) if (k.startsWith('f.') && v) out[k] = v;
  return out;
}

/** Filter state in the URL (/enquiries?f.status=CONVERTED&from=2026-09-01) so a view can be shared. */
export function useWorkspaceParams(href) {
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
        router.replace(qs ? `${href}?${qs}` : href, { scroll: false });
      });
    },
    [router, sp, setSp, href],
  );
  const active = filterKeys(params).filter((k) => params[k]);
  const clearFilters = useCallback(() => setParams(Object.fromEntries(active.map((k) => [k, '']))), [setParams, active]);
  return { params, setParams, clearFilters, activeCount: active.length };
}

const csv = (s) => (s ? s.split(',').filter(Boolean) : []);

function SearchInput({ value, onCommit, placeholder }) {
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
      <Input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} aria-label="Search" autoComplete="off" className="pl-8" />
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

function DateBound({ label, value, onChange }) {
  return (
    <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <span>{label}</span>
      <Input type="date" value={value} onChange={(e) => onChange(e.target.value)} aria-label={`${label} date`} className={cn('h-9 w-38', value && ACTIVE)} />
    </label>
  );
}

/** Search, one dropdown per filter field (values in use, with counts), tab, date range, export. */
export function WorkspaceToolbar({ workspace, meta, params, setParams, clearFilters, activeCount }) {
  const commitSearch = useCallback((q) => setParams({ q }), [setParams]);
  const ws = meta?.workspace || workspace;
  const filterFields = (ws?.fields || []).filter((f) => f.filter);
  const searchFields = (ws?.fields || []).filter((f) => f.search).map((f) => f.label.toLowerCase());
  const tabOptions = (meta?.tabs || []).map((t) => ({ key: t.tab || 'none', label: t.tab || 'Added in the CRM', count: t.count }));
  // The date range applies to one date column: the workspace's main date, or any other date field the user picks.
  const dateFields = (ws?.fields || []).filter((f) => f.type === 'date');
  const dateField = dateFields.find((f) => f.key === params.dateField) || dateFields.find((f) => f.key === ws?.dateField) || dateFields[0];
  const exportHref = api.workspaces.exportUrl(ws?.key, { ...params, page: undefined, limit: undefined });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SearchInput value={params.q} onCommit={commitSearch} placeholder={searchFields.length ? `Search ${searchFields.slice(0, 4).join(', ')}…` : 'Search…'} />
      {filterFields.map((f) => {
        const inUse = meta?.filters?.[f.key] || [];
        const options = inUse.map((o) => ({ key: o.value || 'none', label: o.value || 'Not set', count: o.count }));
        return <MultiFilter key={f.key} label={f.label} options={options} value={params[`f.${f.key}`] || ''} onChange={(v) => setParams({ [`f.${f.key}`]: v })} />;
      })}
      {tabOptions.length > 1 ? <MultiFilter label="Tab" options={tabOptions} value={params.tab} onChange={(tab) => setParams({ tab })} /> : null}
      {dateField ? (
        <div className="flex flex-wrap items-center gap-1.5 rounded-md border px-2 py-1">
          {dateFields.length > 1 ? (
            <Select value={dateField.key} onValueChange={(dateField) => setParams({ dateField: dateField === (ws?.dateField || dateFields[0]?.key) ? '' : dateField })}>
              <SelectTrigger size="sm" className={cn('h-8 max-w-48 border-0 shadow-none', (params.from || params.to) && ACTIVE)} aria-label="Date column to filter on">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {dateFields.map((f) => (
                  <SelectItem key={f.key} value={f.key}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <span className="text-sm text-muted-foreground">{dateField.label}</span>
          )}
          <DateBound label="from" value={params.from} onChange={(from) => setParams({ from })} />
          <DateBound label="to" value={params.to} onChange={(to) => setParams({ to })} />
        </div>
      ) : null}
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
