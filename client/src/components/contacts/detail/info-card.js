'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronUp, ExternalLink, Linkedin, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { linkedInHref, linkedInLabel } from '@/components/contacts/list/linkedin-link';
import { CONTACT_FIELD_GROUPS } from '@/lib/constants';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { DetailCard, DetailRow, DetailRows, EmptyNote, Muted, TOUCH_SM } from './detail-card';
import { useClipped } from './use-clipped';

// Same labels as the edit form so the two screens read alike (a row may override its label).
const LABELS = Object.fromEntries(CONTACT_FIELD_GROUPS.flatMap((g) => g.fields.map((f) => [f.key, f.label])));

/**
 * Link that truncates on one line instead of wrapping. The full value shows in a tooltip only when the
 * text is actually cut off - or always, when `tip` is given (e.g. a shortened LinkedIn URL).
 */
function ValueLink({ href, external = false, icon = null, tip, children }) {
  const [textRef, clipped] = useClipped();
  const content = tip || (clipped ? children : null);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          href={href}
          target={external ? '_blank' : undefined}
          rel={external ? 'noreferrer' : undefined}
          className="inline-flex max-w-full items-center gap-1 align-bottom text-primary underline-offset-4 hover:underline"
        >
          {icon}
          <span ref={textRef} className="min-w-0 truncate">
            {children}
          </span>
          {external ? <ExternalLink className="size-3 shrink-0" aria-hidden="true" /> : null}
        </a>
      </TooltipTrigger>
      {content ? <TooltipContent className="max-w-xs break-all">{content}</TooltipContent> : null}
    </Tooltip>
  );
}

const mailLink = (v) => <ValueLink href={`mailto:${v}`}>{v}</ValueLink>;
// Keep digits and "+" so tel: works with formatted numbers like "+1 (555) 010-1234".
const telLink = (v) => <ValueLink href={`tel:${v.replace(/[^\d+]/g, '')}`}>{v}</ValueLink>;
const websiteLink = (v) => (
  <ValueLink href={/^https?:\/\//i.test(v) ? v : `https://${v}`} external>
    {v}
  </ValueLink>
);
// contactL1 is the LinkedIn profile URL: open it in a new tab and show it shortened ("linkedin.com/in/jane").
const linkedInLink = (v) => (
  <ValueLink href={linkedInHref(v)} external tip={v} icon={<Linkedin className="size-3.5 shrink-0" aria-hidden="true" />}>
    {linkedInLabel(v)}
  </ValueLink>
);
const preWrap = (v) => <span className="whitespace-pre-wrap">{v}</span>;

const CONTACT_ROWS = [
  { key: 'email', render: mailLink },
  { key: 'primaryEmail', render: mailLink },
  { key: 'secondaryEmail', render: mailLink },
  { key: 'contactMain', render: telLink },
  { key: 'contactL1', label: 'LinkedIn', render: linkedInLink },
  { key: 'title' },
];

const COMPANY_ROWS = [
  { key: 'companyName' },
  { key: 'website', render: websiteLink },
  { key: 'companyNo', render: telLink },
  { key: 'location' },
  { key: 'companyInfo', render: preWrap },
];

function FieldRows({ contact, rows, emptyText }) {
  const present = rows.filter(({ key }) => contact[key]);
  if (!present.length) return <EmptyNote>{emptyText}</EmptyNote>;
  return (
    <DetailRows>
      {present.map(({ key, label, render }) => (
        <DetailRow key={key} label={label || LABELS[key]}>
          {render ? render(contact[key]) : contact[key]}
        </DetailRow>
      ))}
    </DetailRows>
  );
}

export function ContactInfoCard({ contact }) {
  return (
    <DetailCard title="Contact">
      <FieldRows contact={contact} rows={CONTACT_ROWS} emptyText="No contact details" />
    </DetailCard>
  );
}

export function CompanyCard({ contact }) {
  return (
    <DetailCard title="Company">
      <FieldRows contact={contact} rows={COMPANY_ROWS} emptyText="No company details" />
    </DetailCard>
  );
}

// Columns shown before "Show all N" is pressed.
const PREVIEW_COUNT = 6;

/** Spreadsheet columns that were not mapped to a contact field. Long lists start collapsed. */
export function OtherColumnsCard({ contact }) {
  const [expanded, setExpanded] = useState(false);
  const entries = Object.entries(contact.extra || {});
  if (!entries.length) return null;
  const collapsible = entries.length > PREVIEW_COUNT;
  const shown = collapsible && !expanded ? entries.slice(0, PREVIEW_COUNT) : entries;

  return (
    <DetailCard title="Other columns">
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {shown.map(([key, value], i) => (
          <div
            key={key}
            // Rows revealed by "Show all" ease in; the first ones are there from the start.
            className={cn('min-w-0', i >= PREVIEW_COUNT && 'motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-300')}
          >
            <dt className="text-xs font-medium text-muted-foreground wrap-break-word">{key}</dt>
            <dd className="text-sm wrap-break-word">{value === '' || value == null ? <Muted>—</Muted> : String(value)}</dd>
          </div>
        ))}
      </dl>
      {collapsible ? (
        <Button type="button" variant="ghost" size="sm" className={cn(TOUCH_SM, '-ml-2.5 mt-3')} aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
          {expanded ? (
            <>
              <ChevronUp /> Show less
            </>
          ) : (
            <>
              <ChevronDown /> Show all {entries.length}
            </>
          )}
        </Button>
      ) : null}
    </DetailCard>
  );
}

export function SourceCard({ contact }) {
  const source = contact.source;
  if (!source?.fileName) return null;
  return (
    <DetailCard title="Source">
      <DetailRows>
        <DetailRow label="File">{source.fileName}</DetailRow>
        {source.sheetName ? <DetailRow label="Sheet">{source.sheetName}</DetailRow> : null}
        {source.row != null ? <DetailRow label="Row">{source.row}</DetailRow> : null}
        <DetailRow label="Imported">{formatDateTime(contact.createdAt)}</DetailRow>
      </DetailRows>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline" className={TOUCH_SM}>
          <Link href="/import">
            <Upload /> View import
          </Link>
        </Button>
        {source.batchId ? (
          <Button asChild size="sm" variant="ghost" className={TOUCH_SM}>
            <Link href={`/contacts?batch=${encodeURIComponent(source.batchId)}`}>Other contacts from this import</Link>
          </Button>
        ) : null}
      </div>
    </DetailCard>
  );
}
