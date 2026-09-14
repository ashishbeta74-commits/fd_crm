'use client';

import { useState } from 'react';
import Link from 'next/link';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCheck, CircleAlert, GitMerge, Loader2, RefreshCw, Search, SearchX, Undo2, UserX } from 'lucide-react';
import { api, qk } from '@/lib/api';
import { formatDate, pluralize, timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { PriorityBadge, StageBadge, TagList } from '@/components/badges';
import { MergeDialog } from '@/components/contacts/merge-dialog';
import { LinkedInIconLink } from '@/components/contacts/list/linkedin-link';
import { useInvalidateContacts } from '@/hooks/use-contact-mutations';
import { useMeta } from '@/hooks/use-meta';

const ALL = '__all__';
const CRITERIA = [
  { key: 'email', label: 'Same email', hint: 'Any of the three email fields matches' },
  { key: 'phone', label: 'Same phone', hint: 'Same contact phone and a shared name word (office switchboards are ignored)' },
  { key: 'name_company', label: 'Same name + company', hint: 'Name and company match after trimming punctuation' },
  { key: 'name', label: 'Same full name only', hint: 'Lower confidence: the same name at different companies' },
];
const REASON_LABEL = { email: 'email', phone: 'phone', name_company: 'name + company', name: 'name' };
const DEFAULT_BY = ['email', 'phone', 'name_company'];

export function DuplicatesViewFallback() {
  return (
    <div className="grid gap-4" aria-busy>
      <Skeleton className="h-9 w-full max-w-2xl" />
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-40 w-full" />
      ))}
    </div>
  );
}

function ContactCard({ contact, isPrimary }) {
  const email = contact.email || contact.primaryEmail;
  return (
    <div className={cn('grid min-w-0 gap-1 rounded-md border p-3 text-sm', isPrimary && 'border-primary/40 bg-primary/5')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Link href={`/contacts/${contact._id}`} className="truncate font-medium hover:underline" title={contact.name || undefined}>
              {contact.name || '(no name)'}
            </Link>
            <LinkedInIconLink url={contact.contactL1} />
          </div>
          {contact.title ? <p className="truncate text-xs text-muted-foreground">{contact.title}</p> : null}
        </div>
        {isPrimary ? <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">suggested keep</span> : null}
      </div>
      <dl className="grid gap-0.5 text-xs">
        {contact.companyName ? <Row label="Company">{contact.companyName}</Row> : null}
        {email ? <Row label="Email">{email}</Row> : null}
        {contact.secondaryEmail && contact.secondaryEmail !== email ? <Row label="Email 2">{contact.secondaryEmail}</Row> : null}
        {contact.contactMain ? <Row label="Phone">{contact.contactMain}</Row> : null}
        {contact.location ? <Row label="Location">{contact.location}</Row> : null}
        <Row label="List">{contact.source?.sheetName || 'manual'}</Row>
        <Row label="History">
          {pluralize(contact.activityCount || 0, 'entry', 'entries')} · created {formatDate(contact.createdAt)}
        </Row>
      </dl>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <StageBadge stage={contact.stage} />
        <PriorityBadge priority={contact.priority} size="xs" />
        <TagList tags={contact.tags} max={3} size="xs" />
      </div>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate">{children}</dd>
    </div>
  );
}

function DuplicateGroup({ group, onDone }) {
  const [merging, setMerging] = useState(false);
  const invalidate = useInvalidateContacts();
  const qc = useQueryClient();
  const ignore = useMutation({
    mutationFn: (ids) => api.duplicates.ignore(ids),
    onSuccess: () => {
      toast.success('Marked as different people - they will not be shown together again');
      qc.invalidateQueries({ queryKey: ['duplicates'] });
    },
    onError: (err) => toast.error(err?.message || 'Could not save'),
  });
  const ids = group.contacts.map((c) => String(c._id));

  return (
    <li className="rounded-lg border bg-card p-4 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm">
          <span className="font-medium">{pluralize(group.contacts.length, 'contact')}</span>
          <span className="text-muted-foreground"> · matched by {group.reasons.map((r) => REASON_LABEL[r] || r).join(', ')}</span>
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => ignore.mutate(ids)} disabled={ignore.isPending}>
            {ignore.isPending ? <Loader2 className="animate-spin" /> : <UserX />}
            Not duplicates
          </Button>
          <Button size="sm" onClick={() => setMerging(true)}>
            <GitMerge /> Merge…
          </Button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {group.contacts.map((c) => (
          <ContactCard key={c._id} contact={c} isPrimary={String(c._id) === String(group.suggestedPrimaryId)} />
        ))}
      </div>
      {merging ? (
        <MergeDialog
          open
          onOpenChange={(v) => !v && setMerging(false)}
          contacts={group.contacts}
          suggestedPrimaryId={String(group.suggestedPrimaryId)}
          onMerged={() => {
            invalidate();
            onDone?.();
          }}
        />
      ) : null}
    </li>
  );
}

function RecentMerges() {
  const qc = useQueryClient();
  const invalidate = useInvalidateContacts();
  const { data } = useQuery({ queryKey: qk.merges, queryFn: api.duplicates.merges });
  const undo = useMutation({
    mutationFn: (id) => api.duplicates.undoMerge(id),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ['duplicates'] });
      toast.success('Merge undone - the contacts are back');
    },
    onError: (err) => toast.error(err?.message || 'Could not undo'),
  });
  const items = (data?.items || []).slice(0, 8);
  if (!items.length) return null;
  return (
    <section className="rounded-lg border p-4">
      <h2 className="mb-2 text-sm font-semibold">Recent merges</h2>
      <ul className="divide-y text-sm">
        {items.map((m) => (
          <li key={m._id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <div className="min-w-0">
              <Link href={`/contacts/${m.primaryId}`} className="block truncate hover:underline" title={m.summary}>
                {m.summary}
              </Link>
              <p className="text-xs text-muted-foreground" suppressHydrationWarning>
                {pluralize(m.mergedCount, 'contact')} merged · {timeAgo(m.createdAt)}
                {m.undoneAt ? ' · undone' : ''}
              </p>
            </div>
            {!m.undoneAt ? (
              <Button size="xs" variant="outline" onClick={() => undo.mutate(m._id)} disabled={undo.isPending}>
                <Undo2 /> Undo
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function DuplicatesView() {
  const [by, setBy] = useState(DEFAULT_BY);
  const [sheet, setSheet] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const { data: meta } = useMeta();
  const params = { by: by.join(','), sheet, q, page, limit: 25 };
  const { data, isPending, isError, error, isFetching, refetch } = useQuery({
    queryKey: qk.duplicates(params),
    queryFn: () => api.duplicates.find(params),
    placeholderData: keepPreviousData,
    enabled: by.length > 0,
  });
  const toggle = (key) => {
    setBy((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...CRITERIA.map((c) => c.key).filter((k) => k === key || cur.includes(k))]));
    setPage(1);
  };
  const groups = data?.items || [];

  return (
    <div className="grid grid-cols-1 gap-4 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-card p-3">
        <span className="text-sm font-medium">Match by</span>
        {CRITERIA.map((c) => (
          <Tooltip key={c.key}>
            <TooltipTrigger asChild>
              <Label className="flex cursor-pointer items-center gap-2 text-sm font-normal">
                <Checkbox checked={by.includes(c.key)} onCheckedChange={() => toggle(c.key)} />
                {c.label}
              </Label>
            </TooltipTrigger>
            <TooltipContent>{c.hint}</TooltipContent>
          </Tooltip>
        ))}
        <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
          <Select
            value={sheet || ALL}
            onValueChange={(v) => {
              setSheet(v === ALL ? '' : v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-52" aria-label="Limit to a list">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All lists</SelectItem>
              {(meta?.sheets || []).map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative w-full sm:w-56">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              type="search"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Filter groups by name, email…"
              className="pl-8"
              aria-label="Filter duplicate groups"
            />
          </div>
          <Button variant="ghost" size="icon" onClick={() => refetch()} disabled={isFetching} aria-label="Re-scan">
            <RefreshCw className={cn(isFetching && 'animate-spin')} />
          </Button>
        </div>
      </div>

      <p className="flex min-h-5 items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
        {isPending ? (
          'Scanning contacts…'
        ) : data ? (
          <>
            <span>
              {pluralize(data.total, 'group')} · {pluralize(data.contactsInGroups, 'contact')} involved · {data.scanned.toLocaleString('en-US')} scanned
            </span>
            {isFetching ? <Loader2 className="size-3 animate-spin" aria-hidden /> : null}
          </>
        ) : null}
      </p>

      {isError ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Could not scan for duplicates</AlertTitle>
          <AlertDescription>
            <p>{error.message}</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : isPending ? (
        <DuplicatesViewFallback />
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-4 py-16 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-muted">{q || sheet ? <SearchX className="size-6 text-muted-foreground" /> : <CheckCheck className="size-6 text-muted-foreground" />}</span>
          <div>
            <h2 className="text-base font-semibold">{q || sheet ? 'No groups match' : 'No duplicates found'}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{by.length < CRITERIA.length ? 'Try enabling more match criteria above.' : 'Every contact looks unique with the current criteria.'}</p>
          </div>
        </div>
      ) : (
        <ul className="grid gap-4">
          {groups.map((g) => (
            <DuplicateGroup key={g.key} group={g} />
          ))}
        </ul>
      )}

      {data && data.pages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
            Previous
          </Button>
          <span className="text-muted-foreground">
            Page {data.page} of {data.pages}
          </span>
          <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(data.pages, p + 1))} disabled={page >= data.pages}>
            Next
          </Button>
        </div>
      ) : null}

      <RecentMerges />
    </div>
  );
}
