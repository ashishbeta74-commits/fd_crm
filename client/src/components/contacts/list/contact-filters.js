'use client';

import { startTransition, useCallback, useMemo, useOptimistic } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export const PAGE_SIZES = [25, 50, 100];
export const DEFAULT_LIMIT = 25;
// Default order = the order contacts were added, i.e. the calling sheet's row order. It never changes
// while someone works the list: logging a call or moving a stage used to bump the row to the top
// (the old default was "last updated"), which lost the caller's place. "Updated" is still a column to sort by.
export const DEFAULT_SORT = 'createdAt';
export const DEFAULT_DIR = 'asc';

export const FOLLOW_UP_OPTIONS = [
  { value: 'any', label: 'Any date' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'none', label: 'None' },
];

export const BOOKING_OPTIONS = [
  { value: 'any', label: 'Any date' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'none', label: 'None' },
];

/** Sortable columns and the direction a fresh click on them starts with. */
export const SORT_COLUMNS = {
  name: 'asc',
  title: 'asc',
  companyName: 'asc',
  stage: 'asc',
  category: 'asc',
  priorityRank: 'desc',
  followUp: 'asc',
  'booking.date': 'asc',
  lastContactedAt: 'desc',
  updatedAt: 'desc',
};

/** Params that narrow the result set (page / limit / sort / dir only shape it). */
export const FILTER_KEYS = ['q', 'stage', 'category', 'country', 'state', 'city', 'sheet', 'batch', 'tag', 'priority', 'followUp', 'booking'];

/** Keys a saved view stores (filters + sort). */
export const VIEW_KEYS = [...FILTER_KEYS, 'sort', 'dir'];

const DEFAULTS = { page: 1, limit: DEFAULT_LIMIT, sort: DEFAULT_SORT, dir: DEFAULT_DIR };

const oneOf = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);

/** URLSearchParams -> the params object GET /api/contacts accepts (the API rejects unknown enum values). */
export function parseListParams(sp) {
  const get = (key) => sp.get(key) || '';
  const page = parseInt(get('page'), 10);
  const limit = parseInt(get('limit'), 10);
  return {
    q: get('q'),
    stage: get('stage'),
    category: get('category'),
    country: get('country'),
    state: get('state'),
    city: get('city'),
    sheet: get('sheet'),
    batch: get('batch'),
    tag: get('tag'),
    priority: get('priority'),
    followUp: oneOf(get('followUp'), FOLLOW_UP_OPTIONS.map((o) => o.value), ''),
    booking: oneOf(get('booking'), BOOKING_OPTIONS.map((o) => o.value), ''),
    page: page > 0 ? page : DEFAULTS.page,
    limit: PAGE_SIZES.includes(limit) ? limit : DEFAULT_LIMIT,
    sort: oneOf(get('sort'), Object.keys(SORT_COLUMNS), DEFAULT_SORT),
    dir: oneOf(get('dir'), ['asc', 'desc'], DEFAULT_DIR),
  };
}

export const activeFilters = (params) => FILTER_KEYS.filter((key) => params[key]);

/**
 * The list state lives in the URL so links like /contacts?stage=prospect work and the
 * back button restores a view. Defaults are omitted from the URL to keep it short.
 */
export function useContactListParams() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // useSearchParams only reflects a router.replace once the navigation resolves (and a newer
  // navigation discards an in-flight one), so two quick writes would each start from the stale
  // URL and the second would drop the first. Show the written URL straight away and build later
  // writes on it; it falls back to the real URL when the navigation commits.
  const [sp, setSp] = useOptimistic(searchParams);
  const params = useMemo(() => parseListParams(sp), [sp]);

  const setParams = useCallback(
    (patch) => {
      const next = new URLSearchParams(sp.toString());
      // Changing anything but the page restarts at page 1.
      if (Object.keys(patch).some((key) => key !== 'page')) next.delete('page');
      for (const [key, value] of Object.entries(patch)) {
        if (value === '' || value == null || value === DEFAULTS[key]) next.delete(key);
        else next.set(key, String(value));
      }
      const qs = next.toString();
      startTransition(() => {
        setSp(next);
        router.replace(qs ? `/contacts?${qs}` : '/contacts', { scroll: false });
      });
    },
    [router, sp, setSp],
  );

  const clearFilters = useCallback(() => setParams(Object.fromEntries(FILTER_KEYS.map((key) => [key, '']))), [setParams]);

  return { params, setParams, clearFilters };
}
