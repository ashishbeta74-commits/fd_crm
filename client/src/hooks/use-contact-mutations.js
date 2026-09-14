'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';

/** Invalidate every query that shows contact data (lists, detail, dashboard, follow-ups). */
export function useInvalidateContacts() {
  const qc = useQueryClient();
  return (id) => {
    qc.invalidateQueries({ queryKey: ['contacts'] });
    qc.invalidateQueries({ queryKey: ['stats'] });
    qc.invalidateQueries({ queryKey: ['followups'] });
    qc.invalidateQueries({ queryKey: ['meta'] });
    qc.invalidateQueries({ queryKey: ['reminders'] });
    qc.invalidateQueries({ queryKey: ['duplicates'] });
    if (id) qc.invalidateQueries({ queryKey: ['contact', id] });
  };
}

const showError = (err) => toast.error(err?.message || 'Something went wrong');

export function useCreateContact() {
  const invalidate = useInvalidateContacts();
  return useMutation({
    mutationFn: (data) => api.contacts.create(data),
    onSuccess: () => invalidate(),
    // 409 duplicates are handled by the caller (ContactDialog) so no toast here
    onError: (err) => {
      if (err?.status !== 409) showError(err);
    },
  });
}

export function useUpdateContact() {
  const invalidate = useInvalidateContacts();
  return useMutation({
    mutationFn: ({ id, data }) => api.contacts.update(id, data),
    onSuccess: (doc) => invalidate(doc._id),
    onError: showError,
  });
}

/** POST /contacts/:id/activities - log a call or add a note (optionally moving stage / setting dates). */
export function useLogActivity() {
  const invalidate = useInvalidateContacts();
  return useMutation({
    mutationFn: ({ id, data }) => api.contacts.addActivity(id, data),
    onSuccess: (doc) => invalidate(doc._id),
    onError: showError,
  });
}

/** DELETE /contacts/:id/followups/last - take back the most recent "Add follow-up" (counter - 1). */
export function useRemoveLastFollowUp() {
  const invalidate = useInvalidateContacts();
  return useMutation({
    mutationFn: (id) => api.contacts.removeLastFollowUp(id),
    onSuccess: (doc) => invalidate(doc._id),
    onError: showError,
  });
}

export function useRemoveActivity() {
  const invalidate = useInvalidateContacts();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, activityId }) => api.contacts.removeActivity(id, activityId),
    // deleting a logged LinkedIn step changes the stage and the LinkedIn counters too
    onSuccess: (doc) => {
      invalidate(doc._id);
      qc.invalidateQueries({ queryKey: ['linkedin'] });
    },
    onError: showError,
  });
}

export function useDeleteContact() {
  const invalidate = useInvalidateContacts();
  return useMutation({
    mutationFn: (id) => api.contacts.remove(id),
    onSuccess: (_, id) => {
      invalidate(id);
      toast.success('Contact deleted');
    },
    onError: showError,
  });
}

export function useBulkContacts() {
  const invalidate = useInvalidateContacts();
  return useMutation({
    mutationFn: (body) => api.contacts.bulk(body),
    onSuccess: () => invalidate(),
    onError: showError,
  });
}
