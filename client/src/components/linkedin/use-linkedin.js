'use client';

import { createContext, useContext } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, qk } from '@/lib/api';
import { pluralize } from '@/lib/format';
import { useInvalidateContacts } from '@/hooks/use-contact-mutations';

/** The ticked prospects (useSelection). A change made on a ticked prospect goes to every ticked one. */
export const LinkedinSelectionContext = createContext(null);

/** The ticked ids when this contact is one of several ticked, else null (just this contact). */
export function useTickedIds(id) {
  const sel = useContext(LinkedinSelectionContext);
  return sel && sel.ids.length > 1 && sel.selected.has(id) ? sel.ids : null;
}

/** Toast for a change on the ticked prospects: "<label> for N prospects", plus the ones it could not do. */
export function bulkToast(r, label) {
  if (r.updated) toast.success(`${label} for ${pluralize(r.updated, 'prospect')}`);
  else if (!r.errors?.length) toast.info('Nothing to change on the ticked prospects');
  if (r.errors?.length) toast.warning(`Skipped ${pluralize(r.matched - r.updated, 'prospect')}: ${[...new Set(r.errors)].join('; ')}`);
}

/** Stage / persona / step lists and the playbook text from the API (rarely changes). */
export function useLinkedinMeta() {
  return useQuery({ queryKey: qk.linkedinMeta, queryFn: api.linkedin.meta, staleTime: 30 * 60_000 });
}

/** Every query that shows LinkedIn data: the prospect list, the stats, the contact page, the CRM contact lists. */
export function useInvalidateLinkedin() {
  const qc = useQueryClient();
  const invalidateContacts = useInvalidateContacts();
  return (contactId) => {
    qc.invalidateQueries({ queryKey: ['linkedin'] });
    invalidateContacts(contactId);
  };
}

const showError = (err) => toast.error(err?.message || 'Something went wrong');

export function useUpdateLinkedin() {
  const invalidate = useInvalidateLinkedin();
  return useMutation({
    mutationFn: ({ id, data }) => api.linkedin.update(id, data),
    onSuccess: (doc) => invalidate(doc._id),
    onError: showError,
  });
}

export function useLogLinkedinStep() {
  const invalidate = useInvalidateLinkedin();
  return useMutation({
    mutationFn: ({ id, data }) => api.linkedin.step(id, data),
    onSuccess: (doc) => invalidate(doc._id),
    onError: showError,
  });
}

/** Delete contacts (from the whole CRM, not only LinkedIn); clears the ticks. */
export function useDeleteContacts() {
  const invalidate = useInvalidateLinkedin();
  const sel = useContext(LinkedinSelectionContext);
  return useMutation({
    mutationFn: (ids) => api.contacts.bulk({ ids, action: 'delete' }),
    onSuccess: () => {
      sel?.clear();
      invalidate();
    },
    onError: showError,
  });
}

export function useBulkLinkedin() {
  const invalidate = useInvalidateLinkedin();
  return useMutation({
    mutationFn: (body) => api.linkedin.bulk(body),
    onSuccess: () => invalidate(),
    onError: showError,
  });
}
