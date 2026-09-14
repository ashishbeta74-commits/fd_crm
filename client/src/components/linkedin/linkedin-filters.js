'use client';

import { startTransition, useCallback, useEffect, useMemo, useOptimistic, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronDown, Download, Search, X } from 'lucide-react';
import { api } from '@/lib/api';
import { LI_CONNECTION_STATUSES, LI_GROUPS, LI_GROUP_STYLES, LI_STAGES, LI_STATUSES } from '@/lib/linkedin';
import { PRIORITIES, PRIORITY_STYLES } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useMeta } from '@/hooks/use-meta';

export const FLAGS = [
  { value: 'overdue', label: 'Overdue' },
  { value: 'week', label: 'Due this week' },
  { value: 'none', label: 'No next action' },
  { value: 'notFollowed', label: 'Not yet followed' },
  { value: 'active', label: 'Worked (anything logged)' },
];
export const SORTS = { lastTouchAt: 'desc', nextActionDate: 'asc', stage: 'desc', name: 'asc', companyName: 'asc', monthlyValue: 'desc', priority: 'desc', updatedAt: 'desc' };
export const FILTER_KEYS = ['q', 'stage', 'group', 'connection', 'flag', 'priority', 'status', 'sheet', 'scope'];
const PAGE_SIZES = [25, 50, 100];
const DEFAULTS = { page: 1, limit: 25, sort: 'lastTouchAt', dir: 'desc', scope: 'url' };
const ALL = '__all__';
const ACTIVE = 'border-primary/40 bg-accent text-accent-foreground';
const oneOf = (v, allowed, fallback) => (allowed.includes(v) ? v : fallback);

export function parseParams(sp) {
  const get = (k) => sp.get(k) || '';
  const page = parseInt(get('page'), 10);
  const limit = parseInt(get('limit'), 10);
  return {
    q: get('q'),
    stage: get('stage'),
    group: get('group'),
    connection: get('connection'),
    flag: oneOf(get('flag'), FLAGS.map((f) => f.value), ''),
    priority: get('priority'),
    status: get('status'),
    sheet: get('sheet'),
    scope: oneOf(get('scope'), ['url', 'all'], 'url'),
    page: page > 0 ? page : 1,
    limit: PAGE_SIZES.includes(limit) ? limit : 25,
    sort: oneOf(get('sort'), Object.keys(SORTS), 'lastTouchAt'),
    dir: oneOf(get('dir'), ['asc', 'desc'], 'desc'),
    tab: oneOf(get('tab'), ['prospects', 'playbook'], 'prospects'),
    period: get('period') || 'all',
  };
}

/** Filter state in the URL (/linkedin?flag=overdue) so tiles and links can point at a view. */
export function useLinkedinParams() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sp, setSp] = useOptimistic(searchParams);
  const params = useMemo(() => parseParams(sp), [sp]);
  const setParams = useCallback(
    (patch) => {
      const next = new URLSearchParams(sp.toString());
      if (Object.keys(patch).some((k) => k !== 'page' && k !== 'tab' && k !== 'period')) next.delete('page');
      for (const [k, v] of Object.entries(patch)) {
        if (v === '' || v == null || v === DEFAULTS[k] || (k === 'tab' && v === 'prospects') || (k === 'period' && v === 'all')) next.delete(k);
        else next.set(k, String(v));
      }
      const qs = next.toString();
      startTransition(() => {
        setSp(next);
        router.replace(qs ? `/linkedin?${qs}` : '/linkedin', { scroll: false });
      });
    },
    [router, sp, setSp],
  );
  const clearFilters = useCallback(() => setParams(Object.fromEntries(FILTER_KEYS.map((k) => [k, '']))), [setParams]);
  const activeCount = FILTER_KEYS.filter((k) => params[k] && !(k === 'scope' && params[k] === 'url')).length;
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
    <div className="relative w-full sm:w-64">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Search name, company, need…" aria-label="Search prospects" autoComplete="off" className="pl-8" />
    </div>
  );
}

function MultiFilter({ label, options, value, onChange, width = 'w-56', emptyHint = '' }) {
  const selected = csv(value);
  const toggle = (key) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(options.filter((o) => next.has(o.key)).map((o) => o.key).join(','));
  };
  const one = selected.length === 1 ? options.find((o) => o.key === selected[0]) : null;
  const summary = selected.length === 0 ? label : selected.length === 1 ? one?.short || one?.label || label : `${label} · ${selected.length}`;
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
        {emptyHint && options.every((o) => o.key === 'none') ? <p className="px-2 py-1.5 text-xs text-muted-foreground">{emptyHint}</p> : null}
        {options.map((o) => (
          <DropdownMenuCheckboxItem key={o.key} checked={selected.includes(o.key)} onCheckedChange={() => toggle(o.key)} onSelect={(e) => e.preventDefault()}>
            {o.dot ? <span className={cn('size-2 shrink-0 rounded-full', o.dot)} /> : null}
            <span className="truncate">{o.label}</span>
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

/** Group chips (Warm-Up / Connect / Convert / Closed) + the detailed filters. */
export function LinkedinToolbar({ params, setParams, clearFilters, activeCount }) {
  const { data: crmMeta } = useMeta();
  const commitSearch = useCallback((q) => setParams({ q }), [setParams]);
  const stageOptions = LI_STAGES.map((s) => ({ key: s.key, label: s.label, dot: LI_GROUP_STYLES[s.group].dot }));
  const connectionOptions = [...LI_CONNECTION_STATUSES.map((c) => ({ key: c.key, label: c.label })), { key: 'none', label: 'Not set' }];
  const priorityOptions = [...PRIORITIES.map((p) => ({ key: p.key, label: p.label, dot: PRIORITY_STYLES[p.key].dot })), { key: 'none', label: 'No priority' }];
  const statusOptions = LI_STATUSES.map((s) => ({ key: s.key, label: s.label, dot: s.dot }));
  const groups = csv(params.group);
  const toggleGroup = (key) => setParams({ group: groups.includes(key) ? groups.filter((g) => g !== key).join(',') : [...groups, key].join(','), stage: '' });
  const exportHref = api.linkedin.exportUrl({ ...params, page: undefined, limit: undefined, tab: undefined, period: undefined });

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {LI_GROUPS.map((g) => {
          const on = groups.includes(g.key);
          return (
            <Tooltip key={g.key}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => toggleGroup(g.key)}
                  aria-pressed={on}
                  className={cn(
                    'inline-flex min-h-9 items-center gap-2 rounded-full border px-3 text-sm transition-colors',
                    on ? cn(LI_GROUP_STYLES[g.key].badge, 'border-current/30 font-medium') : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  <span className={cn('size-2 rounded-full', LI_GROUP_STYLES[g.key].dot)} aria-hidden />
                  {g.short} {g.label}
                </button>
              </TooltipTrigger>
              <TooltipContent>{g.description}</TooltipContent>
            </Tooltip>
          );
        })}
        <div className="ml-auto">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button asChild variant="outline" size="sm">
                <a href={exportHref} download>
                  <Download /> Export
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Download this view as the workbook&apos;s Data tab (.xlsx)</TooltipContent>
          </Tooltip>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={params.q} onCommit={commitSearch} />
        <MultiFilter label="Stage" options={stageOptions} value={params.stage} onChange={(stage) => setParams({ stage, group: '' })} />
        <MultiFilter label="Connection" options={connectionOptions} value={params.connection} onChange={(connection) => setParams({ connection })} />
        <MultiFilter label="Priority" options={priorityOptions} value={params.priority} onChange={(priority) => setParams({ priority })} />
        <MultiFilter label="Status" options={statusOptions} value={params.status} onChange={(status) => setParams({ status })} />
        <SingleFilter label="Action" options={FLAGS} value={params.flag} onChange={(flag) => setParams({ flag })} allLabel="Any" />
        <SingleFilter label="List" options={(crmMeta?.sheets || []).map((s) => ({ value: s, label: s }))} value={params.sheet} onChange={(sheet) => setParams({ sheet })} allLabel="All lists" />
        <SingleFilter label="Show" options={[{ value: 'all', label: 'Every contact' }]} value={params.scope === 'all' ? 'all' : ''} onChange={(scope) => setParams({ scope: scope || 'url' })} allLabel="With LinkedIn URL" />
        {activeCount ? (
          <Button variant="ghost" onClick={clearFilters}>
            <X /> Clear
          </Button>
        ) : null}
      </div>
    </div>
  );
}
