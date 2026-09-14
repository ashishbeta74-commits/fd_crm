'use client';

import { DetailHeader } from './detail-header';
import { CompanyCard, ContactInfoCard, OtherColumnsCard, SourceCard } from './info-card';
import { PipelineCard } from './pipeline-card';
import { NotesCard } from './notes-card';
import { ActivityTimeline } from './activity-timeline';
import { RemindersCard } from '@/components/reminders/reminders-card';
import { LinkedinCard } from './linkedin-card';

/** Full contact page body. `notice` is rendered between the header and the cards (e.g. a refetch error). */
export function ContactDetail({ contact, notice }) {
  return (
    // Fades in as it replaces the skeleton (mounted once per contact id, see the page).
    <div className="mx-auto max-w-6xl motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
      <DetailHeader contact={contact} />
      {notice}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="grid grid-cols-1 content-start gap-6 lg:col-span-2">
          <ContactInfoCard contact={contact} />
          <CompanyCard contact={contact} />
          <PipelineCard contact={contact} />
          <RemindersCard contact={contact} />
          <LinkedinCard contact={contact} />
          <NotesCard contact={contact} />
          <OtherColumnsCard contact={contact} />
          <SourceCard contact={contact} />
        </div>
        <div className="lg:col-span-1">
          <ActivityTimeline contact={contact} />
        </div>
      </div>
    </div>
  );
}
