'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, qk } from '@/lib/api';
import { livePoll } from '@/lib/live';

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

export function useUpdateRow() {
  const invalidate = useInvalidateEmailEvaluation();
  return useMutation({ mutationFn: ({ id, data }) => api.emailEvaluation.update(id, data), onSuccess: invalidate, onError: showError });
}

export function useCreateRow() {
  const invalidate = useInvalidateEmailEvaluation();
  return useMutation({ mutationFn: (data) => api.emailEvaluation.create(data), onSuccess: invalidate, onError: showError });
}

export function useRemoveRow() {
  const invalidate = useInvalidateEmailEvaluation();
  return useMutation({ mutationFn: (id) => api.emailEvaluation.remove(id), onSuccess: invalidate, onError: showError });
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
