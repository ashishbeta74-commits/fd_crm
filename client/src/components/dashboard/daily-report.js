'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRightLeft, BellRing, CalendarCheck, CalendarDays, CalendarRange, ChevronLeft, ChevronRight, ClipboardList, Linkedin, Mail, PhoneCall, Sparkles, StickyNote, Target, UserPlus, Users } from 'lucide-react';
import { STAGES, STAGE_STYLES } from '@/lib/constants';
import { api, qk } from '@/lib/api';
import { formatDateTime, pluralize } from '@/lib/format';
import { zonedDateIso } from '@/lib/tz';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { StatTile, formatCount } from '@/components/dashboard/stat-tile';
import { BarList } from '@/components/dashboard/bar-list';
import { EmptyState } from '@/components/dashboard/section-card';

const HISTORY_DAYS = 14;
const MAX_RANGE_DAYS = 366;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// "YYYY-MM-DD" -> parts, treating the key as a plain calendar date (no time zone maths).
const parts = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return { y, m, d, dow, weekday: WEEKDAYS[dow] };
};
const shiftDay = (key, n) => {
  const { y, m, d } = parts(key);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const spanDays = (from, to) => {
  const a = parts(from);
  const b = parts(to);
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000) + 1;
};
/** "Monday, 14 Sep 2026" */
const longDate = (key) => {
  const { y, m, d, weekday } = parts(key);
  return `${weekday}, ${d} ${MONTHS[m - 1]} ${y}`;
};
/** "14 Sep 2026" */
const shortDate = (key) => {
  const { y, m, d } = parts(key);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};
const relativeLabel = (key, today) => {
  if (key === today) return 'Today';
  if (key === shiftDay(today, -1)) return 'Yesterday';
  return parts(key).weekday;
};
const isDay = (s) => typeof s === 'string' && ISO_DAY.test(s);

// Quick ranges for the from - to picker (Monday-based weeks, New York calendar).
const PRESETS = [
  { key: 'week', label: 'This week', range: (t) => [shiftDay(t, -((parts(t).dow + 6) % 7)), t] },
  { key: 'last7', label: 'Last 7 days', range: (t) => [shiftDay(t, -6), t] },
  { key: 'lastWeek', label: 'Last week', range: (t) => {
    const mon = shiftDay(t, -((parts(t).dow + 6) % 7) - 7);
    return [mon, shiftDay(mon, 6)];
  } },
  { key: 'month', label: 'This month', range: (t) => [`${t.slice(0, 8)}01`, t] },
  { key: 'last30', label: 'Last 30 days', range: (t) => [shiftDay(t, -29), t] },
  { key: 'lastMonth', label: 'Last month', range: (t) => {
    const lastOfPrev = shiftDay(`${t.slice(0, 8)}01`, -1);
    return [`${lastOfPrev.slice(0, 8)}01`, lastOfPrev];
  } },
];

/**
 * What is being looked at lives in the URL so a report can be bookmarked or shared:
 * ?day=YYYY-MM-DD for one day, ?from=YYYY-MM-DD&to=YYYY-MM-DD for a custom span.
 * Read once on mount: the dashboard only renders this section on the client (after the stats
 * query resolves), so there is no server-rendered markup to mismatch.
 */
function useReportSelection(today) {
  const [sel, setSel] = useState(() => {
    const fallback = { mode: 'day', day: today, from: shiftDay(today, -6), to: today };
    if (typeof window === 'undefined') return fallback;
    const sp = new URLSearchParams(window.location.search);
    const day = sp.get('day');
    const from = sp.get('from');
    const to = sp.get('to');
    if (isDay(from) && isDay(to) && from <= to && to <= today && spanDays(from, to) <= MAX_RANGE_DAYS) return { ...fallback, mode: 'range', from, to };
    if (isDay(day) && day <= today) return { ...fallback, day };
    return fallback;
  });
  const update = (patch) => {
    setSel((prev) => {
      const next = { ...prev, ...patch };
      if (!isDay(next.day) || next.day > today) next.day = prev.day;
      if (!isDay(next.from) || !isDay(next.to)) return prev;
      if (next.to > today) next.to = today;
      if (next.from > next.to) {
        // typing a "from" past "to" (or the reverse) just drags the other end along
        if (patch.from !== undefined) next.to = next.from;
        else next.from = next.to;
      }
      if (spanDays(next.from, next.to) > MAX_RANGE_DAYS) return prev;
      const url = new URL(window.location.href);
      url.searchParams.delete('day');
      url.searchParams.delete('from');
      url.searchParams.delete('to');
      if (next.mode === 'range') {
        url.searchParams.set('from', next.from);
        url.searchParams.set('to', next.to);
      } else if (next.day !== today) url.searchParams.set('day', next.day);
      window.history.replaceState(window.history.state, '', url);
      return next;
    });
  };
  return [sel, update];
}

/** The last two weeks as a row of buttons, each with the day's call count, so a day is one click away. */
function DayStrip({ days, selected, today, onSelect }) {
  const max = Math.max(1, ...days.map((d) => d.calls));
  return (
    <ol className="flex gap-1 overflow-x-auto pb-1" aria-label="Recent days">
      {days.map((d) => {
        const active = d.date === selected;
        const { d: dom, weekday } = parts(d.date);
        return (
          <li key={d.date} className="shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onSelect(d.date)}
                  aria-pressed={active}
                  className={cn(
                    'flex w-12 flex-col items-center gap-1 rounded-lg border px-1 py-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                    active ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-accent',
                    d.date === today && !active && 'border-primary/50',
                  )}
                >
                  <span className={cn('text-[10px] uppercase', active ? 'opacity-90' : 'text-muted-foreground')}>{weekday.slice(0, 3)}</span>
                  <span className="font-semibold tabular-nums">{dom}</span>
                  {/* a tiny bar: the day's calls relative to the busiest day in the strip */}
                  <span className={cn('block h-1 w-8 overflow-hidden rounded-full', active ? 'bg-primary-foreground/30' : 'bg-muted')} aria-hidden="true">
                    <span className={cn('block h-full rounded-full', active ? 'bg-primary-foreground' : 'bg-primary/70')} style={{ width: `${Math.round((d.calls / max) * 100)}%` }} />
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {longDate(d.date)} · {pluralize(d.calls, 'call')} · {pluralize(d.contactsWorked, 'contact')} worked · {pluralize(d.prospects, 'prospect')}
              </TooltipContent>
            </Tooltip>
          </li>
        );
      })}
    </ol>
  );
}

/** The ten headline numbers, for one day or for a whole span (`span` switches the wording). */
function MetricTiles({ m, span = false }) {
  const when = span ? 'in this range' : 'that day';
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <StatTile compact label="Calls logged" value={m.calls} icon={PhoneCall} accent="blue" caption={`${pluralize(m.contactsCalled || 0, 'contact')}`} hint={`Calls logged ${when}, in the CRM or in a linked sheet (by its calling date). The caption is how many different contacts were called.`} />
      <StatTile compact label="Contacts worked" value={m.contactsWorked} icon={Users} accent="slate" hint={`Different contacts with a call, email, follow-up, note, booking, stage change or LinkedIn step logged ${when}`} />
      <StatTile compact label="Prospects" value={m.prospects} icon={Sparkles} accent="violet" caption={`${m.connected || 0} connected`} hint={`Contacts moved into Prospect ${when}. The caption counts the ones moved into Connected.`} />
      <StatTile compact label="Follow-ups done" value={m.followUpsDone} icon={CalendarCheck} accent="green" hint={`Follow-up rounds marked done ${when}`} />
      <StatTile compact label="Emails sent" value={m.emails} icon={Mail} accent="amber" hint={`Emails sent from the CRM ${when}`} />
      <StatTile compact label="Bookings" value={m.bookings} icon={Target} accent="pink" caption={`${m.converted || 0} converted`} hint={`Bookings made or changed ${when}. The caption counts contacts moved into Converted.`} />
      <StatTile compact label="Notes" value={m.notes} icon={StickyNote} accent="orange" hint={`Notes added ${when}`} />
      <StatTile compact label="LinkedIn steps" value={m.linkedinSteps} icon={Linkedin} accent="blue" hint={`LinkedIn outreach steps logged ${when}`} />
      <StatTile compact label="Reminders" value={m.remindersDone} icon={BellRing} accent="orange" caption={`${m.remindersSet || 0} set`} hint={`Reminders completed ${when}. The caption counts reminders created.`} />
      <StatTile compact label="New contacts" value={m.newContacts} icon={UserPlus} accent="green" caption={m.imports ? `${pluralize(m.imports, 'import')}: ${formatCount(m.importedRows)} new, ${formatCount(m.importUpdatedRows)} updated` : 'no imports'} hint={`Contacts added ${when}, by hand or by import. The caption sums the imports and sheet syncs that added or updated contacts.`} />
    </div>
  );
}

function StageMovesCard({ m, span = false }) {
  const moves = m.stageMoves || {};
  const rows = STAGES.map((s) => ({
    key: s.key,
    label: s.label,
    count: moves[s.key] || 0,
    href: `/contacts?stage=${s.key}&sort=updatedAt&dir=desc`,
    dot: STAGE_STYLES[s.key].dot,
    fill: STAGE_STYLES[s.key].dot,
    hint: `Contacts moved into ${s.label} ${span ? 'in this range' : 'on this day'}`,
  })).filter((r) => r.count > 0);
  return (
    <div className="rounded-xl border bg-card p-4 text-card-foreground shadow-sm">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <ArrowRightLeft className="size-4 text-muted-foreground" aria-hidden="true" /> Stage moves
        <span className="ml-auto text-xs font-normal text-muted-foreground">{pluralize(m.stageChanges || 0, 'change')}</span>
      </h3>
      <div className="mt-3">
        {rows.length ? (
          <BarList rows={rows} />
        ) : (
          <EmptyState>
            <p>No stage changes {span ? 'in this range' : 'that day'}.</p>
          </EmptyState>
        )}
      </div>
    </div>
  );
}

const isQuiet = (m) => !m.calls && !m.contactsWorked && !m.newContacts && !m.imports && !m.remindersDone && !m.remindersSet;

function DayBody({ report }) {
  const m = report.metrics || {};
  const snap = report.snapshot;
  return (
    <>
      <MetricTiles m={m} />
      {isQuiet(m) ? (
        <EmptyState>
          <ClipboardList className="size-6" aria-hidden="true" />
          <p>Nothing was logged on {longDate(report.date)}.</p>
        </EmptyState>
      ) : null}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <StageMovesCard m={m} />
        <div className="rounded-xl border bg-card p-4 text-card-foreground shadow-sm">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Target className="size-4 text-muted-foreground" aria-hidden="true" /> {report.isToday ? 'Pipeline right now' : 'Pipeline at end of day'}
            {snap ? (
              <span className="ml-auto text-xs font-normal text-muted-foreground" suppressHydrationWarning>
                {formatCount(snap.total)} contacts · {report.isToday ? 'live' : `saved ${formatDateTime(report.capturedAt)}`}
              </span>
            ) : null}
          </h3>
          <div className="mt-3">
            {snap ? (
              <>
                <BarList
                  total={snap.total}
                  rows={STAGES.map((s) => ({ key: s.key, label: s.label, count: snap.byStage?.[s.key] || 0, href: `/contacts?stage=${s.key}`, dot: STAGE_STYLES[s.key].dot, fill: STAGE_STYLES[s.key].dot, hint: s.description }))}
                />
                <p className="mt-3 text-xs text-muted-foreground">
                  {pluralize(snap.followUps?.overdue || 0, 'follow-up')} overdue · {snap.followUps?.today || 0} due that day · {pluralize(snap.reminders?.open || 0, 'open reminder')} · {pluralize(snap.upcomingBookings || 0, 'booking')} ahead
                </p>
              </>
            ) : (
              <EmptyState>
                <p>No end-of-day snapshot was saved for this day.</p>
                <p className="text-xs">Snapshots are kept from the day the report feature went live; the activity numbers above still come from each contact&apos;s history.</p>
              </EmptyState>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

const DAY_COLUMNS = [
  { key: 'calls', label: 'Calls' },
  { key: 'contactsWorked', label: 'Worked' },
  { key: 'prospects', label: 'Prospects' },
  { key: 'connected', label: 'Connected' },
  { key: 'followUpsDone', label: 'Follow-ups' },
  { key: 'emails', label: 'Emails' },
  { key: 'stageChanges', label: 'Stage moves' },
];

/** Range mode: totals across the span, stage moves, and one row per day (weekends dimmed, quiet days greyed). */
function RangeBody({ report, onPickDay }) {
  const m = report.metrics || {};
  const days = report.perDay || [];
  const busiest = days.reduce((best, d) => (d.calls > (best?.calls || 0) ? d : best), null);
  const activeDays = days.filter((d) => d.activities > 0).length;
  const totals = Object.fromEntries(DAY_COLUMNS.map((c) => [c.key, days.reduce((n, d) => n + (d[c.key] || 0), 0)]));
  // "Worked" is distinct per day, so its column total is a sum of days, not the span's distinct count shown in the tile.
  totals.contactsWorked = m.contactsWorked ?? totals.contactsWorked;
  return (
    <>
      <MetricTiles m={m} span />
      {isQuiet(m) ? (
        <EmptyState>
          <ClipboardList className="size-6" aria-hidden="true" />
          <p>Nothing was logged between {shortDate(report.from)} and {shortDate(report.to)}.</p>
        </EmptyState>
      ) : null}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <StageMovesCard m={m} span />
        <div className="rounded-xl border bg-card p-4 text-card-foreground shadow-sm">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <CalendarRange className="size-4 text-muted-foreground" aria-hidden="true" /> At a glance
          </h3>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Days in range</dt>
              <dd className="font-semibold tabular-nums">{report.days}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Days with activity</dt>
              <dd className="font-semibold tabular-nums">{activeDays}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Calls per active day</dt>
              <dd className="font-semibold tabular-nums">{activeDays ? formatCount(Math.round((m.calls || 0) / activeDays)) : 0}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Busiest day</dt>
              <dd className="font-semibold">
                {busiest?.calls ? (
                  <button type="button" className="hover:underline" onClick={() => onPickDay(busiest.date)}>
                    {shortDate(busiest.date)} <span className="text-muted-foreground">({pluralize(busiest.calls, 'call')})</span>
                  </button>
                ) : (
                  '—'
                )}
              </dd>
            </div>
          </dl>
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-card text-card-foreground shadow-sm">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Day</TableHead>
              {DAY_COLUMNS.map((c) => (
                <TableHead key={c.key} className="text-right">
                  {c.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {days.map((d) => {
              const { dow } = parts(d.date);
              const weekend = dow === 0 || dow === 6;
              const quiet = !d.activities;
              return (
                <TableRow key={d.date} className={cn(quiet && 'text-muted-foreground', weekend && 'bg-muted/40')}>
                  <TableCell className="whitespace-nowrap">
                    <button type="button" className="font-medium hover:underline" onClick={() => onPickDay(d.date)} title="Open this day's report">
                      {parts(d.date).weekday.slice(0, 3)}, {shortDate(d.date)}
                    </button>
                  </TableCell>
                  {DAY_COLUMNS.map((c) => (
                    <TableCell key={c.key} className="text-right tabular-nums">
                      {d[c.key] ? formatCount(d[c.key]) : <span className="opacity-40">0</span>}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell>Total</TableCell>
              {DAY_COLUMNS.map((c) => (
                <TableCell key={c.key} className="text-right font-semibold tabular-nums">
                  {formatCount(totals[c.key])}
                </TableCell>
              ))}
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </>
  );
}

function ReportSkeleton({ rows = 2 }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading report">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 10 }, (_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Skeleton className="h-56 rounded-xl" />
        <Skeleton className="h-56 rounded-xl" />
      </div>
      {rows > 2 ? <Skeleton className="h-64 rounded-xl" /> : null}
    </div>
  );
}

/**
 * Daily Progress Report: pick any day (New York calendar) and see what the team did on it and where the
 * pipeline stood at the end of it, or pick a custom from - to range and get the same numbers over the span
 * plus a day-by-day table. Today's report is live; past days are the saved end-of-day reports.
 */
export function DailyReport() {
  // The New York date at render time. Re-read every minute so the strip rolls over at midnight.
  const [today, setToday] = useState(() => zonedDateIso());
  useEffect(() => {
    const id = setInterval(() => setToday(zonedDateIso()), 60_000);
    return () => clearInterval(id);
  }, []);
  const [sel, update] = useReportSelection(today);
  const { mode, day, from, to } = sel;
  const isToday = day === today;
  const rangeIsLive = to === today;

  const { data: hist } = useQuery({ queryKey: qk.dailyHistory(HISTORY_DAYS), queryFn: () => api.dailyHistory(HISTORY_DAYS), refetchInterval: 5 * 60_000, staleTime: 60_000 });
  const dayQuery = useQuery({
    queryKey: qk.dailyReport(day),
    queryFn: () => api.dailyReport(day),
    enabled: mode === 'day',
    refetchInterval: isToday ? 60_000 : false,
    staleTime: isToday ? 20_000 : 5 * 60_000,
    placeholderData: (prev) => prev,
  });
  const rangeQuery = useQuery({
    queryKey: qk.dailyRange(from, to),
    queryFn: () => api.dailyRange(from, to),
    enabled: mode === 'range',
    refetchInterval: rangeIsLive ? 2 * 60_000 : false,
    staleTime: rangeIsLive ? 60_000 : 5 * 60_000,
    placeholderData: (prev) => prev,
  });
  const days = useMemo(() => hist?.days || [], [hist]);
  const activePreset = PRESETS.find((p) => {
    const [f, t] = p.range(today);
    return f === from && t === to;
  });
  const pickDay = (d) => update({ mode: 'day', day: d });

  const report = mode === 'day' ? dayQuery.data : rangeQuery.data;
  const query = mode === 'day' ? dayQuery : rangeQuery;
  const stale = report && (mode === 'day' ? report.date !== day : report.from !== from || report.to !== to);

  return (
    <section className="flex flex-col gap-4 rounded-2xl border bg-muted/30 p-4 sm:p-5" aria-label="Daily progress report">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="flex items-center gap-2 font-display text-xl font-semibold tracking-tight">
            <ClipboardList className="size-5 text-primary" aria-hidden="true" /> Daily progress report
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground" suppressHydrationWarning>
            {mode === 'day' ? (
              <>
                <span className="font-medium text-foreground">{relativeLabel(day, today)}</span> · {longDate(day)}
                {report && !report.isToday ? (report.final ? ' · saved report' : ' · counted from history') : ''}
                {report?.isToday ? ' · updating live' : ''}
              </>
            ) : (
              <>
                <span className="font-medium text-foreground">{activePreset?.label || 'Custom range'}</span> · {shortDate(from)} – {shortDate(to)} · {pluralize(spanDays(from, to), 'day')}
                {rangeIsLive ? ' · includes today, updating live' : ''}
              </>
            )}
          </p>
        </div>
        <div className="flex flex-col gap-2 lg:items-end">
          <Tabs value={mode} onValueChange={(v) => update({ mode: v })}>
            <TabsList aria-label="Report type">
              <TabsTrigger value="day">
                <CalendarDays /> Single day
              </TabsTrigger>
              <TabsTrigger value="range">
                <CalendarRange /> From – to
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {mode === 'day' ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => update({ day: shiftDay(day, -1) })} aria-label="Previous day">
                <ChevronLeft />
              </Button>
              <div className="relative">
                <CalendarDays className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input type="date" value={day} max={today} onChange={(e) => e.target.value && update({ day: e.target.value })} aria-label="Report date" className="w-auto pl-8" />
              </div>
              <Button variant="outline" size="icon" onClick={() => update({ day: shiftDay(day, 1) })} disabled={isToday} aria-label="Next day">
                <ChevronRight />
              </Button>
              <Button variant={isToday ? 'secondary' : 'outline'} size="sm" onClick={() => update({ day: today })} disabled={isToday}>
                Today
              </Button>
              <Button variant="outline" size="sm" onClick={() => update({ day: shiftDay(today, -1) })} disabled={day === shiftDay(today, -1)}>
                Yesterday
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2 lg:items-end">
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  From
                  <Input type="date" value={from} max={to} onChange={(e) => e.target.value && update({ from: e.target.value })} aria-label="From date" className="w-auto" />
                </label>
                <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  to
                  <Input type="date" value={to} min={from} max={today} onChange={(e) => e.target.value && update({ to: e.target.value })} aria-label="To date" className="w-auto" />
                </label>
              </div>
              <div className="flex flex-wrap gap-1.5" aria-label="Quick ranges">
                {PRESETS.map((p) => (
                  <Button
                    key={p.key}
                    size="sm"
                    variant={activePreset?.key === p.key ? 'secondary' : 'outline'}
                    onClick={() => {
                      const [f, t] = p.range(today);
                      update({ from: f, to: t });
                    }}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {mode === 'day' ? days.length ? <DayStrip days={days} selected={day} today={today} onSelect={(d) => update({ day: d })} /> : <Skeleton className="h-16 rounded-lg" /> : null}

      {query.isPending || !report ? (
        query.isError ? (
          <EmptyState>
            <p>Could not load the report: {query.error?.message}</p>
          </EmptyState>
        ) : (
          <ReportSkeleton rows={mode === 'range' ? 3 : 2} />
        )
      ) : (
        <div className={cn('flex flex-col gap-4', stale && 'opacity-60')}>{mode === 'day' ? <DayBody report={report} /> : <RangeBody report={report} onPickDay={pickDay} />}</div>
      )}
    </section>
  );
}
