'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { GitMerge, Loader2, Tag, Trash2, X } from 'lucide-react';
import { CATEGORIES, CATEGORY_STYLES, PRIORITIES, PRIORITY_STYLES, STAGES, STAGE_STYLES, categoryLabel, priorityLabel, stageLabel } from '@/lib/constants';
import { pluralize } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { MergeDialog } from '@/components/contacts/merge-dialog';
import { useBulkContacts } from '@/hooks/use-contact-mutations';
import { useMeta } from '@/hooks/use-meta';

const CLEAR_PRIORITY = '__clear__';
const CLEAR_CATEGORY = '__clear_type__';
const MAX_MERGE = 10;

const Spinner = () => <Loader2 className="animate-spin" aria-hidden />;

/** Add / remove a tag on the selection. Suggests tags that already exist in the CRM. */
function TagsPopover({ onApply, busy }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const { data: meta } = useMeta();
  const known = (meta?.tags || []).slice(0, 12);
  const submit = (action) => {
    const tags = text
      .split(/[,;]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    if (!tags.length) return;
    onApply(action, tags);
    setText('');
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" disabled={busy}>
          <Tag /> Tags
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit('addTags');
          }}
          className="grid gap-3"
        >
          <PopoverHeader>
            <PopoverTitle>Tag the selected contacts</PopoverTitle>
          </PopoverHeader>
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="VIP, NJ, corporate" autoFocus aria-label="Tags to add or remove" />
          {known.length ? (
            <div className="flex flex-wrap gap-1">
              {known.map((t) => (
                <button
                  key={t.tag}
                  type="button"
                  onClick={() => setText((v) => (v.trim() ? `${v.replace(/,\s*$/, '')}, ${t.tag}` : t.tag))}
                  className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {t.tag}
                </button>
              ))}
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => submit('removeTags')} disabled={!text.trim()}>
              Remove
            </Button>
            <Button type="submit" size="sm" disabled={!text.trim()}>
              Add
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

/** Actions for the selected contacts. `onDone` clears the selection after a successful action. */
export function BulkActionsBar({ ids, onDone }) {
  const bulk = useBulkContacts();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [merging, setMerging] = useState(false);
  // Which control is working, so only that one shows a spinner ('stage' | 'priority' | 'delete').
  const [running, setRunning] = useState(null);
  const n = ids.length;
  const busy = bulk.isPending;

  const run = async (action, body, describe) => {
    setRunning(action);
    try {
      const result = await bulk.mutateAsync({ ids, action, ...body });
      // useBulkContacts only toasts errors; success (with counts) is reported here.
      toast.success(describe(result));
      setConfirmDelete(false);
      onDone();
    } catch {
      // useBulkContacts already shows the error toast.
    } finally {
      setRunning(null);
    }
  };

  const moveToStage = (stage) => run('stage', { stage }, (r) => `${pluralize(r.updated ?? n, 'contact')} moved to ${stageLabel(stage)}`);
  const setPriority = (value) => {
    const priority = value === CLEAR_PRIORITY ? '' : value;
    run('priority', { priority }, (r) =>
      priority ? `Priority set to ${priorityLabel(priority)} for ${pluralize(r.updated ?? n, 'contact')}` : `Priority cleared for ${pluralize(r.updated ?? n, 'contact')}`,
    );
  };
  const setCategory = (value) => {
    const category = value === CLEAR_CATEGORY ? '' : value;
    run('category', { category }, (r) =>
      category ? `Type set to ${categoryLabel(category)} for ${pluralize(r.updated ?? n, 'contact')}` : `Type cleared for ${pluralize(r.updated ?? n, 'contact')}`,
    );
  };
  const applyTags = (action, tags) =>
    run(action, { tags }, (r) => `${tags.join(', ')} ${action === 'addTags' ? 'added to' : 'removed from'} ${pluralize(r.updated ?? n, 'contact')}`);
  const remove = () => run('delete', {}, (r) => `${pluralize(r.deleted ?? n, 'contact')} deleted`);

  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-accent/60 px-3 py-2 text-sm motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 motion-safe:duration-200"
      role="region"
      aria-label="Bulk actions"
      aria-busy={busy || undefined}
    >
      <span className="font-medium">{pluralize(n, 'contact')} selected</span>

      {/* value stays '' so the selects act as command pickers and show their placeholder again after use */}
      <Select value="" onValueChange={moveToStage} disabled={busy}>
        <SelectTrigger size="sm" className="w-40" aria-label="Move selected contacts to stage">
          {running === 'stage' ? <Spinner /> : null}
          <SelectValue placeholder="Move to stage…" />
        </SelectTrigger>
        <SelectContent>
          {STAGES.map((s) => (
            <SelectItem key={s.key} value={s.key}>
              <span className={cn('size-2 rounded-full', STAGE_STYLES[s.key].dot)} aria-hidden />
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value="" onValueChange={setPriority} disabled={busy}>
        <SelectTrigger size="sm" className="w-40" aria-label="Set priority for selected contacts">
          {running === 'priority' ? <Spinner /> : null}
          <SelectValue placeholder="Set priority…" />
        </SelectTrigger>
        <SelectContent>
          {PRIORITIES.map((p) => (
            <SelectItem key={p.key} value={p.key}>
              <span className={cn('size-2 rounded-full', PRIORITY_STYLES[p.key].dot)} aria-hidden />
              {p.label}
            </SelectItem>
          ))}
          <SelectSeparator />
          <SelectItem value={CLEAR_PRIORITY}>Clear priority</SelectItem>
        </SelectContent>
      </Select>

      <Select value="" onValueChange={setCategory} disabled={busy}>
        <SelectTrigger size="sm" className="w-44" aria-label="Set type for selected contacts">
          {running === 'category' ? <Spinner /> : null}
          <SelectValue placeholder="Set type…" />
        </SelectTrigger>
        <SelectContent>
          {CATEGORIES.map((c) => (
            <SelectItem key={c.key} value={c.key}>
              <span className={cn('size-2 rounded-full', CATEGORY_STYLES[c.key].dot)} aria-hidden />
              {c.label}
            </SelectItem>
          ))}
          <SelectSeparator />
          <SelectItem value={CLEAR_CATEGORY}>Clear type</SelectItem>
        </SelectContent>
      </Select>

      <TagsPopover onApply={applyTags} busy={busy} />

      {n >= 2 && n <= MAX_MERGE ? (
        <Button size="sm" variant="outline" onClick={() => setMerging(true)} disabled={busy}>
          <GitMerge /> Merge
        </Button>
      ) : null}

      <Button size="sm" variant="destructive" onClick={() => setConfirmDelete(true)} disabled={busy}>
        {running === 'delete' ? <Spinner /> : <Trash2 />}
        Delete
      </Button>

      <Button size="sm" variant="ghost" onClick={onDone} disabled={busy} className="ml-auto">
        <X /> Clear selection
      </Button>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${pluralize(n, 'contact')}?`}
        description="They will be removed permanently, together with their call history and reminders."
        confirmLabel="Delete"
        destructive
        pending={running === 'delete'}
        onConfirm={remove}
      />
      {merging ? <MergeDialog open onOpenChange={(v) => !v && setMerging(false)} ids={ids} onMerged={onDone} /> : null}
    </div>
  );
}
