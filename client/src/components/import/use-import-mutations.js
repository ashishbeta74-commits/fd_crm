'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, qk } from '@/lib/api';
import { pluralize } from '@/lib/format';
import { useInvalidateContacts } from '@/hooks/use-contact-mutations';

/** An import (commit, re-sync or undo) changes contacts, stats, follow-ups, meta (sheet names), the history and the linked sheets. */
export function useInvalidateAfterImport() {
  const qc = useQueryClient();
  const invalidateContacts = useInvalidateContacts();
  return () => {
    invalidateContacts();
    // ['imports'] is a prefix of qk.importSources, so this refreshes the linked-sheets list too
    qc.invalidateQueries({ queryKey: qk.imports });
  };
}

/** DELETE /imports/:id - deletes the contacts an import created. Resolves to { deleted, batch }. */
export function useUndoImport() {
  const invalidate = useInvalidateAfterImport();
  return useMutation({
    mutationFn: (id) => api.imports.undo(id),
    onSuccess: ({ deleted }) => {
      invalidate();
      toast.success(`Import undone - ${pluralize(deleted, 'contact')} deleted`);
    },
    onError: (err) => toast.error(err?.message || 'Could not undo the import'),
  });
}

/**
 * POST /imports/:id/resync - re-fetches the linked Google Sheet and re-imports it with the mapping stored on
 * that batch (server defaults: update existing contacts and follow stage changes). Resolves to the new ImportBatch.
 */
export function useResyncImport() {
  const invalidate = useInvalidateAfterImport();
  return useMutation({
    mutationFn: (id) => api.imports.resync(id),
    onSuccess: (batch) => {
      const t = batch.totals || {};
      const name = batch.source?.listName || batch.source?.title || batch.fileName || 'Sheet';
      toast.success(`${name} synced - ${t.created ?? 0} created, ${t.updated ?? 0} updated`);
    },
    onError: (err) => toast.error(err?.message || 'Could not sync the sheet'),
    // a failed sync can still have written some contacts, so refresh either way
    onSettled: () => invalidate(),
  });
}
