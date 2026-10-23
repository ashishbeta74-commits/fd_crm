'use client';

import { createContext, useContext } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, qk } from '@/lib/api';
import { livePoll } from '@/lib/live';
import { pluralize } from '@/lib/format';

/** The ticked rows (useSelection). A change made on a ticked row goes to every ticked row. */
export const SelectionContext = createContext(null);

/** id -> the ticked ids when the row is one of several ticked, else null (just this row). */
function useTargets() {
  const sel = useContext(SelectionContext);
  return (id) => (sel && sel.ids.length > 1 && sel.selected.has(id) ? sel.ids : null);
}

/** How many rows a change on this row goes to (0 = just this one). */
export function useTicked(id) {
  return useTargets()(id)?.length || 0;
}

/** The success toast: `message` for one row, "Done on N rows" (+ the skipped ones) for a change on the ticked rows. */
export function doneToast(r, message) {
  if (!r?.bulk) return toast.success(message);
  if (r.done) toast.success(`${message} - ${pluralize(r.done, 'row')}`);
  if (r.skipped?.length) toast.warning(`Skipped ${pluralize(r.skipped.length, 'row')}: ${r.skipped.slice(0, 3).map((x) => `${x.clientName || '(no name)'} (${x.error})`).join('; ')}${r.skipped.length > 3 ? ' ...' : ''}`);
}

const bulk = (ids, body) => api.emailEvaluation.bulk({ ids, ...body }).then((r) => ({ ...r, bulk: true }));

/** Filter lists (tabs, years), headline counts, the linked sheet and its last sync. */
export function useEmailEvaluationMeta() {
  return useQuery({ queryKey: qk.emailEvaluationMeta, queryFn: api.emailEvaluation.meta, refetchInterval: livePoll });
}

/** Every query on the Email Evaluation page (the list and the meta / counts). */
export function useInvalidateEmailEvaluation() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['email-evaluation'] });
}

const showError = (err) => toast.error(err?.message || 'Something went wrong');

/** Edit a row; with `{ many: true }` (the table cells) an edit on a ticked row goes to all ticked rows. */
export function useUpdateRow({ many = false } = {}) {
  const invalidate = useInvalidateEmailEvaluation();
  const targets = useTargets();
  return useMutation({
    mutationFn: ({ id, data }) => {
      const ids = many && targets(id);
      return ids ? bulk(ids, { action: 'update', data }) : api.emailEvaluation.update(id, data);
    },
    onSuccess: invalidate,
    onError: showError,
  });
}

export function useCreateRow() {
  const invalidate = useInvalidateEmailEvaluation();
  return useMutation({ mutationFn: (data) => api.emailEvaluation.create(data), onSuccess: invalidate, onError: showError });
}

export function useRemoveRow() {
  const invalidate = useInvalidateEmailEvaluation();
  const targets = useTargets();
  const sel = useContext(SelectionContext);
  return useMutation({
    mutationFn: (id) => {
      const ids = targets(id);
      return ids ? bulk(ids, { action: 'delete' }) : api.emailEvaluation.remove(id);
    },
    onSuccess: (r) => {
      if (r?.bulk) sel?.clear();
      invalidate();
    },
    onError: showError,
  });
}

/** Log the next follow-up send ({ id, channel }) / take back the last one logged here (id). */
export function useLogSend() {
  const invalidate = useInvalidateEmailEvaluation();
  const targets = useTargets();
  return useMutation({
    mutationFn: ({ id, ...body }) => {
      const ids = targets(id);
      return ids ? bulk(ids, { action: 'send', ...body }) : api.emailEvaluation.logSend(id, body);
    },
    onSuccess: invalidate,
    onError: showError,
  });
}

export function useUndoSend() {
  const invalidate = useInvalidateEmailEvaluation();
  const targets = useTargets();
  return useMutation({
    mutationFn: (id) => {
      const ids = targets(id);
      return ids ? bulk(ids, { action: 'undo' }) : api.emailEvaluation.undoSend(id);
    },
    onSuccess: invalidate,
    onError: showError,
  });
}

/** "Sync now": re-reads the sheet; the toast says what changed. */
export function useSyncSheet() {
  const invalidate = useInvalidateEmailEvaluation();
  return useMutation({
    mutationFn: () => api.emailEvaluation.sync(),
    onSuccess: (r) => {
      invalidate();
      const parts = [];
      if (r.created) parts.push(`${r.created} new`);
      if (r.updated) parts.push(`${r.updated} updated`);
      if (r.removed) parts.push(`${r.removed} removed`);
      toast.success(parts.length ? `Sheet synced: ${parts.join(', ')}` : `Sheet synced - ${r.total} rows, nothing changed`);
    },
    onError: showError,
  });
}

export function useSetSheet() {
  const invalidate = useInvalidateEmailEvaluation();
  return useMutation({ mutationFn: (body) => api.emailEvaluation.setSheet(body), onSuccess: invalidate, onError: showError });
}
