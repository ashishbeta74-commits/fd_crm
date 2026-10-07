'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, qk } from '@/lib/api';
import { livePoll } from '@/lib/live';

/** The workspace config (fields), filter values in use, tiles, the linked sheet and its last sync. */
export function useWorkspaceMeta(key) {
  return useQuery({ queryKey: qk.workspaceMeta(key), queryFn: () => api.workspaces.meta(key), refetchInterval: livePoll });
}

export function useInvalidateWorkspace(key) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['workspace', key] });
}

const showError = (err) => toast.error(err?.message || 'Something went wrong');

export function useUpdateRow(key) {
  const invalidate = useInvalidateWorkspace(key);
  return useMutation({ mutationFn: ({ id, data }) => api.workspaces.update(key, id, data), onSuccess: invalidate, onError: showError });
}

export function useCreateRow(key) {
  const invalidate = useInvalidateWorkspace(key);
  return useMutation({ mutationFn: (data) => api.workspaces.create(key, data), onSuccess: invalidate, onError: showError });
}

export function useRemoveRow(key) {
  const invalidate = useInvalidateWorkspace(key);
  return useMutation({ mutationFn: (id) => api.workspaces.remove(key, id), onSuccess: invalidate, onError: showError });
}

export function useSyncSheet(key) {
  const invalidate = useInvalidateWorkspace(key);
  return useMutation({
    mutationFn: () => api.workspaces.sync(key),
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

export function useSetSheet(key) {
  const invalidate = useInvalidateWorkspace(key);
  return useMutation({ mutationFn: (body) => api.workspaces.setSheet(key, body), onSuccess: invalidate, onError: showError });
}
