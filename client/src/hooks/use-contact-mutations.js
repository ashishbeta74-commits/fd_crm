'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';

// `meta` carries the sheet / tag / place / lead-quality filter lists and is the slowest query in the
// app; `duplicates` rescans the collection. Neither can change unless one of these fields was written,
// so an ordinary edit (a stage change, a follow-up) no longer waits on them.
const META_FIELDS = ['tags', 'city', 'state', 'country', 'leadQuality', 'location'];
const DUPLICATE_FIELDS = ['name', 'email', 'primaryEmail', 'secondaryEmail', 'companyName', 'contactMain', 'companyNo'];
const touches = (changed, fields) => !changed || fields.some((f) => changed[f] !== undefined);

/**
 * Invalidate the queries that show contact data (lists, detail, dashboard, follow-ups).
 * Pass the fields that were just written and the two expensive queries are only refetched when they
 * can actually differ; omit them (create / delete / bulk / merge) and everything is refetched.
 */
export function useInvalidateContacts() {
  const qc = useQueryClient();
  return (id, changed) => {
    qc.invalidateQueries({ queryKey: ['contacts'] });
    qc.invalidateQueries({ queryKey: ['stats'] });
    qc.invalidateQueries({ queryKey: ['followups'] });
    qc.invalidateQueries({ queryKey: ['reminders'] });
    if (touches(changed, META_FIELDS)) qc.invalidateQueries({ queryKey: ['meta'] });
    if (touches(changed, DUPLICATE_FIELDS)) qc.invalidateQueries({ queryKey: ['duplicates'] });
    if (id) qc.invalidateQueries({ queryKey: ['contact', id] });
  };
}

const showError = (err) => toast.error(err?.message || 'Something went wrong');

/** Merge `data` into every cached copy of one contact, so an edit shows before the server answers. */
function patchCached(qc, id, data) {
  const fields = { ...data };
  delete fields.allowDuplicate;
  qc.setQueriesData({ queryKey: ['contacts'] }, (old) => (old?.items ? { ...old, items: old.items.map((c) => (c._id === id ? { ...c, ...fields } : c)) } : old));
  qc.setQueryData(['contact', id], (old) => (old ? { ...old, ...fields } : old));
}

/** Apply `fn` (contact => contact | null to drop it) to every cached list row whose id is in `ids`. */
function patchRows(qc, ids, fn) {
  const set = new Set(ids);
  qc.setQueriesData({ queryKey: ['contacts'] }, (old) => {
    if (!old?.items) return old;
    let dropped = 0;
    const items = [];
    for (const c of old.items) {
      const next = set.has(c._id) ? fn(c) : c;
      if (next) items.push(next);
      else dropped += 1;
    }
    return dropped ? { ...old, items, total: Math.max(0, old.total - dropped) } : { ...old, items };
  });
}

/** What a bulk action does to one row, for the optimistic preview (null = the row goes away). */
function bulkPreview({ action, stage, priority, category, leadQuality, tags = [] }) {
  const lower = new Set(tags.map((t) => t.toLowerCase()));
  return (c) => {
    if (action === 'delete') return null;
    if (action === 'stage') return { ...c, stage };
    if (action === 'priority') return { ...c, priority };
    if (action === 'category') return { ...c, category };
    if (action === 'leadQuality') return { ...c, leadQuality };
    if (action === 'addTags') {
      const have = new Set((c.tags || []).map((t) => t.toLowerCase()));
      return { ...c, tags: [...(c.tags || []), ...tags.filter((t) => !have.has(t.toLowerCase()))] };
    }
    if (action === 'removeTags') return { ...c, tags: (c.tags || []).filter((t) => !lower.has(t.toLowerCase())) };
    return c;
  };
}

/** Snapshot the cached contact lists + detail so a failed edit can be rolled back. */
async function snapshot(qc, id) {
  await qc.cancelQueries({ queryKey: ['contacts'] });
  return { id, lists: qc.getQueriesData({ queryKey: ['contacts'] }), detail: qc.getQueryData(['contact', id]) };
}

function rollback(qc, ctx) {
  if (!ctx) return;
  for (const [key, value] of ctx.lists) qc.setQueryData(key, value);
  qc.setQueryData(['contact', ctx.id], ctx.detail);
}

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
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => api.contacts.update(id, data),
    // The row changes at once and the server confirms behind it: over a slow link the save itself
    // takes a second or more, and nobody should watch a spinner for a dropdown.
    onMutate: async ({ id, data }) => {
      const ctx = await snapshot(qc, id);
      patchCached(qc, id, data);
      return ctx;
    },
    onError: (err, vars, ctx) => {
      rollback(qc, ctx);
      showError(err);
    },
    onSuccess: (doc, { data }) => invalidate(doc._id, data),
  });
}

/** POST /contacts/:id/activities - log a call or add a note (optionally moving stage / setting dates). */
/** What a logged call / follow-up changes on the contact itself, for the optimistic preview. */
function activityPreview(data) {
  const patch = {};
  if (data.stage) patch.stage = data.stage;
  if (data.booking) patch.booking = { date: data.booking.date || null, time: data.booking.time || '', note: data.booking.note || '' };
  if (data.type === 'call' || data.type === 'followup') patch.lastContactedAt = new Date().toISOString();
  if (data.type === 'followup') {
    // a follow-up round sets the next date, or clears it when nothing further is planned
    patch.followUp = data.followUp || null;
    patch.followUpNote = data.followUp ? data.followUpNote || '' : '';
  } else {
    if (data.followUp !== undefined) patch.followUp = data.followUp || null;
    if (data.followUpNote !== undefined) patch.followUpNote = data.followUpNote || '';
  }
  return patch;
}

export function useLogActivity() {
  const invalidate = useInvalidateContacts();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => api.contacts.addActivity(id, data),
    // Same as an edit: the row shows the result at once, the server confirms behind it.
    onMutate: async ({ id, data }) => {
      const ctx = await snapshot(qc, id);
      patchCached(qc, id, activityPreview(data));
      return ctx;
    },
    onError: (err, vars, ctx) => {
      rollback(qc, ctx);
      showError(err);
    },
    // a call / note never moves the filter lists or the duplicate scan
    onSuccess: (doc, { data }) => invalidate(doc._id, data),
  });
}

/** DELETE /contacts/:id/followups/last - take back the most recent "Add follow-up" (counter - 1). */
export function useRemoveLastFollowUp() {
  const invalidate = useInvalidateContacts();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.contacts.removeLastFollowUp(id),
    // the counter drops at once; "last contacted" and the history come back with the server's answer
    onMutate: async (id) => {
      const ctx = await snapshot(qc, id);
      patchRows(qc, [id], (c) => ({ ...c, followUpCount: Math.max(0, (c.followUpCount || 0) - 1) }));
      qc.setQueryData(['contact', id], (old) => (old ? { ...old, followUpCount: Math.max(0, (old.followUpCount || 0) - 1) } : old));
      return ctx;
    },
    onError: (err, id, ctx) => {
      rollback(qc, ctx);
      showError(err);
    },
    onSuccess: (doc) => invalidate(doc._id),
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
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.contacts.remove(id),
    // the row leaves the list at once and comes back if the server refuses
    onMutate: async (id) => {
      const ctx = await snapshot(qc, id);
      patchRows(qc, [id], () => null);
      return ctx;
    },
    onError: (err, id, ctx) => {
      rollback(qc, ctx);
      showError(err);
    },
    onSuccess: (_, id) => {
      qc.removeQueries({ queryKey: ['contact', id] });
      invalidate();
      toast.success('Contact deleted');
    },
  });
}

export function useBulkContacts() {
  const invalidate = useInvalidateContacts();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => api.contacts.bulk(body),
    // every selected row shows the change at once; the lists are re-read when the server confirms
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: ['contacts'] });
      const lists = qc.getQueriesData({ queryKey: ['contacts'] });
      patchRows(qc, body.ids, bulkPreview(body));
      return { lists };
    },
    onError: (err, body, ctx) => {
      for (const [key, value] of ctx?.lists || []) qc.setQueryData(key, value);
      showError(err);
    },
    onSuccess: () => invalidate(),
  });
}
