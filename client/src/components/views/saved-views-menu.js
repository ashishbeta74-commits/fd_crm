'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Bookmark, BookmarkCheck, Check, ChevronDown, Loader2, Pencil, Pin, PinOff, Plus, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { VIEW_KEYS } from '@/components/contacts/list/contact-filters';
import { findActiveView, useViewMutations, useViews, viewParams } from '@/components/views/use-views';
import { cn } from '@/lib/utils';

const ACTIVE = 'border-primary/40 bg-accent text-accent-foreground';

/** Name prompt used for "Save current view" and "Rename". */
function NameDialog({ open, onOpenChange, title, description, initial = '', submitLabel = 'Save', pending, onSubmit, error }) {
  const [name, setName] = useState(initial);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-sm">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) onSubmit(name.trim());
          }}
          className="grid gap-4"
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="view-name">View name</Label>
            <Input id="view-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Fora - overdue voicemails" maxLength={60} autoFocus required />
            {error ? (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * "Views" menu on the Contacts toolbar: apply a saved view, save the current filters as a new view,
 * update the active view, rename / pin / delete. The active view is the one whose filters equal the URL.
 */
export function SavedViewsMenu({ params, setParams }) {
  const { data } = useViews();
  const { create, update, remove } = useViewMutations();
  const views = data?.items || [];
  const active = findActiveView(views, params);
  const current = viewParams(params);
  const hasFilters = Object.keys(current).length > 0;
  const [dialog, setDialog] = useState(null); // { kind: 'save' | 'rename' | 'delete', view? }
  const [error, setError] = useState('');
  const close = () => {
    setDialog(null);
    setError('');
  };

  const apply = (view) => {
    // Clear every view key first so filters missing from the view are removed, then set the view's ones.
    const patch = Object.fromEntries(VIEW_KEYS.map((k) => [k, '']));
    setParams({ ...patch, ...(view.params || {}) });
  };

  const save = async (name) => {
    try {
      const v = await create.mutateAsync({ name, params: current });
      toast.success(`View "${v.name}" saved`);
      close();
    } catch (err) {
      setError(err?.message || 'Could not save the view');
    }
  };
  const rename = async (name) => {
    try {
      await update.mutateAsync({ id: dialog.view._id, data: { name } });
      toast.success('View renamed');
      close();
    } catch (err) {
      setError(err?.message || 'Could not rename the view');
    }
  };
  const overwrite = (view) =>
    update.mutate({ id: view._id, data: { params: current } }, { onSuccess: () => toast.success(`View "${view.name}" updated with the current filters`) });
  const togglePin = (view) => update.mutate({ id: view._id, data: { pinned: !view.pinned } }, { onSuccess: () => toast.success(view.pinned ? 'Removed from the sidebar' : 'Pinned to the sidebar') });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className={cn('max-w-56 font-normal transition-colors duration-200', active && ACTIVE)} aria-label="Saved views">
            {active ? <BookmarkCheck className="text-primary" /> : <Bookmark />}
            <span className="truncate">{active ? active.name : 'Views'}</span>
            <ChevronDown className="opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>Saved views</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {views.length ? (
            views.map((v) => (
              <DropdownMenuSub key={v._id}>
                <div className="flex items-center">
                  <DropdownMenuItem onSelect={() => apply(v)} className="min-w-0 flex-1">
                    {active?._id === v._id ? <Check className="text-primary" /> : <span className="size-4" aria-hidden="true" />}
                    <span className="truncate">{v.name}</span>
                    {v.pinned ? <Pin className="ml-auto size-3 text-muted-foreground" aria-label="Pinned" /> : null}
                  </DropdownMenuItem>
                  <DropdownMenuSubTrigger className="w-8 justify-center px-0" aria-label={`Manage ${v.name}`} />
                </div>
                <DropdownMenuSubContent>
                  <DropdownMenuItem onSelect={() => overwrite(v)} disabled={!hasFilters || active?._id === v._id}>
                    <Save /> Update with current filters
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setDialog({ kind: 'rename', view: v })}>
                    <Pencil /> Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => togglePin(v)}>
                    {v.pinned ? <PinOff /> : <Pin />} {v.pinned ? 'Unpin from sidebar' : 'Pin to sidebar'}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => setDialog({ kind: 'delete', view: v })}>
                    <Trash2 /> Delete
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ))
          ) : (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">No saved views yet. Set some filters, then save them here.</p>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setDialog({ kind: 'save' })} disabled={!hasFilters || Boolean(active)}>
            <Plus /> {active ? 'Current filters already saved' : hasFilters ? 'Save current view…' : 'Set filters to save a view'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {dialog?.kind === 'save' ? (
        <NameDialog open onOpenChange={(v) => !v && close()} title="Save view" description="The current search, filters and sort order are saved under this name." pending={create.isPending} onSubmit={save} error={error} />
      ) : null}
      {dialog?.kind === 'rename' ? (
        <NameDialog key={dialog.view._id} open onOpenChange={(v) => !v && close()} title="Rename view" initial={dialog.view.name} submitLabel="Rename" pending={update.isPending} onSubmit={rename} error={error} />
      ) : null}
      <ConfirmDialog
        open={dialog?.kind === 'delete'}
        onOpenChange={(v) => !v && close()}
        title="Delete this view?"
        description={dialog?.view ? `"${dialog.view.name}" will be removed. Contacts are not affected.` : ''}
        confirmLabel="Delete"
        destructive
        pending={remove.isPending}
        onConfirm={() =>
          remove.mutate(dialog.view._id, {
            onSuccess: () => {
              toast.success('View deleted');
              close();
            },
          })
        }
      />
    </>
  );
}
