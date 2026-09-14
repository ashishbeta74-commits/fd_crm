'use client';

import { useState } from 'react';
import { Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { pluralize } from '@/lib/format';
import { useUndoImport } from '@/components/import/use-import-mutations';

/** Undo button with confirmation. onUndone(batch) receives the batch with undoneAt / deletedOnUndo set. */
export function UndoImportButton({ batch, onUndone, label = 'Undo', size = 'sm', variant = 'outline', className }) {
  const undo = useUndoImport();
  const [open, setOpen] = useState(false);
  const created = batch.totals?.created ?? 0;
  const name = batch.source?.listName || batch.fileName;

  return (
    <>
      <Button type="button" size={size} variant={variant} className={className} onClick={() => setOpen(true)} disabled={undo.isPending}>
        <Undo2 /> {label}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Undo this import?"
        description={`The ${pluralize(created, 'contact')} created from "${name}" will be deleted. Contacts that were only updated are kept.`}
        confirmLabel="Undo import"
        destructive
        pending={undo.isPending}
        onConfirm={() =>
          undo.mutate(batch._id, {
            onSuccess: (res) => {
              setOpen(false);
              onUndone?.(res.batch);
            },
          })
        }
      />
    </>
  );
}
