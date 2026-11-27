'use client';

import { useQuery } from '@tanstack/react-query';
import { BarChart3, CalendarCheck, CircleDollarSign, Mail, Phone } from 'lucide-react';
import { api } from '@/lib/api';
import { livePoll } from '@/lib/live';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { BarList } from '@/components/dashboard/bar-list';
import { SectionCard } from '@/components/dashboard/section-card';
import { StatTile } from '@/components/dashboard/stat-tile';

const pct = (n, total) => (total ? `${Math.round((n / total) * 100)}%` : '0%');
const dayLabel = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const hourLabel = (h) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;

/** Vertical bars scaled to the tallest; every bar has a tooltip, and the first / middle / last get an axis label. */
function Columns({ bars, label }) {
  const max = Math.max(1, ...bars.map((b) => b.count));
  const marks = new Set([0, Math.floor((bars.length - 1) / 2), bars.length - 1]);
  return (
    <div role="img" aria-label={label}>
      <div className="flex h-40 items-end gap-px sm:gap-0.5">
        {bars.map((b) => (
          <Tooltip key={b.key}>
            <TooltipTrigger asChild>
              <div className="group flex h-full min-w-0 flex-1 items-end">
                <span className="block w-full rounded-t-sm bg-primary/70 transition-colors group-hover:bg-primary" style={{ height: `${b.count ? Math.max(3, (b.count / max) * 100) : 0}%` }} />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              {b.label}: {b.count} price check{b.count === 1 ? '' : 's'}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
      <div className="mt-1.5 flex text-[11px] text-muted-foreground tabular-nums">
        {bars.map((b, i) => (
          <span key={b.key} className="min-w-0 flex-1 overflow-visible whitespace-nowrap text-center first:text-left last:text-right">
            {marks.has(i) ? b.label : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

const bars = (rows) => rows.map((r) => ({ key: r.label, ...r }));

/** BMC Price Checks charts: who checks, when, from / to where, which trips and cars. Counts every price check, past rides too. */
export function PriceCheckCharts() {
  const { data, isPending, isError } = useQuery({ queryKey: ['workspace', 'pricechecks', 'insights'], queryFn: () => api.workspaces.insights('pricechecks'), refetchInterval: livePoll });
  return (
    <details open className="group/charts mb-5 rounded-lg border bg-card/40 px-4 py-3">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium select-none">
        <BarChart3 className="size-4 text-muted-foreground" aria-hidden />
        Charts
        <span className="font-normal text-muted-foreground">{data ? `· all ${data.total} price checks, past rides included` : ''}</span>
        <span className="ml-auto text-xs font-normal text-muted-foreground group-open/charts:hidden">Show</span>
        <span className="ml-auto hidden text-xs font-normal text-muted-foreground group-open/charts:inline">Hide</span>
      </summary>
      {isError ? (
        <p className="mt-3 text-sm text-destructive">Could not load the charts. Reload the page to try again.</p>
      ) : isPending ? (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="mt-4 grid gap-4">
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            <StatTile compact label="Booked" value={data.booked} icon={CalendarCheck} accent="green" caption={`${pct(data.booked, data.total)} of price checks`} />
            <StatTile compact label="Left a phone" value={data.withPhone} icon={Phone} accent="blue" caption={pct(data.withPhone, data.total)} />
            <StatTile compact label="Left an email" value={data.withEmail} icon={Mail} accent="violet" caption={pct(data.withEmail, data.total)} />
            <StatTile compact label="Typical Economy quote" value={data.medianEconomy} display={data.medianEconomy ? `$${data.medianEconomy}` : '—'} icon={CircleDollarSign} accent="amber" caption="median price shown" />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <SectionCard title="Price checks per day">
              <Columns bars={data.days.map((d) => ({ key: d.date, label: dayLabel(d.date), count: d.count }))} label="Price checks per day" />
            </SectionCard>
            <SectionCard title="Time of day they check (NY)">
              <Columns bars={data.hours.map((count, h) => ({ key: h, label: hourLabel(h), count }))} label="Price checks by hour of the day, New York time" />
            </SectionCard>
            <SectionCard title="Top pickup places">
              <BarList rows={bars(data.pickups)} />
            </SectionCard>
            <SectionCard title="Top drop-off places">
              <BarList rows={bars(data.dropoffs)} />
            </SectionCard>
            <SectionCard title="Rides by airport">
              <BarList rows={bars(data.airports)} />
            </SectionCard>
            <SectionCard title="Trip type">
              <BarList rows={bars(data.trips)} />
            </SectionCard>
            <SectionCard title="Car picked">
              <BarList rows={bars(data.cars)} />
            </SectionCard>
            <SectionCard title="How far ahead they check">
              <BarList rows={bars(data.lead)} />
            </SectionCard>
          </div>
        </div>
      )}
    </details>
  );
}
