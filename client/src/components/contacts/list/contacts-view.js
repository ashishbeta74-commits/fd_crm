'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CircleAlert, Loader2, Plus, SearchX, Upload, Users } from 'lucide-react';
import { LIVE_MS, api, qk } from '@/lib/api';
import { pluralize } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { ContactDialog } from '@/components/contacts/contact-dialog';
import { useStageChange } from '@/components/contacts/stage-controls';
import { ContactsToolbar } from '@/components/contacts/list/contacts-toolbar';
import { ContactsTable } from '@/components/contacts/list/contacts-table';
import { ContactsCards } from '@/components/contacts/list/contacts-cards';
import { ContactsPagination } from '@/components/contacts/list/contacts-pagination';
import { BulkActionsBar } from '@/components/contacts/list/bulk-actions-bar';
import { FILTER_KEYS, SORT_COLUMNS, activeFilters, useContactListParams } from '@/components/contacts/list/contact-filters';
import { useSelection } from '@/components/contacts/list/use-selection';

// Content blocks fade (and nudge) in when they mount; nothing moves for reduced-motion users.
const ENTER = 'motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300';
const ENTER_UP = `${ENTER} motion-safe:slide-in-from-bottom-2`;

function EmptyState({ icon: Icon, title, description, children }) {
  return (
    <div className={`flex flex-col items-center gap-4 rounded-lg border border-dashed px-4 py-16 text-center ${ENTER_UP}`}>
      <span className="flex size-12 items-center justify-center rounded-full bg-muted">
        <Icon className="size-6 text-muted-foreground" aria-hidden />
      </span>
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {children ? <div className="flex flex-wrap justify-center gap-2">{children}</div> : null}
    </div>
  );
}

/** Rendered by the page's Suspense boundary while useSearchParams resolves. Mirrors the toolbar layout. */
export function ContactsViewFallback() {
  return (
    <div className="flex flex-col gap-4" aria-busy>
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 w-full sm:w-64" />
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-9 w-28" />
        ))}
        <div className="flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-32" />
        </div>
      </div>
      <Skeleton className="h-4 w-32" />
      <ContactsTable loading />
    </div>
  );
}

export function ContactsView() {
  const { params, setParams, clearFilters } = useContactListParams();
  const filters = activeFilters(params);
  const { data, error, isPending, isError, isFetching, isPlaceholderData, refetch } = useQuery({
    queryKey: qk.contacts(params),
    queryFn: () => api.contacts.list(params),
    placeholderData: keepPreviousData,
    refetchInterval: LIVE_MS,
  });
  const selection = useSelection(FILTER_KEYS.map((key) => params[key]).join('|'));
  const { changeStage, stageDialog, pending: stagePending } = useStageChange();
  // /contacts?new=1 (dashboard shortcut) opens the "Add contact" dialog straight away.
  const searchParams = useSearchParams();
  const [adding, setAdding] = useState(() => searchParams.get('new') === '1');

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  const onSort = (column) => {
    const dir = params.sort === column ? (params.dir === 'asc' ? 'desc' : 'asc') : SORT_COLUMNS[column];
    setParams({ sort: column, dir });
  };
  // useUpdateContact already toasts failures; swallow the rejection so the row handler stays quiet.
  const onStageChange = (contact, stage) => changeStage(contact, stage).catch(() => {});

  let content;
  if (isError) {
    content = (
      <Alert variant="destructive" className={ENTER}>
        <CircleAlert />
        <AlertTitle>Could not load contacts</AlertTitle>
        <AlertDescription>
          <p>{error.message}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="animate-spin" aria-hidden /> : null}
            {isFetching ? 'Retrying…' : 'Retry'}
          </Button>
        </AlertDescription>
      </Alert>
    );
  } else if (isPending) {
    content = (
      <>
        <div className="md:hidden">
          <ContactsCards loading />
        </div>
        <div className="hidden md:block">
          <ContactsTable loading sort={params.sort} dir={params.dir} onSort={onSort} />
        </div>
      </>
    );
  } else if (total === 0 && filters.length === 0) {
    content = (
      <EmptyState icon={Users} title="No contacts yet" description="Import a spreadsheet or add your first contact to get started.">
        <Button asChild variant="outline">
          <Link href="/import">
            <Upload />
            Import
          </Link>
        </Button>
        <Button onClick={() => setAdding(true)}>
          <Plus />
          Add contact
        </Button>
      </EmptyState>
    );
  } else if (total === 0) {
    content = (
      <EmptyState icon={SearchX} title="No contacts match" description="Try a different search or remove some filters.">
        <Button variant="outline" onClick={clearFilters}>
          Clear filters
        </Button>
      </EmptyState>
    );
  } else if (items.length === 0) {
    // The page index outlived the data (e.g. contacts were deleted from the last page).
    content = (
      <EmptyState icon={SearchX} title="Nothing on this page" description={`There are only ${pluralize(data.pages, 'page')} of results.`}>
        <Button variant="outline" onClick={() => setParams({ page: 1 })}>
          Go to first page
        </Button>
      </EmptyState>
    );
  } else {
    content = (
      <div className={`flex flex-col gap-4 ${ENTER}`}>
        {/* Cards on phones / small tablets, the frozen-column table from md up. */}
        <div className="md:hidden">
          <ContactsCards items={items} dimmed={isPlaceholderData} selected={selection.selected} onToggle={selection.toggle} onStageChange={onStageChange} stagePending={stagePending} />
        </div>
        <div className="hidden md:block">
          <ContactsTable
            items={items}
            dimmed={isPlaceholderData}
            sort={params.sort}
            dir={params.dir}
            onSort={onSort}
            selected={selection.selected}
            onToggle={selection.toggle}
            onTogglePage={selection.toggleMany}
            onStageChange={onStageChange}
            stagePending={stagePending}
          />
        </div>
        <ContactsPagination
          page={data.page}
          pages={data.pages}
          limit={data.limit}
          total={total}
          count={items.length}
          onPage={(page) => setParams({ page })}
          onLimit={(limit) => setParams({ limit })}
        />
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-4 ${ENTER}`}>
      <ContactsToolbar params={params} setParams={setParams} clearFilters={clearFilters} filterCount={filters.length} onAdd={() => setAdding(true)} />

      <div className="flex min-h-5 flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
          <span>{isPending ? 'Loading contacts…' : filters.length ? `${total} matching ${total === 1 ? 'contact' : 'contacts'}` : pluralize(total, 'contact')}</span>
          {isFetching && !isPending ? (
            <span className="inline-flex items-center gap-1 text-xs motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200">
              <Loader2 className="size-3 animate-spin" aria-hidden />
              Updating…
            </span>
          ) : null}
        </p>
      </div>

      {selection.ids.length ? <BulkActionsBar ids={selection.ids} onDone={selection.clear} /> : null}

      {content}

      {stageDialog}
      <ContactDialog open={adding} onOpenChange={setAdding} />
    </div>
  );
}
