'use client';

import Link from 'next/link';
import { ArrowRight, CalendarClock, CalendarPlus, Pencil, Phone, StickyNote, Upload } from 'lucide-react';
import { StageBadge } from '@/components/badges';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatDateTime, timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import { EmptyState, LIST_ROW, SectionCard, TruncatedText } from '@/components/dashboard/section-card';

// Mirrors ACTIVITY_TYPES on the server. Unknown types fall back to a plain note.
const TYPES = {
  call: { icon: Phone, label: 'Call logged' },
  followup: { icon: CalendarPlus, label: 'Follow-up done' },
  note: { icon: StickyNote, label: 'Note added' },
  stage: { icon: ArrowRight, label: 'Stage changed' },
  booking: { icon: CalendarClock, label: 'Booking' },
  edit: { icon: Pencil, label: 'Contact edited' },
  import: { icon: Upload, label: 'Imported' },
};

export function ActivityCard({ items }) {
  return (
    <SectionCard title="Recent activity">
      {items.length ? (
        <ul className="-my-2 flex flex-col">
          {items.map(({ contactId, name, companyName, activity }, i) => {
            const { icon: Icon, label } = TYPES[activity.type] || { icon: StickyNote, label: activity.type };
            const stageChange = activity.type === 'stage' && activity.toStage;
            const contactName = name || 'Unnamed contact';
            return (
              <li key={`${contactId}-${activity.at}-${i}`}>
                <div className={cn(LIST_ROW, 'flex gap-3')}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <Icon className="size-3.5" aria-hidden="true" />
                        <span className="sr-only">{label}</span>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{label}</TooltipContent>
                  </Tooltip>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <Link href={`/contacts/${contactId}`} title={contactName} className="truncate text-sm font-medium hover:underline">
                        {contactName}
                      </Link>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span suppressHydrationWarning className="shrink-0 text-xs text-muted-foreground">
                            {timeAgo(activity.at)}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>{formatDateTime(activity.at)}</TooltipContent>
                      </Tooltip>
                    </div>
                    {companyName ? (
                      <p className="truncate text-xs text-muted-foreground" title={companyName}>
                        {companyName}
                      </p>
                    ) : null}
                    <TruncatedText text={activity.message} className="mt-0.5 line-clamp-2 text-sm" />
                    {stageChange ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        <StageBadge stage={activity.toStage} />
                      </div>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState>
          <p>No activity yet.</p>
        </EmptyState>
      )}
    </SectionCard>
  );
}
