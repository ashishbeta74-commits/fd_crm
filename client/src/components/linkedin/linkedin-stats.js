'use client';

import { useQuery } from '@tanstack/react-query';
import { AlarmClock, CalendarClock, Eye, Handshake, MessageSquareReply, Send, Target, Trophy, UserPlus } from 'lucide-react';
import { LIVE_MS, api, qk } from '@/lib/api';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { StatTile } from '@/components/dashboard/stat-tile';

export const PERIODS = [
  { key: 'all', label: 'All time' },
  { key: 'today', label: 'Today' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'quarter', label: 'This quarter' },
  { key: 'year', label: 'This year' },
];

/** The workbook's Dashboard tab: funnel counts and rates for the chosen period (by date followed). */
export function LinkedinStats({ period, onPeriod, scope }) {
  const params = { period, scope };
  const { data, isPending } = useQuery({ queryKey: qk.linkedinStats(params), queryFn: () => api.linkedin.stats(params), refetchInterval: LIVE_MS });

  return (
    <section className="grid gap-3" aria-label="LinkedIn outreach numbers">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {isPending ? 'Counting…' : period === 'all' ? `${data.prospects.toLocaleString('en-US')} prospects with a LinkedIn profile, including ones not followed yet` : `${data.prospects.toLocaleString('en-US')} prospects followed in this period`}
        </p>
        <Select value={period} onValueChange={onPeriod}>
          <SelectTrigger className="w-40" aria-label="Period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PERIODS.map((p) => (
              <SelectItem key={p.key} value={p.key}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {isPending ? (
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 10 }, (_, i) => (
            <Skeleton key={i} className="h-[66px] rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-5">
          <StatTile compact label="Followed" value={data.followed} icon={Eye} accent="slate" caption={`of ${data.prospects.toLocaleString('en-US')} in view`} hint="Profiles you followed (step 2)" />
          <StatTile compact label="Requests sent" value={data.requests} icon={Send} accent="blue" caption="connection requests" hint="Connection requests sent (step 4)" />
          <StatTile compact label="Accepted" value={data.accepted} icon={Handshake} accent="blue" caption={`${data.acceptanceRate}% acceptance rate`} hint="Accepted ÷ requests sent. Under 30% means slow down and write better notes." tone={data.requests >= 10 && data.acceptanceRate < 30 ? 'destructive' : 'default'} />
          <StatTile compact label="Replies" value={data.replies} icon={MessageSquareReply} accent="violet" caption={`${data.replyRate}% of accepted`} hint="First replies ÷ accepted connections" />
          <StatTile compact label="Needs identified" value={data.needs} icon={Target} accent="amber" caption={`${data.offers} offers sent`} hint="Prospects whose use case you have written down (step 8), and offers sent (step 9)" />
          <StatTile compact label="Clients won" value={data.won} icon={Trophy} accent="green" caption={`${data.winRate}% win rate · ${data.trials} trial rides`} hint="Client Won ÷ prospects in view" />
          <StatTile compact label="Overdue actions" value={data.overdue} icon={AlarmClock} accent="red" tone={data.overdue > 0 ? 'destructive' : 'default'} caption="clear these first" hint="Open prospects whose next-action date has passed" href="/linkedin?flag=overdue" />
          <StatTile compact label="Due this week" value={data.dueWeek} icon={CalendarClock} accent="violet" caption="next actions in 7 days" hint="Open prospects with a next action due in the next 7 days" href="/linkedin?flag=week" />
          <StatTile compact label="No next action" value={data.noNextAction} icon={CalendarClock} accent="slate" caption="worked, but no date set" hint="Prospects you have touched that have no next-action date - park them with a date or close them" href="/linkedin?flag=none" />
          <StatTile compact label="Not yet followed" value={data.notFollowed} icon={UserPlus} accent="pink" caption="ready to start" hint="Prospects with a LinkedIn URL that you have not followed yet" href="/linkedin?flag=notFollowed" />
        </div>
      )}
    </section>
  );
}
