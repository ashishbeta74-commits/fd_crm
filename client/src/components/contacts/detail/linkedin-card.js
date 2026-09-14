'use client';

import Link from 'next/link';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatDate, timeAgo } from '@/lib/format';
import { liConnectionLabel, liStage, money } from '@/lib/linkedin';
import { linkedInHref } from '@/components/contacts/list/linkedin-link';
import { LinkedinActions, LinkedinStageBadge, LinkedinStatusSelect, NextActionCell } from '@/components/linkedin/linkedin-table';
import { DetailCard, DetailRow, DetailRows, Muted, TOUCH_SM } from './detail-card';

const DATES = [
  ['dateFollowed', 'Followed'],
  ['dateEngaged', 'Engaged'],
  ['requestSentAt', 'Request sent'],
  ['acceptedAt', 'Accepted'],
  ['welcomeSentAt', 'Welcome sent'],
  ['firstReplyAt', 'First reply'],
  ['offerSentAt', 'Offer sent'],
  ['trialRideDate', 'Trial ride'],
  ['convertedDate', 'Client won'],
];

/** The contact's row in the LinkedIn CRM, with the same "log a step" actions. */
export function LinkedinCard({ contact }) {
  const li = contact.linkedin || {};
  const profile = linkedInHref(contact.contactL1);
  const logged = DATES.filter(([k]) => li[k]);
  return (
    <DetailCard title="LinkedIn outreach">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <LinkedinStageBadge stage={liStage(contact)} />
        {li.connectionStatus ? <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">{liConnectionLabel(li.connectionStatus)}</span> : null}
        {li.lastTouchAt ? (
          <span className="text-xs text-muted-foreground" suppressHydrationWarning>
            last touch {timeAgo(li.lastTouchAt)} · {li.touchpoints} touch{li.touchpoints === 1 ? '' : 'es'}
          </span>
        ) : null}
      </div>
      <DetailRows>
        <DetailRow label="Status">
          <LinkedinStatusSelect contact={contact} className="w-40" />
        </DetailRow>
        <DetailRow label="Next action">
          <NextActionCell contact={contact} />
        </DetailRow>
        <DetailRow label="Need / use case">{li.need || <Muted>—</Muted>}</DetailRow>
        <DetailRow label="Est. monthly value">{li.monthlyValue ? money(li.monthlyValue) : <Muted>—</Muted>}</DetailRow>
        <DetailRow label="Dates logged">
          {logged.length ? (
            <ul className="grid gap-0.5 text-sm">
              {logged.map(([k, label]) => (
                <li key={k}>
                  <span className="text-muted-foreground">{label}: </span>
                  {formatDate(li[k])}
                </li>
              ))}
            </ul>
          ) : (
            <Muted>Nothing logged yet</Muted>
          )}
        </DetailRow>
        {li.notes ? (
          <DetailRow label="LinkedIn notes">
            <span className="whitespace-pre-wrap">{li.notes}</span>
          </DetailRow>
        ) : null}
      </DetailRows>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <LinkedinActions contact={contact} />
        {profile ? (
          <Button asChild size="sm" variant="ghost" className={TOUCH_SM}>
            <a href={profile} target="_blank" rel="noreferrer">
              <ExternalLink /> Profile
            </a>
          </Button>
        ) : null}
        <Button asChild size="sm" variant="ghost" className={TOUCH_SM}>
          <Link href="/linkedin">Open LinkedIn CRM</Link>
        </Button>
      </div>
    </DetailCard>
  );
}
