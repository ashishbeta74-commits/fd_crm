'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlarmClock, BellRing, CalendarCheck, CalendarClock, Flag, Linkedin, PhoneCall, PhoneOff, Plus, RefreshCw, Sparkles, Target, ThumbsDown, Upload, Users, Voicemail } from 'lucide-react';
import { toast } from 'sonner';
import { api, qk } from '@/lib/api';
import { isLive, livePoll } from '@/lib/live';
import { STAGE_MAP } from '@/lib/constants';
import { pluralize } from '@/lib/format';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/components/auth/auth-provider';
import { StatTile, formatCount } from '@/components/dashboard/stat-tile';
import { CARD_GRID, DashboardError, DashboardSkeleton, TILE_GRID } from '@/components/dashboard/dashboard-states';
import { PipelineCard } from '@/components/dashboard/breakdown-cards';
import { BookingsCard } from '@/components/dashboard/schedule-cards';
import { ActivityCard } from '@/components/dashboard/activity-card';
import { ImportsCard, isManualSheet } from '@/components/dashboard/imports-card';
import { TemplatesCard } from '@/components/dashboard/templates-card';
import { TodayCard } from '@/components/dashboard/today-card';
import { DailyReport } from '@/components/dashboard/daily-report';
import { StageDaysCard } from '@/components/dashboard/stage-days-card';
import { TIME_ZONE, zonedDateIso, zonedParts } from '@/lib/tz';

// Champagne buttons on the dark hero, like "Reserve" on the site.
const HERO_BUTTON = 'bg-brand-champagne text-brand-espresso hover:bg-brand-gold-bright dark:bg-brand-champagne dark:text-brand-espresso dark:hover:bg-brand-gold-bright';
// Stages that mean the contact was reached at least once (Connected and everything past it).
const REACHED_STAGES = ['connected', 'hung_up', 'not_interested', 'prospect', 'ready', 'converted', 'done', 'future_booking'];

// New York time, whatever the browser's zone (the team calls on New York hours).
const greeting = () => {
  const h = zonedParts().hour;
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};
const today = () => new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: TIME_ZONE });
// The Contacts list filtered to the contacts moved to `stage` today (New York calendar), newest first.
const movedTodayHref = (stage) => {
  const day = zonedDateIso();
  return `/contacts?stage=${stage}&stageFrom=${day}&stageTo=${day}&sort=stageChangedAt&dir=desc`;
};

/** Welcome band: greeting, date, the three numbers that matter right now, and the quick actions. */
function Hero({ data, reminders }) {
  const { user } = useAuth();
  const dueNow = (data.followUps?.overdue || 0) + (data.followUps?.today || 0) + (reminders.overdue || 0) + (reminders.today || 0);
  const kpis = [
    { label: 'Calls today', value: data.contactedToday || 0, icon: PhoneCall, href: '/contacts?sort=lastContactedAt&dir=desc' },
    { label: 'Due now', value: dueNow, icon: AlarmClock, href: '/follow-ups', warn: dueNow > 0 },
    { label: 'Bookings ahead', value: data.byStage?.future_booking || 0, icon: CalendarCheck, href: '/contacts?stage=future_booking' },
  ];
  return (
    <section
      // Same look as the site's hero: espresso to camel, champagne text, gold highlights (in both colour modes).
      className="relative overflow-hidden rounded-2xl border border-brand-gold/30 bg-gradient-to-br from-brand-espresso via-brand-saddle to-brand-camel p-5 text-brand-champagne shadow-md sm:p-6"
      aria-label="Overview"
    >
      {/* soft gold glows for depth; purely decorative */}
      <div className="pointer-events-none absolute -top-16 -right-10 size-56 rounded-full bg-brand-gold/20 blur-2xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-20 left-1/3 size-48 rounded-full bg-brand-gold-bright/10 blur-2xl" aria-hidden="true" />
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="eyebrow text-brand-gold-bright" suppressHydrationWarning>
            {today()}
          </p>
          <h1 className="mt-1.5 font-display text-3xl font-semibold tracking-tight sm:text-4xl" suppressHydrationWarning>
            {greeting()}
            {user?.displayName ? `, ${user.displayName}` : ''}
          </h1>
          <p className="mt-1 text-sm opacity-80">
            {formatCount(data.total)} {data.total === 1 ? 'contact' : 'contacts'} in the pipeline
            {data.sheetCount ? ` from ${pluralize(data.sheetCount, 'sheet')}` : ''}.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild size="sm" className={HERO_BUTTON}>
              <Link href="/contacts?new=1">
                <Plus /> Add contact
              </Link>
            </Button>
            <Button asChild size="sm" className={HERO_BUTTON}>
              <Link href="/follow-ups">
                <CalendarClock /> Follow-ups
              </Link>
            </Button>
            <Button asChild size="sm" className={HERO_BUTTON}>
              <Link href="/import">
                <Upload /> Import
              </Link>
            </Button>
            <Button asChild size="sm" className="bg-[#0a66c2] text-white hover:bg-[#004182] dark:bg-[#0a66c2] dark:text-white dark:hover:bg-[#004182]">
              <Link href="/linkedin">
                <Linkedin /> LinkedIn CRM
              </Link>
            </Button>
          </div>
        </div>
        <ul className="grid grid-cols-3 gap-2 sm:gap-3">
          {kpis.map((k) => (
            <li key={k.label}>
              <Link
                href={k.href}
                className={cn(
                  'flex h-full flex-col gap-1 rounded-xl border border-brand-gold/25 bg-white/10 px-3 py-2.5 backdrop-blur transition-colors hover:bg-white/20',
                  k.warn && 'ring-2 ring-brand-gold-bright/80',
                )}
              >
                <span className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide uppercase opacity-80">
                  <k.icon className="size-3.5" aria-hidden="true" /> {k.label}
                </span>
                <span className="text-2xl font-semibold tabular-nums">{formatCount(k.value)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function Dashboard() {
  const { data, isPending, isError, error, refetch, isFetching } = useQuery({
    queryKey: qk.stats,
    queryFn: api.stats,
    refetchInterval: livePoll,
  });

  // Manual refresh (the Refresh button and the Retry buttons) confirms with a toast.
  // The periodic background refetch stays silent.
  const refresh = async () => {
    const hadData = Boolean(data);
    const result = await refetch();
    if (result.isError) toast.error(result.error?.message || "Couldn't refresh the dashboard");
    else if (result.isSuccess) toast.success(hadData ? 'Dashboard refreshed' : 'Dashboard loaded');
  };

  if (isPending) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <DashboardSkeleton />
      </>
    );
  }
  if (!data) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <DashboardError message={error?.message} onRetry={refresh} busy={isFetching} />
      </>
    );
  }

  const {
    total = 0,
    byStage = {},
    bySheet = [],
    followUps = {},
    reminders = {},
    byPriority = {},
    contactedToday = 0,
    prospectsToday = 0,
    todayByStage = {},
    upcomingBookings = [],
    dueFollowUps = [],
    recentActivity = [],
    recentImports = [],
  } = data;
  const overdue = followUps.overdue || 0;
  const sheetCount = bySheet.filter((s) => !isManualSheet(s)).length;
  const remindersDue = (reminders.overdue || 0) + (reminders.today || 0);
  const priorityCount = (byPriority.urgent || 0) + (byPriority.high || 0);
  const reached = REACHED_STAGES.reduce((n, k) => n + (byStage[k] || 0), 0);

  return (
    <>
      <PageHeader title="Dashboard" description="Where the pipeline stands and who to call next.">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" onClick={refresh} disabled={isFetching}>
              <RefreshCw className={cn(isFetching && 'animate-spin')} aria-hidden="true" />
              Refresh
            </Button>
          </TooltipTrigger>
          <TooltipContent>{isLive() ? 'Updates live as the team works' : 'Auto-refreshes every minute'}</TooltipContent>
        </Tooltip>
      </PageHeader>

      {/* Mounted once the data is in, so it fades in on load and stays put across background refetches. */}
      {/* grid-cols-1 (minmax(0,1fr)) so long single-line text inside the cards truncates instead of widening the page on phones */}
      <div className="grid grid-cols-1 gap-6 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-300">
        {/* A failed background refetch keeps the last data on screen instead of flashing a skeleton. */}
        {isError ? <DashboardError title="Couldn't refresh" message={error.message} onRetry={refresh} busy={isFetching} /> : null}

        <Hero data={{ ...data, sheetCount }} reminders={reminders} />

        <div className={TILE_GRID}>
          <StatTile label="Total contacts" value={total} href="/contacts" icon={Users} accent="slate" caption={sheetCount ? `from ${pluralize(sheetCount, 'sheet')}` : undefined} hint="Every contact in the CRM, across all stages" />
          <StatTile label="Calls today" value={contactedToday} href="/contacts?sort=lastContactedAt&dir=desc" icon={PhoneCall} accent="blue" caption="worked so far today" hint="Contacts with a call or email logged since midnight, or moved out of New today" />
          <StatTile label="Prospects today" value={prospectsToday} href={movedTodayHref('prospect')} icon={Sparkles} accent="violet" caption="moved to Prospect today" hint="Contacts that entered the Prospect stage since midnight" />
          <StatTile label="Voice mails today" value={todayByStage.voicemail || 0} href={movedTodayHref('voicemail')} icon={Voicemail} accent="amber" caption="moved to Voice Mail today" hint="Contacts that entered the Voice Mail stage since midnight and are still there" />
          <StatTile label="Hung up today" value={todayByStage.hung_up || 0} href={movedTodayHref('hung_up')} icon={PhoneOff} accent="orange" caption="moved to Hung Up today" hint="Contacts that entered the Hung Up stage since midnight and are still there" />
          <StatTile label="Not interested today" value={todayByStage.not_interested || 0} href={movedTodayHref('not_interested')} icon={ThumbsDown} accent="slate" caption="moved to Not Interested today" hint="Contacts that entered the Not Interested stage since midnight and are still there" />
          <StatTile label="Total prospects" value={byStage.prospect || 0} href="/contacts?stage=prospect" icon={Target} accent="violet" caption={total ? `${Math.round(((byStage.prospect || 0) / total) * 100)}% of all contacts` : undefined} hint={STAGE_MAP.prospect.description} />
          <StatTile label="Connected so far" value={reached} href={`/contacts?stage=${REACHED_STAGES.join(',')}`} icon={Users} accent="green" caption={total ? `${Math.round((reached / total) * 100)}% of all contacts` : undefined} hint="Contacts reached at least once: in Connected or a stage past it" />
          <StatTile
            label="Follow-ups overdue"
            value={overdue}
            href="/follow-ups?tab=overdue"
            icon={CalendarClock}
            accent="amber"
            tone={overdue > 0 ? 'destructive' : 'default'}
            caption={`${followUps.today || 0} due today`}
            hint="Contacts whose follow-up date is in the past"
          />
          <StatTile label="Due this week" value={followUps.week || 0} href="/follow-ups?tab=week" icon={CalendarClock} accent="violet" caption="in the next 7 days" hint="Follow-ups due today or within the next 7 days" />
          <StatTile
            label="Reminders due"
            value={remindersDue}
            href="/follow-ups?tab=today"
            icon={BellRing}
            accent="orange"
            tone={reminders.overdue > 0 ? 'destructive' : 'default'}
            caption={`${reminders.overdue || 0} overdue`}
            hint="Open reminders that are overdue or due today (see the bell)"
          />
          <StatTile
            label="Urgent + high priority"
            value={priorityCount}
            href="/contacts?priority=urgent,high&sort=priorityRank&dir=desc"
            icon={Flag}
            accent="red"
            tone={reminders.unscheduledPriority > 0 ? 'destructive' : 'default'}
            caption={reminders.unscheduledPriority ? `${reminders.unscheduledPriority} without a follow-up or reminder` : 'all scheduled'}
            hint="Contacts marked Urgent or High. The caption counts the ones that have neither a follow-up date nor an open reminder."
          />
          <StatTile label="Future bookings" value={byStage.future_booking || 0} href="/contacts?stage=future_booking" icon={CalendarCheck} accent="pink" caption="in the Future Booking stage" hint={STAGE_MAP.future_booking.description} />
        </div>

        <DailyReport />

        <div className={CARD_GRID}>
          <TodayCard followUps={dueFollowUps} />
          <StageDaysCard />
          <PipelineCard total={total} byStage={byStage} />
          <BookingsCard items={upcomingBookings} />
          <ActivityCard items={recentActivity} />
          <TemplatesCard />
          <ImportsCard imports={recentImports} bySheet={bySheet} />
        </div>
      </div>
    </>
  );
}
