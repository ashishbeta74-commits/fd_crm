'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Pencil } from 'lucide-react';
import { api } from '@/lib/api';
import { pluralize } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/** Renames a list everywhere: the contacts' "sheet", the import history, the saved sheet entry and saved views. */
export function useRenameList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body) => api.sheets.rename(body),
    onSuccess: (r) => {
      for (const key of ['imports', 'contacts', 'contact', 'meta', 'views', 'linkedin', 'stats']) qc.invalidateQueries({ queryKey: [key] });
      toast.success(`Renamed to "${r.to}" · ${pluralize(r.contacts, 'contact')} updated`);
    },
    onError: (err) => toast.error(err?.message || 'Could not rename the list'),
  });
}

/** Pencil button + dialog. `name` is the list name contacts carry; `sheetId` (optional) also renames the saved sheet entry. */
export function RenameListButton({ name, sheetId, variant = 'ghost', size = 'icon-sm', className }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(name);
  const rename = useRenameList();
  const next = value.trim().replace(/\s+/g, ' ');
  const changed = next && next !== name;

  const submit = (e) => {
    e.preventDefault();
    if (!changed) return;
    rename.mutate({ from: name, to: next, sheetId: sheetId || undefined }, { onSuccess: () => setOpen(false) });
  };

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant={variant}
            size={size}
            className={className}
            aria-label={`Rename list ${name}`}
            onClick={() => {
              setValue(name);
              setOpen(true);
            }}
          >
            <Pencil />
            {size === 'icon-sm' || size === 'icon-xs' ? null : 'Rename'}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Rename this list</TooltipContent>
      </Tooltip>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[calc(100%-2rem)] sm:max-w-md">
          <form onSubmit={submit} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Rename list</DialogTitle>
              <DialogDescription className="wrap-break-word">
                Every contact from <strong>{name}</strong> moves to the new name, and the sheet filter, saved views and import history follow. Future syncs keep it.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-1.5">
              <Label htmlFor="rename-list">New name</Label>
              <Input id="rename-list" value={value} onChange={(e) => setValue(e.target.value)} maxLength={120} autoFocus required />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={rename.isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={!changed || rename.isPending}>
                {rename.isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                {rename.isPending ? 'Renaming…' : 'Rename'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
