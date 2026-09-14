'use client';

import { useState } from 'react';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { GitMerge, Loader2 } from 'lucide-react';
import { api, qk } from '@/lib/api';
import { formatDate, pluralize } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { PriorityBadge, StageBadge, TagList } from '@/components/badges';
import { useInvalidateContacts } from '@/hooks/use-contact-mutations';

const ROWS = [
  { key: 'email', label: 'Email', get: (c) => c.email || c.primaryEmail },
  { key: 'companyName', label: 'Company' },
  { key: 'title', label: 'Title' },
  { key: 'contactMain', label: 'Phone' },
  { key: 'location', label: 'Location' },
  { key: 'stage', label: 'Stage', render: (c) => <StageBadge stage={c.stage} /> },

  { key: 'priority', label: 'Priority', render: (c) => <PriorityBadge priority={c.priority} emptyLabel="—" /> },
  { key: 'tags', label: 'Tags', render: (c) => (c.tags?.length ? <TagList tags={c.tags} max={4} /> : '—') },
  { key: 'followUp', label: 'Follow-up', get: (c) => formatDate(c.followUp) },
  { key: 'sheet', label: 'List', get: (c) => c.source?.sheetName },
  { key: 'activities', label: 'History', get: (c) => `${c.activityCount ?? c.activities?.length ?? 0} entries` },
  { key: 'createdAt', label: 'Created', get: (c) => formatDate(c.createdAt) },
];

/** Most history, then oldest - the same rule the API uses for its suggestion. */
const suggest = (list) => [...list].sort((a, b) => (b.activityCount ?? b.activities?.length ?? 0) - (a.activityCount ?? a.activities?.length ?? 0) || new Date(a.createdAt) - new Date(b.createdAt))[0];

/** Merge hook with an "Undo" action on the success toast. */
export function useMergeContacts() {
  const qc = useQueryClient();
  const invalidate = useInvalidateContacts();
  const invalidateAll = () => {
    invalidate();
    qc.invalidateQueries({ queryKey: ['duplicates'] });
  };
  return useMutation({
    mutationFn: (body) => api.duplicates.merge(body),
    onSuccess: (result) => {
      invalidateAll();
      toast.success(`Merged ${pluralize(result.merged, 'contact')} into ${result.contact?.name || 'the primary contact'}`, {
        duration: 10_000,
        action: {
          label: 'Undo',
          onClick: () =>
            api.duplicates
              .undoMerge(result.mergeId)
              .then(() => {
                invalidateAll();
                toast.success('Merge undone');
              })
              .catch((err) => toast.error(err?.message || 'Could not undo the merge')),
        },
      });
    },
    onError: (err) => toast.error(err?.message || 'Could not merge the contacts'),
  });
}

/**
 * Pick the surviving contact and merge the others into it. Give either `contacts` (summaries) or `ids`
 * (loaded here). Primary values win; gaps are filled from the others; history, tags and reminders are combined.
 */
export function MergeDialog({ open, onOpenChange, contacts: given, ids, suggestedPrimaryId, onMerged }) {
  const queries = useQueries({
    queries: (given ? [] : ids || []).map((id) => ({ queryKey: qk.contact(id), queryFn: () => api.contacts.get(id), enabled: open })),
  });
  const loading = !given && queries.some((q) => q.isPending);
  const contacts = given || queries.map((q) => q.data).filter(Boolean);
  const merge = useMergeContacts();
  const [chosen, setChosen] = useState(null);
  const primaryId = chosen || suggestedPrimaryId || (contacts.length ? String(suggest(contacts)._id) : null);
  const others = contacts.filter((c) => String(c._id) !== primaryId);

  const confirm = async () => {
    try {
      const result = await merge.mutateAsync({ primaryId, mergeIds: others.map((c) => String(c._id)) });
      onOpenChange(false);
      onMerged?.(result);
    } catch {
      /* toasted */
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Merge {pluralize(contacts.length, 'contact')}</DialogTitle>
          <DialogDescription>
            Choose which contact to keep. Its values win; empty fields are filled from the others. Call history, notes, tags and reminders are combined, and the
            other contacts are deleted (you can undo from the confirmation).
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="grid gap-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="w-28 px-3 py-2 text-left text-xs font-medium text-muted-foreground">Field</th>
                  {contacts.map((c) => {
                    const isPrimary = String(c._id) === primaryId;
                    return (
                      <th key={c._id} className={cn('px-3 py-2 text-left align-top', isPrimary && 'bg-primary/5')}>
                        <label className="flex cursor-pointer items-start gap-2">
                          <input type="radio" name="merge-primary" className="mt-1 accent-primary" checked={isPrimary} onChange={() => setChosen(String(c._id))} />
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{c.name || '(no name)'}</span>
                            <span className="block text-xs font-normal text-muted-foreground">{isPrimary ? 'Keep this one' : 'Merge into primary'}</span>
                          </span>
                        </label>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((row) => (
                  <tr key={row.key} className="border-b last:border-0">
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">{row.label}</td>
                    {contacts.map((c) => {
                      const isPrimary = String(c._id) === primaryId;
                      const value = row.render ? row.render(c) : row.get ? row.get(c) : c[row.key];
                      return (
                        <td key={c._id} className={cn('max-w-64 px-3 py-1.5 align-top wrap-break-word', isPrimary && 'bg-primary/5')}>
                          {value || value === 0 ? value : <span className="text-muted-foreground">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={merge.isPending}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={loading || merge.isPending || others.length === 0}>
            {merge.isPending ? <Loader2 className="animate-spin" /> : <GitMerge />}
            {merge.isPending ? 'Merging…' : `Merge ${pluralize(others.length, 'contact')} into primary`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
