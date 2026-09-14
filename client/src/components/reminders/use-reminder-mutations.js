'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { zonedDayAt } from '@/lib/tz';

/** A reminder change touches the reminders lists, the bell, the follow-ups page, the dashboard and the contact. */
export function useInvalidateReminders() {
  const qc = useQueryClient();
  return (contactId) => {
    qc.invalidateQueries({ queryKey: ['reminders'] });
    qc.invalidateQueries({ queryKey: ['followups'] });
    qc.invalidateQueries({ queryKey: ['stats'] });
    if (contactId) qc.invalidateQueries({ queryKey: ['contact', String(contactId)] });
  };
}

const showError = (err) => toast.error(err?.message || 'Something went wrong');

export function useCreateReminder() {
  const invalidate = useInvalidateReminders();
  return useMutation({
    mutationFn: (body) => api.reminders.create(body),
    onSuccess: (r) => invalidate(r.contactId),
    onError: showError,
  });
}

export function useUpdateReminder() {
  const invalidate = useInvalidateReminders();
  return useMutation({
    mutationFn: ({ id, data }) => api.reminders.update(id, data),
    onSuccess: (r) => invalidate(r.contactId),
    onError: showError,
  });
}

export function useSnoozeReminder() {
  const invalidate = useInvalidateReminders();
  return useMutation({
    mutationFn: ({ id, data }) => api.reminders.snooze(id, data),
    onSuccess: (r) => invalidate(r.contactId),
    onError: showError,
  });
}

export function useDeleteReminder() {
  const invalidate = useInvalidateReminders();
  return useMutation({
    mutationFn: ({ id }) => api.reminders.remove(id),
    onSuccess: (_, vars) => invalidate(vars.contactId),
    onError: showError,
  });
}

/** Snooze presets shared by the card, the bell and the follow-ups row. */
export const SNOOZE_OPTIONS = [
  { label: 'In 1 hour', minutes: 60 },
  { label: 'In 3 hours', minutes: 180 },
  { label: 'Tomorrow 9:00', until: () => dayAt(1) },
  { label: 'In 3 days', until: () => dayAt(3) },
  { label: 'Next week', until: () => dayAt(7) },
];

/** "YYYY-MM-DD" for `days` from today on the New York calendar (the API turns a bare date into 09:00 New York). */
export function dayAt(days) {
  return zonedDayAt(days);
}

export const snoozeBody = (opt) => (opt.minutes ? { minutes: opt.minutes } : { until: opt.until() });
