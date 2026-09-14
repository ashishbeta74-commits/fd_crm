'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, qk } from '@/lib/api';
import { useInvalidateContacts } from '@/hooks/use-contact-mutations';

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

export function useBulkLinkedin() {
  const invalidate = useInvalidateLinkedin();
  return useMutation({
    mutationFn: (body) => api.linkedin.bulk(body),
    onSuccess: () => invalidate(),
    onError: showError,
  });
}
