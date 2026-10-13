'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarCheck, CalendarPlus, ListChecks, Mail, MessageSquare, PhoneCall, PhoneOff, PhoneMissed, Sparkles, ThumbsDown, UserCheck, Users, Voicemail } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StageBadge } from '@/components/badges';
import { useAuth } from '@/components/auth/auth-provider';
import { StatTile, formatCount } from '@/components/dashboard/stat-tile';
import { EmptyState, LIST_ROW, SectionCard } from '@/components/dashboard/section-card';
import { DashboardError, DashboardSkeleton, TILE_GRID } from '@/components/dashboard/dashboard-states';
import { api, qk } from '@/lib/api';
import { livePoll } from '@/lib/live';
import { formatDateTime } from '@/lib/format';
import { zonedDayAt } from '@/lib/tz';
import { cn } from '@/lib/utils';

// Day spans, New York calendar (inclusive).
const RANGES = [
  { key: 'today', label: 'Today', from: 0, to: 0 },
  { key: 'yesterday', label: 'Yesterday', from: -1, to: -1 },
  { key: 'week', label: 'Last 7 days', from: -6, to: 0 },
  { key: 'month', label: 'Last 30 days', from: -29, to: 0 },
];

// What the history list can be narrowed to. `match` picks entries from the feed.
const FEED_FILTERS = [
  { key: 'all', label: 'Everything', match: () => true },
  { key: 'calls', label: 'Calls & follow-ups', match: (e) => e.type === 'call' || e.type === 'followup' },
  { key: 'stage', label: 'Stage changes', match: (e) => e.type === 'stage' },
  { key: 'prospect', label: 'Prospects', match: (e) => e.type === 'stage' && e.toStage === 'prospect' },
  { key: 'not_interested', label: 'Not interested', match: (e) => e.type === 'stage' && e.toStage === 'not_interested' },
  { key: 'voicemail', label: 'Voice mail', match: (e) => e.type === 'stage' && e.toStage === 'voicemail' },
  { key: 'email', label: 'Emails', match: (e) => e.type === 'email' },
  { key: 'notes', label: 'Notes & edits', match: (e) => e.type === 'note' || e.type === 'edit' },
];

const moved = (counts, stage) => counts?.stageContacts?.[stage] || 0;

export function MyDashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [range, setRange] = useState('today');
  const [person, setPerson] = useState('');
  const span = RANGES.find((r) => r.key === range) || RANGES[0];
  const params = { from: zonedDayAt(span.from), to: zonedDayAt(span.to), ...(isAdmin && person ? { user: person } : {}) };

  const { data, isPending, isError, error, refetch, isFetching } = useQuery({
    queryKey: qk.myStats(params),
    queryFn: () => api.myStats(params),
    refetchInterval: livePoll,
    placeholderData: (prev) => prev,
  });

  const selected = data?.team?.find((p) => p.id === data.userId);
  const name = isAdmin && person && selected ? selected.name : 'you';
  const whose = name === 'you' ? 'My' : `${name}'s`;

  return (
    <div className="space-y-6">
      <PageHeader title={`${whose} dashboard`} description={`What ${name === 'you' ? 'you' : name} did - calls, prospects, not interested and more. Counted from the changes made while signed in.`}>
        {isAdmin && data?.team ? (
          <Select value={person || data.userId} onValueChange={(v) => setPerson(v === user?._id ? '' : v)}>
            <SelectTrigger size="sm" className="w-44" aria-label="Team member">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {data.team.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                  {p.id === user?._id ? ' (you)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </PageHeader>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Period">
        {RANGES.map((r) => (
          <Button key={r.key} size="sm" variant={r.key === range ? 'default' : 'outline'} aria-pressed={r.key === range} onClick={() => setRange(r.key)}>
            {r.label}
          </Button>
        ))}
      </div>

      {isPending ? (
        <DashboardSkeleton />
      ) : isError ? (
        <DashboardError title="Couldn't load your dashboard" message={error?.message} onRetry={() => refetch()} busy={isFetching} />
      ) : (
        <div className={cn('space-y-6 transition-opacity', isFetching && data && 'opacity-80')}>
          <Tiles counts={data.counts} />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
            <Feed feed={data.feed} className="xl:col-span-3" />
            <Outcomes counts={data.counts} className="xl:col-span-2" />
          </div>
          <WorkspaceActivity counts={data.workspaces} feed={data.workspaceFeed} />
          {data.team ? <TeamTable team={data.team} selectedId={data.userId} onPick={(id) => setPerson(id === user?._id ? '' : id)} /> : null}
          <p className="text-xs text-muted-foreground">
            Counts start on 25 Sep 2026, when the CRM began recording who made each change. Sheet syncs are not counted for anyone.
          </p>
        </div>
      )}
    </div>
  );
}

function Tiles({ counts }) {
  return (
    <div className={TILE_GRID}>
      <StatTile label="Calls done" value={counts.calls} icon={PhoneCall} accent="blue" caption="contacts called" hint="Contacts you logged a call or follow-up on, or moved to a call result (Started, Connected, Voice Mail, Wrong Number, Hung Up, Not Interested, Prospect)." />
      <StatTile label="Prospects" value={moved(counts, 'prospect')} icon={Sparkles} accent="green" caption="moved to Prospect" />
      <StatTile label="Not interested" value={moved(counts, 'not_interested')} icon={ThumbsDown} accent="red" caption="moved to Not Interested" />
      <StatTile label="Voice mail" value={moved(counts, 'voicemail')} icon={Voicemail} accent="amber" caption="moved to Voice Mail" />
      <StatTile label="Connected" value={moved(counts, 'connected')} icon={UserCheck} accent="violet" caption="moved to Connected" />
      <StatTile label="Contacts worked" value={counts.worked} icon={Users} accent="slate" caption="any call, note, email, stage, reach-out…" />
      <StatTile label="Follow-ups done" value={counts.followUps} icon={CalendarPlus} accent="orange" />
      <StatTile label="Emails sent" value={counts.emails} icon={Mail} accent="pink" />
    </div>
  );
}

const OUTCOME_STAGES = ['started', 'connected', 'voicemail', 'wrong_number', 'hung_up', 'not_interested', 'prospect', 'ready', 'converted', 'future_booking', 'done'];

function Outcomes({ counts, className }) {
  const rows = OUTCOME_STAGES.map((s) => ({ stage: s, n: moved(counts, s) })).filter((r) => r.n > 0);
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <SectionCard title="Stage results" className={className}>
      {rows.length ? (
        <ul className="grid gap-3">
          {rows.map((r) => (
            <li key={r.stage} className="grid grid-cols-[8.5rem_minmax(0,1fr)_2.5rem] items-center gap-3">
              <StageBadge stage={r.stage} />
              <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <span className="block h-full rounded-full bg-brand-gold" style={{ width: `${(r.n / max) * 100}%` }} />
              </span>
              <span className="text-right text-sm font-medium tabular-nums">{formatCount(r.n)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState>
          <PhoneMissed className="size-5" aria-hidden="true" />
          No stage changes in this period yet
        </EmptyState>
      )}
      <p className="mt-4 text-xs text-muted-foreground">Contacts moved into each stage (a contact counts once per stage).</p>
    </SectionCard>
  );
}

function Feed({ feed, className }) {
  const [filter, setFilter] = useState('all');
  const match = (FEED_FILTERS.find((f) => f.key === filter) || FEED_FILTERS[0]).match;
  const items = useMemo(() => feed.filter(match), [feed, match]);
  return (
    <SectionCard
      className={className}
      title={
        <span className="flex flex-wrap items-center justify-between gap-2">
          <span>What was done</span>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger size="sm" className="w-44 font-normal" aria-label="Show">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FEED_FILTERS.map((f) => (
                <SelectItem key={f.key} value={f.key}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </span>
      }
    >
      {items.length ? (
        <ol className="-my-2 max-h-[32rem] overflow-y-auto">
          {items.map((e, i) => (
            <li key={`${e.contactId}-${e.at}-${i}`}>
              <Link href={`/contacts/${e.contactId}`} className={cn(LIST_ROW, 'group flex items-start gap-3')}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {e.name || 'Unnamed contact'}
                    {e.companyName ? <span className="font-normal text-muted-foreground"> · {e.companyName}</span> : null}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    {e.type === 'stage' && e.toStage ? <StageBadge stage={e.toStage} /> : null}
                    <span className="min-w-0 wrap-break-word">{e.type === 'stage' ? '' : e.message}</span>
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatDateTime(e.at)}</span>
                <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState>
          <PhoneOff className="size-5" aria-hidden="true" />
          Nothing here yet for this period
        </EmptyState>
      )}
    </SectionCard>
  );
}

function TeamTable({ team, selectedId, onPick }) {
  const rows = [...team].sort((a, b) => b.calls - a.calls || b.worked - a.worked || a.name.localeCompare(b.name));
  const cols = [
    ['Calls', (p) => p.calls],
    ['Prospects', (p) => moved(p, 'prospect')],
    ['Not int.', (p) => moved(p, 'not_interested')],
    ['Voice mail', (p) => moved(p, 'voicemail')],
    ['Connected', (p) => moved(p, 'connected')],
    ['Worked', (p) => p.worked],
    ['Follow-ups', (p) => p.followUps],
    ['Emails', (p) => p.emails],
    ['Reach-out', (p) => p.workspaces?.reachout?.total || 0],
    ['Reservations', (p) => p.workspaces?.reservations?.total || 0],
  ];
  return (
    <SectionCard title="Team">
      <div className="-mx-5 overflow-x-auto px-5">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              {cols.map(([label]) => (
                <TableHead key={label} className="text-right">
                  {label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => (
              <TableRow key={p.id} data-state={p.id === selectedId ? 'selected' : undefined} className="cursor-pointer" onClick={() => onPick(p.id)}>
                <TableCell className="font-medium">
                  <button type="button" className="text-left hover:underline" onClick={() => onPick(p.id)}>
                    {p.name}
                  </button>
                  <span className="ml-1.5 text-xs text-muted-foreground">{p.userId}</span>
                </TableCell>
                {cols.map(([label, get]) => (
                  <TableCell key={label} className="text-right tabular-nums">
                    {formatCount(get(p))}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </SectionCard>
  );
}

// ---------- Client Reach Out & Reservations: status changes made on those pages (not contacts) ----------

const WS_PAGES = { reachout: { label: 'Client Reach Out', href: '/reach-out' }, reservations: { label: 'Reservations', href: '/reservations' } };
const NONE = { total: 0, byStatus: {}, byType: {} };

function WorkspaceActivity({ counts = {}, feed = [] }) {
  const reach = counts.reachout || NONE;
  const trips = counts.reservations || NONE;
  return (
    <section className="space-y-4" aria-labelledby="ws-activity">
      <h2 id="ws-activity" className="text-base font-semibold">
        Client Reach Out &amp; Reservations
      </h2>
      <div className={TILE_GRID}>
        <StatTile label="Reach-out updates" value={reach.total} icon={ListChecks} accent="green" caption="status / type changes on Client Reach Out" />
        <StatTile label="By call" value={reach.byType.Call || 0} icon={PhoneCall} accent="blue" caption="clients reached by call" />
        <StatTile label="By email" value={reach.byType.Email || 0} icon={Mail} accent="pink" caption="clients reached by email" />
        <StatTile label="By text" value={reach.byType.Text || 0} icon={MessageSquare} accent="violet" caption="clients reached by text" />
        <StatTile label="Reservation updates" value={trips.total} icon={CalendarCheck} accent="amber" caption="status changes on Reservations" />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <WorkspaceFeed feed={feed} className="xl:col-span-3" />
        <SectionCard title="Statuses set" className="xl:col-span-2">
          {Object.keys(reach.byStatus).length || Object.keys(trips.byStatus).length ? (
            <div className="grid gap-5">
              {[
                ['reachout', reach],
                ['reservations', trips],
              ]
                .filter(([, w]) => Object.keys(w.byStatus).length)
                .map(([key, w]) => {
                  const rows = Object.entries(w.byStatus).sort((a, b) => b[1] - a[1]);
                  const max = Math.max(1, ...rows.map((r) => r[1]));
                  return (
                    <div key={key} className="grid gap-2">
                      <p className="text-xs font-medium text-muted-foreground">{WS_PAGES[key].label}</p>
                      <ul className="grid gap-2">
                        {rows.map(([status, n]) => (
                          <li key={status} className="grid grid-cols-[9rem_minmax(0,1fr)_2.5rem] items-center gap-3 text-sm">
                            <span className="truncate">{status}</span>
                            <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                              <span className="block h-full rounded-full bg-primary" style={{ width: `${(n / max) * 100}%` }} />
                            </span>
                            <span className="text-right font-medium tabular-nums">{formatCount(n)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
            </div>
          ) : (
            <EmptyState>
              <ListChecks className="size-5" aria-hidden="true" />
              No status changes on these pages in this period
            </EmptyState>
          )}
        </SectionCard>
      </div>
    </section>
  );
}

function WorkspaceFeed({ feed, className }) {
  return (
    <SectionCard title="Status & reach-out type changes" className={className}>
      {feed.length ? (
        <ol className="-my-2 max-h-[32rem] overflow-y-auto">
          {feed.map((e, i) => {
            const page = WS_PAGES[e.workspace] || { label: e.workspace, href: '/' };
            return (
              <li key={`${e.rowId}-${e.at}-${i}`}>
                <Link href={`${page.href}?q=${encodeURIComponent(e.label || '')}`} className={cn(LIST_ROW, 'group flex items-start gap-3')}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {e.label || 'Unnamed'}
                      <span className="font-normal text-muted-foreground"> · {page.label}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {e.kind === 'type' ? 'Reach-out type: ' : null}
                      {e.from || 'Not set'} → <span className="font-medium text-foreground">{e.to || 'Not set'}</span>
                      {e.reachType && e.kind !== 'type' ? <span> · by {e.reachType.toLowerCase()}</span> : null}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatDateTime(e.at)}</span>
                  <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ol>
      ) : (
        <EmptyState>
          <PhoneOff className="size-5" aria-hidden="true" />
          No status or reach-out type changes in this period yet
        </EmptyState>
      )}
    </SectionCard>
  );
}
