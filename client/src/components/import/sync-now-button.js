'use client';

import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useResyncImport } from '@/components/import/use-import-mutations';

/**
 * "Sync now" for a batch that came from a Google Sheet link. Each button owns its mutation, so the pending
 * state is per row. onSynced(batch) receives the new ImportBatch (resyncOf = batchId).
 */
export function SyncNowButton({ batchId, title, onSynced, label = 'Sync now', size = 'sm', variant = 'outline', className }) {
  const resync = useResyncImport();
  const pending = resync.isPending;
  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      className={className}
      disabled={pending}
      aria-busy={pending}
      aria-label={title ? `${label}: ${title}` : undefined}
      onClick={() => resync.mutate(batchId, { onSuccess: (batch) => onSynced?.(batch) })}
    >
      {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
      {pending ? 'Syncing…' : label}
    </Button>
  );
}
