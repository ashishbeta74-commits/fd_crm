'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, qk, toQuery } from '@/lib/api';
import { DEFAULT_DIR, DEFAULT_SORT, VIEW_KEYS } from '@/components/contacts/list/contact-filters';

/** Saved Contacts-page views (name + filter params), shared by the toolbar menu and the sidebar. */
export function useViews() {
  return useQuery({ queryKey: qk.views, queryFn: api.views.list, staleTime: 60_000 });
}

/** Only the view keys, without defaults / empties, so views can be compared and stored. */
export function viewParams(params) {
  const out = {};
  for (const k of VIEW_KEYS) {
    const v = params?.[k];
    if (v === undefined || v === null || v === '') continue;
    if (k === 'sort' && v === DEFAULT_SORT) continue;
    if (k === 'dir' && v === DEFAULT_DIR) continue;
    out[k] = String(v);
  }
  return out;
}

const canon = (p) =>
  JSON.stringify(
    Object.keys(p)
      .sort()
      .map((k) => [k, p[k]]),
  );

export const sameParams = (a, b) => canon(viewParams(a)) === canon(viewParams(b));

/** URL of the Contacts page showing a view. */
export const viewHref = (view) => `/contacts${toQuery(viewParams(view.params))}`;

/** The saved view whose params equal the current ones (or null). */
export const findActiveView = (views, params) => (views || []).find((v) => sameParams(v.params, params)) || null;

export function useViewMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: qk.views });
  const onError = (err) => toast.error(err?.message || 'Could not save the view');
  const create = useMutation({ mutationFn: (body) => api.views.create(body), onSuccess: invalidate, onError: (err) => err?.status !== 409 && onError(err) });
  const update = useMutation({ mutationFn: ({ id, data }) => api.views.update(id, data), onSuccess: invalidate, onError });
  const remove = useMutation({ mutationFn: (id) => api.views.remove(id), onSuccess: invalidate, onError });
  const reorder = useMutation({ mutationFn: (ids) => api.views.reorder(ids), onSuccess: invalidate, onError });
  return { create, update, remove, reorder };
}
