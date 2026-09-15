'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BookOpen, Check, ChevronDown, ChevronUp, CircleAlert, Copy, Loader2, MessageCircleQuestion, Pencil, Plus, RotateCcw, Search, Trash2 } from 'lucide-react';
import { api, qk } from '@/lib/api';
import { pluralize, timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog } from '@/components/confirm-dialog';

const KINDS = {
  script: { label: 'Phone scripts', one: 'script', icon: BookOpen, titleLabel: 'Script name', bodyLabel: 'Script', titlePlaceholder: 'Opening – travel advisor', bodyPlaceholder: 'Hi [first name], this is [your name] from Famous Drive…', categories: ['Opening', 'Voicemail', 'Follow-up', 'Closing', 'Other'] },
  qa: { label: 'Q&A', one: 'Q&A entry', icon: MessageCircleQuestion, titleLabel: 'Question / objection', bodyLabel: 'Answer', titlePlaceholder: '"We already have a car service."', bodyPlaceholder: 'Great – most people do. I’m not asking you to switch…', categories: ['Objections', 'Pricing', 'Service', 'Booking', 'Other'] },
};

// Long entries are clipped to this many lines until "Show more".
const CLAMP_LINES = 6;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function useScriptMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: qk.scripts });
  const onError = (err) => toast.error(err?.message || 'Could not save');
  return {
    create: useMutation({ mutationFn: (b) => api.scripts.create(b), onSuccess: invalidate, onError }),
    update: useMutation({ mutationFn: ({ id, data }) => api.scripts.update(id, data), onSuccess: invalidate, onError }),
    remove: useMutation({ mutationFn: (id) => api.scripts.remove(id), onSuccess: invalidate, onError }),
    restore: useMutation({ mutationFn: () => api.scripts.restore(), onSuccess: invalidate, onError }),
  };
}

/** Copies text to the clipboard and shows a tick for a moment. */
function CopyButton({ text, label }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {
      toast.error('Could not copy');
    }
  };
  return (
    <Button size="sm" variant="outline" onClick={copy} aria-label={`Copy ${label}`}>
      {done ? <Check className="text-emerald-600" /> : <Copy />}
      {done ? 'Copied' : 'Copy'}
    </Button>
  );
}

/** Create / edit dialog. The labels follow the kind (script vs question / answer). */
function ScriptDialog({ open, onOpenChange, kind, item, knownCategories }) {
  const { create, update } = useScriptMutations();
  const def = KINDS[kind];
  const editing = Boolean(item?._id);
  const [form, setForm] = useState({ title: item?.title || '', category: item?.category || '', body: item?.body || '' });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const pending = create.isPending || update.isPending;
  const suggestions = [...new Set([...def.categories, ...knownCategories])];

  const submit = async (e) => {
    e.preventDefault();
    const data = { kind, title: form.title.trim(), category: form.category.trim(), body: form.body };
    try {
      if (editing) await update.mutateAsync({ id: item._id, data });
      else await create.mutateAsync(data);
      toast.success(editing ? `${cap(def.one)} saved` : `${cap(def.one)} added`);
      onOpenChange(false);
    } catch {
      /* toasted by the mutation */
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${def.one}` : `New ${def.one}`}</DialogTitle>
            <DialogDescription>{kind === 'script' ? 'Write it the way you would say it. Use [brackets] for things to fill in on the call.' : 'The question or objection as they say it, and the answer that works.'}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
            <div className="grid gap-1.5">
              <Label htmlFor="sc-title">{def.titleLabel}</Label>
              <Input id="sc-title" value={form.title} onChange={set('title')} placeholder={def.titlePlaceholder} maxLength={200} required autoFocus={!editing} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sc-category">Category</Label>
              <Input id="sc-category" value={form.category} onChange={set('category')} list="sc-categories" placeholder="Opening" maxLength={40} />
              <datalist id="sc-categories">
                {suggestions.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="sc-body">{def.bodyLabel}</Label>
            <Textarea id="sc-body" value={form.body} onChange={set('body')} rows={12} placeholder={def.bodyPlaceholder} className="text-[15px] leading-relaxed" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !form.title.trim()}>
              {pending ? <Loader2 className="animate-spin" /> : null}
              {editing ? 'Save' : `Add ${def.one}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ScriptCard({ item, kind, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const long = (item.body || '').split('\n').length > CLAMP_LINES || (item.body || '').length > 600;
  const isQa = kind === 'qa';
  return (
    <li className="grid min-w-0 gap-3 rounded-lg border bg-card p-4 transition-shadow hover:shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className={cn('font-medium', isQa && 'text-[15px]')}>{item.title}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {item.category ? (
              <Badge variant="outline" className="font-normal">
                {item.category}
              </Badge>
            ) : null}
            {item.builtIn ? (
              <Badge variant="secondary" className="font-normal">
                built-in
              </Badge>
            ) : null}
            {item.updatedBy ? (
              <span suppressHydrationWarning>
                {item.updatedBy} · {timeAgo(item.updatedAt)}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <CopyButton text={isQa ? `${item.title}\n${item.body}` : item.body} label={item.title} />
          <Button size="sm" variant="ghost" onClick={() => onEdit(item)} aria-label={`Edit ${item.title}`} title="Edit">
            <Pencil />
          </Button>
          <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => onDelete(item)} aria-label={`Delete ${item.title}`} title="Delete">
            <Trash2 />
          </Button>
        </div>
      </div>
      <div className={cn('rounded-md bg-muted/40 px-3 py-2', isQa && 'border-l-2 border-primary/50')}>
        <pre className="font-sans text-[15px] leading-relaxed whitespace-pre-wrap wrap-break-word" style={!expanded && long ? { display: '-webkit-box', WebkitLineClamp: CLAMP_LINES, WebkitBoxOrient: 'vertical', overflow: 'hidden' } : undefined}>
          {item.body || <span className="text-muted-foreground">(empty)</span>}
        </pre>
        {long ? (
          <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            {expanded ? 'Show less' : 'Show more'}
          </button>
        ) : null}
      </div>
    </li>
  );
}

function ScriptsSkeleton() {
  return (
    <div className="grid gap-3" aria-busy>
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-40 w-full" />
      ))}
    </div>
  );
}

export function ScriptsView() {
  const { data, isPending, isError, error, refetch } = useQuery({ queryKey: qk.scripts, queryFn: api.scripts.list });
  const { remove, restore } = useScriptMutations();
  const [kind, setKind] = useState('script');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [dialog, setDialog] = useState(null); // { mode: 'edit' | 'delete', item }
  const def = KINDS[kind];
  const items = useMemo(() => (data?.items || []).filter((s) => s.kind === kind), [data, kind]);
  const categories = useMemo(() => [...new Set(items.map((s) => s.category).filter(Boolean))], [items]);
  const term = q.trim().toLowerCase();
  const shown = items.filter((s) => (!category || s.category === category) && (!term || `${s.title}\n${s.body}\n${s.category}`.toLowerCase().includes(term)));
  const missingBuiltIns = data ? Math.max(0, (data.builtInCount || 0) - (data.items || []).filter((s) => s.builtIn).length) : 0;
  const counts = { script: (data?.items || []).filter((s) => s.kind === 'script').length, qa: (data?.items || []).filter((s) => s.kind === 'qa').length };
  const switchKind = (k) => {
    setKind(k);
    setCategory('');
  };

  return (
    <div className="grid grid-cols-1 gap-4 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300">
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={kind} onValueChange={switchKind}>
          <TabsList>
            {Object.entries(KINDS).map(([k, d]) => (
              <TabsTrigger key={k} value={k}>
                <d.icon /> {d.label} ({counts[k]})
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${def.label.toLowerCase()}…`} aria-label={`Search ${def.label}`} className="pl-8" />
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto">
          {missingBuiltIns ? (
            <Button variant="outline" onClick={() => restore.mutate(undefined, { onSuccess: (r) => toast.success(`${pluralize(r.added, 'built-in entry', 'built-in entries')} restored`) })} disabled={restore.isPending}>
              {restore.isPending ? <Loader2 className="animate-spin" /> : <RotateCcw />}
              Restore built-ins ({missingBuiltIns})
            </Button>
          ) : null}
          <Button onClick={() => setDialog({ mode: 'edit', item: null })}>
            <Plus /> New {def.one}
          </Button>
        </div>
      </div>

      {categories.length ? (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Category">
          <Button size="sm" variant={category ? 'outline' : 'secondary'} onClick={() => setCategory('')}>
            All
          </Button>
          {categories.map((c) => (
            <Button key={c} size="sm" variant={category === c ? 'secondary' : 'outline'} onClick={() => setCategory(category === c ? '' : c)}>
              {c} <span className="text-muted-foreground">{items.filter((s) => s.category === c).length}</span>
            </Button>
          ))}
        </div>
      ) : null}

      {isError ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Could not load the scripts</AlertTitle>
          <AlertDescription>
            <p>{error.message}</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : isPending ? (
        <ScriptsSkeleton />
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-4 py-16 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-muted">
            <def.icon className="size-6 text-muted-foreground" aria-hidden />
          </span>
          <div>
            <h2 className="text-base font-semibold">{term || category ? `No ${def.label.toLowerCase()} match` : `No ${def.label.toLowerCase()} yet`}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{term || category ? 'Try another word or clear the category.' : `Add the first ${def.one}, or restore the built-in set.`}</p>
          </div>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {shown.map((s) => (
            <ScriptCard key={s._id} item={s} kind={kind} onEdit={(x) => setDialog({ mode: 'edit', item: x })} onDelete={(x) => setDialog({ mode: 'delete', item: x })} />
          ))}
        </ul>
      )}

      {dialog?.mode === 'edit' ? <ScriptDialog key={dialog.item?._id || 'new'} open onOpenChange={(v) => !v && setDialog(null)} kind={kind} item={dialog.item} knownCategories={categories} /> : null}
      <ConfirmDialog
        open={dialog?.mode === 'delete'}
        onOpenChange={(v) => !v && setDialog(null)}
        title={`Delete this ${def.one}?`}
        description={dialog?.item ? `"${dialog.item.title}" will be removed.${dialog.item.builtIn ? ' Built-in entries can be restored later.' : ''}` : ''}
        confirmLabel="Delete"
        destructive
        pending={remove.isPending}
        onConfirm={() =>
          remove.mutate(dialog.item._id, {
            onSuccess: () => {
              toast.success(`${cap(def.one)} deleted`);
              setDialog(null);
            },
          })
        }
      />
    </div>
  );
}
